from pathlib import Path
import json
import re
import sys
import warnings

from openpyxl import load_workbook
from openpyxl.formula.tokenizer import Tokenizer
from openpyxl.utils.datetime import to_excel


ROOT = Path(__file__).parent
SOURCES = {
    'changle-vip': '26.10_长乐金生【尊享版】_演算表.xlsx',
    'suixiang-vip': '26.10_岁享福（至尊版）_演算表.xlsx',
    'zhenpin-e': '26.07_臻品世家E计划_演算表.xlsx',
    'changle': '26.07_长乐金生计划_演算表2.0.xlsx',
    'suixiang': '26.07_岁享福增额寿_演算器.xlsx',
}
TABLES = {'基础数据', '基本保额对应部分', '交清增额对应部分'}
PRECEDENCE = {'=': 1, '<>': 1, '<': 1, '<=': 1, '>': 1, '>=': 1,
              '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5}


class Formula:
    def __init__(self, formula):
        self.tokens = [item for item in Tokenizer(formula).items if item.type != 'WHITE-SPACE']
        self.at = 0

    def peek(self):
        return self.tokens[self.at] if self.at < len(self.tokens) else None

    def pop(self):
        token = self.peek()
        if token is None:
            raise ValueError('unexpected end of formula')
        self.at += 1
        return token

    def expression(self, minimum=0):
        token = self.pop()
        if token.type == 'OPERATOR-PREFIX':
            node = ['prefix', token.value, self.expression(6)]
        elif token.type == 'PAREN' and token.subtype == 'OPEN':
            node = self.expression()
            if self.peek() and self.peek().value == ',':
                union = ['union', node]
                while self.peek() and self.peek().value == ',':
                    self.pop()
                    union.append(self.expression())
                node = union
            if self.pop().subtype != 'CLOSE':
                raise ValueError('unclosed parenthesis')
        elif token.type == 'FUNC' and token.subtype == 'OPEN':
            node = ['fn', token.value[:-1].upper()]
            while True:
                item = self.peek()
                if item is None:
                    raise ValueError('unclosed function')
                if item.subtype == 'CLOSE':
                    self.pop()
                    break
                if item.type == 'SEP':
                    node.append(None)
                else:
                    node.append(self.expression())
                if self.peek() and self.peek().type == 'SEP':
                    self.pop()
                    if self.peek() and self.peek().subtype == 'CLOSE':
                        node.append(None)
                elif not self.peek() or self.peek().subtype != 'CLOSE':
                    raise ValueError('invalid function separator')
        elif token.type == 'OPERAND':
            value = token.value
            if token.subtype == 'RANGE':
                node = ['ref', value]
            elif token.subtype == 'NUMBER':
                node = float(value) if re.search(r'[.Ee]', value) else int(value)
            elif token.subtype == 'TEXT':
                node = value[1:-1].replace('""', '"')
            elif token.subtype == 'LOGICAL':
                node = value.upper() == 'TRUE'
            else:
                node = ['err', value]
        else:
            raise ValueError(f'unsupported token {token.type} {token.value}')
        while (next_token := self.peek()) is not None:
            if next_token.type == 'OPERATOR-POSTFIX' and minimum <= 7:
                node = ['percent', node]
                self.pop()
                continue
            precedence = PRECEDENCE.get(next_token.value, -1)
            if next_token.type != 'OPERATOR-INFIX' or precedence < minimum:
                break
            self.pop()
            node = [next_token.value, node, self.expression(precedence + 1)]
        return node

    def parse(self):
        value = self.expression()
        if self.peek() is not None:
            raise ValueError('unparsed formula suffix')
        return value


def cell_value(cell):
    value = cell.value
    if cell.data_type == 'f':
        return Formula(value).parse()
    if cell.data_type == 'e':
        return ['err', value]
    if value is not None and not isinstance(value, (str, bool, int, float)):
        return to_excel(value)
    return value


def rows_for(sheet):
    rows = []
    for row in sheet.iter_rows():
        values = []
        for cell in row:
            try:
                values.append(cell_value(cell))
            except Exception as error:
                raise ValueError(f'{sheet.title}!{cell.coordinate} {cell.value}') from error
        while values and values[-1] is None:
            values.pop()
        rows.append(values)
    while rows and not rows[-1]:
        rows.pop()
    return rows


def compile_source(path, product):
    source = load_workbook(path, read_only=True, data_only=False, keep_links=False)
    cached = load_workbook(path, read_only=True, data_only=True, keep_links=False)
    names = {key.lower(): value.attr_text for key, value in source.defined_names.items()}
    sheets = {}
    for sheet in source.worksheets:
        if sheet.title in {'年化收益率预估表', 'Sheet1', 'Sheet2'} and sheet.max_row < 200:
            continue
        static = sheet.title in TABLES
        rows = rows_for(cached[sheet.title] if static else sheet)
        sheets[sheet.title] = {'static': static, 'rows': rows}
    source.close()
    cached.close()
    output = ROOT / 'models' / f'{product}.json'
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps({'names': names, 'sheets': sheets}, ensure_ascii=False,
                                 separators=(',', ':'), allow_nan=False), encoding='utf-8')
    print(f'{product}: {len(sheets)} sheets, {output.stat().st_size} bytes', flush=True)


if __name__ == '__main__':
    warnings.simplefilter('ignore', UserWarning)
    directory = Path(sys.argv[1])
    products = sys.argv[2:] or SOURCES.keys()
    for product in products:
        compile_source(directory / SOURCES[product], product)
