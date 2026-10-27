"""Import the official NEPA/Unicamp spreadsheet using only Python's standard library.
Usage: python scripts/import-taco.py path/to/taco.xlsx
Source: https://nepa.unicamp.br/publicacoes/tabela-taco-excel/
"""
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

source = Path(sys.argv[1])
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(source) as book:
    strings = [''.join(t.text or '' for t in item.findall('.//m:t', ns)) for item in ET.fromstring(book.read('xl/sharedStrings.xml'))]
    rows = ET.fromstring(book.read('xl/worksheets/sheet1.xml')).findall('.//m:row', ns)
    foods, omitted, category = [], [], ''
    for row in rows:
        values = {}
        for cell in row:
            v = cell.find('m:v', ns)
            if v is not None:
                values[re.sub(r'\d', '', cell.attrib['r'])] = strings[int(v.text)] if cell.get('t') == 's' else v.text
        raw_id = values.get('A', '')
        if not raw_id.isdigit():
            if raw_id and 'B' not in values:
                category = raw_id.strip()
            continue
        trace = False
        nutrients = {}
        for key, column in [('kcal', 'D'), ('p', 'F'), ('c', 'I'), ('f', 'G')]:
            raw = values.get(column, '').strip()
            if raw.lower() == 'tr':
                trace = True
                nutrients[key] = 0
            else:
                try:
                    number = round(float(raw), 2)
                    # Tiny negative carbohydrate residuals from analytical mass balance are treated as traces.
                    if key == 'c' and -0.1 <= number < 0:
                        number, trace = 0, True
                    nutrients[key] = number
                except ValueError:
                    nutrients[key] = None
        # Missing measurements are not zero. Do not offer automatic calculation for these rows.
        if any(v is None for v in nutrients.values()):
            omitted.append({'id': int(raw_id), 'name': values.get('B', ''), 'reason': 'Incomplete energy or macronutrients'})
            continue
        assert all(0 <= v <= (1000 if k == 'kcal' else 100) for k, v in nutrients.items()), (raw_id, values.get('B'), nutrients)
        name = values['B'].strip()
        aliases = []
        if name.startswith('Arroz, tipo'):
            aliases += ['arroz branco']
        if 'moída' in name or 'moído' in name:
            aliases += ['carne moida carne moída']
        if 'mussarela' in name.lower():
            aliases += ['muçarela mozzarella mussarela']
        if name.startswith('Pão,') and 'forma' in name:
            aliases += ['pão de forma pao de forma']
        foods.append({'id': 'taco:' + raw_id, 'name': name, 'category': category, **nutrients, 'trace': trace, 'aliases': aliases})
assert len(foods) + len(omitted) == 597
assert len({f['id'] for f in foods}) == len(foods)
out = Path('data'); out.mkdir(exist_ok=True)
(out / 'foods.json').write_text(json.dumps(foods, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(out / 'foods-source.json').write_text(json.dumps({'source': 'NEPA/Unicamp · TACO', 'url': 'https://nepa.unicamp.br/publicacoes/tabela-taco-excel/', 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'basis': '100 g edible portion in the preparation described', 'rounding': '2 decimal places; Tr estimated as zero and identified; unavailable values excluded', 'count': len(foods), 'omitted': omitted}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'imported': len(foods), 'omitted': omitted}, ensure_ascii=False))
