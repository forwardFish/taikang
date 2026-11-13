from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile
from lxml import etree
from pypdf import PdfReader
import json
import re
import sys

ROOT = Path(__file__).resolve().parent
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
TERMS = [1, 3, 5, 10, 15, 20]
LIMITS = dict(zip(TERMS, [80, 75, 70, 55, 50, 45]))

def extract(source, pdf):
    with ZipFile(source) as archive:
        shared = [''.join(si.itertext()) for si in etree.fromstring(archive.read('xl/sharedStrings.xml'))]

        def sheet(number):
            root = etree.fromstring(archive.read(f'xl/worksheets/sheet{number}.xml'))
            return {int(row.get('r')): cells(row) for row in root.iter(NS+'row')}

        def cells(row):
            values = {}
            for cell in row.iterchildren(NS+'c'):
                value = cell.findtext(NS+'v')
                kind = cell.get('t', 'n')
                if value is None or kind == 'e':
                    continue
                if kind == 's':
                    value = shared[int(value)]
                elif kind == 'n':
                    value = float(value) if any(c in value for c in '.Ee') else int(value)
                values[re.match(r'[A-Z]+',cell.get('r'))[0]] = value
            return values

        groups = defaultdict(dict)
        for row in sheet(3).values():
            age, sex, term, year = (row.get(c) for c in 'DCBE')
            if sex not in ('M', 'F') or term not in TERMS or not isinstance(age, int):
                continue
            key = f'{age}{sex}{term}'
            assert row['A'] == f'{key}_{year}' and year not in groups[key], (key,year)
            groups[key][year] = [row.get(c,0) for c in 'GIJLMNO']

        records = {}
        basic = sheet(4)
        once_table = sheet(6)
        for term_index, term in enumerate(TERMS):
            for age in range(LIMITS[term]+1):
                for sex_index, sex in enumerate(('M','F')):
                    key = f'{age}{sex}{term}'
                    col = chr(ord('B')+2*term_index+sex_index)
                    rows = groups[key]
                    assert len(rows) == 106-age and set(rows) == set(range(1,107-age)), (key,len(rows))
                    factors = {}
                    for receive, first, last in ((60,5,59),(70,69,134),(80,144,215)):
                        if first+age <= last:
                            factor_row = once_table[first+age]
                            assert factor_row['A'] == age
                            factor = factor_row.get(col)
                            if isinstance(factor,(int,float)) and factor > 0:
                                factors[receive] = factor
                    rate = basic[age+3][col]
                    assert isinstance(rate,(int,float)) and rate > 0, key
                    records[key] = [rate, factors, [rows[y] for y in range(1,107-age)]]

        ui = sheet(5)
        cache = []
        for i in range(9,115):
            row=ui.get(i,{})
            if not isinstance(row.get('C'), (int,float)) or row['C'] < 1:
                continue
            cache.append([row.get(c) for c in ['C','E','F','G','H','I','K','L','M','Q']])
        others = sheet(2)
        model = dict(version='26.07', terms=LIMITS, cases=records,
                     transferFee=others[2]['E'], surrenderFees=[others[i]['F'] for i in range(12,19)])

    pdf_rows=[]
    for page in PdfReader(pdf).pages:
        for line in page.extract_text().splitlines():
            fields=line.strip().split()
            if len(fields)==9 and all(re.fullmatch(r'\d+', x) for x in fields):
                pdf_rows.append(list(map(int,fields)))
    assert len(cache)==90 and len(pdf_rows)==38, (len(cache),len(pdf_rows))
    (ROOT/'model.json').write_text(json.dumps(model,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (ROOT/'references.json').write_text(json.dumps({'cache':cache,'pdf':pdf_rows},ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'combinations':len(records),'sourceRows':sum(len(x[2]) for x in records.values()),'pdfRows':len(pdf_rows),'cacheRows':len(cache),
                      'boundaries':{f'{age}{sex}{term}':records[f'{age}{sex}{term}'][1] for age,sex,term in [(16,'M',3),(54,'M',5),(55,'M',5),(65,'F',3),(66,'F',3),(71,'M',1),(72,'M',1),(75,'F',3)]}},ensure_ascii=False))

if __name__=='__main__':
    if len(sys.argv) != 3:
        sys.exit('用法: python extract.py <幸福享裕演算表.xlsx> <原表核对样例.pdf>')
    extract(Path(sys.argv[1]), Path(sys.argv[2]))
