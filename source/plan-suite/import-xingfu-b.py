"""Extract the 26.11 workbook's inputs needed by the B product calculator."""

import json
import sys
from collections import defaultdict
from pathlib import Path

from openpyxl import load_workbook


def extract(book):
    terms = {1: 80, 3: 75, 5: 70, 10: 55, 15: 50, 20: 45}
    groups = defaultdict(list)
    for row in book['基础数据'].iter_rows(min_row=4, max_col=15, values_only=True):
        key, term, sex, age, year = row[:5]
        if term not in terms or sex not in ('M', 'F') or not isinstance(age, int):
            continue
        if not 0 <= age <= terms[term] or key != f'{age}{sex}{term}_{year}':
            raise ValueError(f'Invalid source key: {key}')
        years = groups[f'{age}{sex}{term}']
        if year != len(years) + 1:
            raise ValueError(f'Unexpected policy year: {key}')
        # G premium, J illustrated dividend, L annuity, N death, O cash value.
        years.append([row[i] or 0 for i in (6, 9, 11, 13, 14)])

    basic = list(book['基本保险金额表'].values)
    factors = list(book['一次性领取选择权倍数'].values)
    cases = {}
    for index, (term, max_age) in enumerate(terms.items()):
        for age in range(max_age + 1):
            for sex_index, sex in enumerate(('M', 'F')):
                key = f'{age}{sex}{term}'
                col = 1 + 2 * index + sex_index
                rows = groups[key]
                if len(rows) != 106 - age or not basic[age + 2][col] > 0:
                    raise ValueError(f'Incomplete source values: {key}')
                choices = {}
                for receive, first, last in ((60, 5, 59), (70, 69, 134), (80, 144, 215)):
                    if first + age <= last:
                        line = factors[first + age - 1]
                        if line[0] != age:
                            raise ValueError(f'Unexpected factor row: {key}, {receive}')
                        value = line[col]
                        if isinstance(value, (int, float)) and value > 0:
                            choices[receive] = value
                cases[key] = [basic[age + 2][col], choices, rows]

    others = book['others']
    return dict(version='26.11', terms=terms, cases=cases, transferFee=others['E2'].value,
                surrenderFees=[row[0] for row in others.iter_rows(min_row=12, max_row=18,
                                                                 min_col=6, max_col=6, values_only=True)])


if __name__ == '__main__':
    source = Path(sys.argv[1])
    target = Path(__file__).resolve().parent / 'models' / 'xingfu-b.json'
    book = load_workbook(source, read_only=True, data_only=True, keep_links=False)
    try:
        if book['利益演算']['C1'].value != '泰康幸福享裕B款保险产品计划':
            raise ValueError('Expected the 幸福享裕 B workbook')
        model = extract(book)
    finally:
        book.close()
    target.write_text(json.dumps(model, ensure_ascii=False, separators=(',', ':'),
                                 allow_nan=False), encoding='utf-8')
    print(f"Imported {len(model['cases'])} policy combinations.")
