#!/usr/bin/env python3
"""Catalogue processing pipeline. Needs poppler-utils (pdftotext, pdftoppm, pdfinfo) and tesseract.
No pip packages. Output goes to scripts/work/ (git-ignored). Never treats OCR output as verified.

  info      PDF                      page count, metadata, text-layer coverage
  ocr       PDF --pages 1-704|@toc   OCR pages -> pages.jsonl (resumable, parallel)
  toc       PDF --toc-pages 4-12     parse table of contents -> toc.csv
  build     --catalogue-name NAME    toc.csv + pages.jsonl -> products.csv + validation_report.json
  previews  PDF --pages 300,301      low-resolution page previews (JPEG) for human review
"""
import argparse, csv, json, os, re, subprocess, sys, tempfile
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

LEADER = r'[.\u2026\u00b7_\s]{3,}'
ENTRY = re.compile(r'(?P<title>[A-Za-z0-9(\[][^\n]*?[A-Za-z0-9)\]\u2122\u00ae*])' + LEADER + r'(?P<page>\d{1,3})(?=\s|$)')
INFO_WORDS = re.compile(r'breakdown|^about |features|surface styles|width table|application table|nomenclature|ordering guideline|portfolio|introduction|index', re.I)
NUM = r'(\d+(?:\.\d+)?)'
CHAIN_INFO = re.compile(r'(\d+)\s*mm\s+' + NUM + r'\s+' + NUM + r'\s+(\d+)\s+(\d+)\s*[|l1]?\s*(\d+)')
PITCH = re.compile(r'Chain\s+Pitch\s+' + NUM + r'\s*in\s*\(?\s*' + NUM + r'\s*mm', re.I)
POLY = r'(?:POM|PA|PP|PE|PET|PBT|PPS|PEEK|PTFE|PVDF|PU|PVC|UHMWPE)'
MATERIAL_ROW = re.compile(r'^\W*(?P<prefix>[A-Za-z][\w\-]*)\S*\s*[|]?\s*(?P<name>.+?)\s+' + POLY + r'\s+' + POLY + r'\s', re.M)
FLAG_CONF = 70.0


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def normalise(code):
    return re.sub(r'[^A-Za-z0-9]', '', code or '').upper()


def parse_pages(spec, total, work):
    if spec == '@toc':
        with open(work / 'toc.csv', newline='', encoding='utf-8') as f:
            return sorted({int(r['page']) for r in csv.DictReader(f) if r['kind'] == 'product'})
    out = set()
    for part in spec.split(','):
        a, _, b = part.strip().partition('-')
        out.update(range(int(a), int(b or a) + 1))
    return sorted(p for p in out if 1 <= p <= total)


def page_count(pdf):
    m = re.search(r'^Pages:\s+(\d+)', sh(['pdfinfo', pdf]).stdout, re.M)
    if not m:
        sys.exit('Could not read PDF page count')
    return int(m.group(1))


def tsv_to_page(n, tsv):
    lines, confs, key, cur = [], [], None, []
    for row in tsv.splitlines()[1:]:
        c = row.split('\t')
        if len(c) < 12 or c[0] != '5' or not c[11].strip():
            continue
        k = (c[2], c[3], c[4])
        if k != key and cur:
            lines.append(' '.join(cur)); cur = []
        key = k
        cur.append(c[11].strip())
        if float(c[10]) >= 0:
            confs.append(float(c[10]))
    if cur:
        lines.append(' '.join(cur))
    conf = round(sum(confs) / len(confs), 1) if confs else 0.0
    return {'page': n, 'source': 'ocr', 'conf': conf, 'text': '\n'.join(lines)}


def page_px(pdf, dpi):
    m = re.search(r'Page size:\s+([\d.]+) x ([\d.]+)', sh(['pdfinfo', pdf]).stdout)
    return (round(float(m.group(1)) * dpi / 72), round(float(m.group(2)) * dpi / 72)) if m else (1700, 2200)


def ocr_columns(pdf, n, dpi, bounds, dims):
    """OCR each column strip separately (multi-column tables of contents), in reading order."""
    texts, confs = [], []
    w, h = dims
    for x0, x1 in zip(bounds, bounds[1:]):
        with tempfile.TemporaryDirectory() as d:
            sh(['pdftoppm', '-f', str(n), '-l', str(n), '-r', str(dpi), '-gray', '-png', '-x', str(round(x0 * w)), '-y', '0',
                '-W', str(round((x1 - x0) * w)), '-H', str(h), pdf, os.path.join(d, 'p')])
            imgs = sorted(Path(d).glob('p*.png'))
            r = sh(['tesseract', str(imgs[0]), 'stdout', '--psm', '4', '-c', 'preserve_interword_spaces=1', 'tsv'],
                   env={**os.environ, 'OMP_THREAD_LIMIT': '1'})
        pg = tsv_to_page(n, r.stdout)
        texts.append(pg['text']); confs.append(pg['conf'])
    return {'page': n, 'source': 'ocr-columns', 'conf': round(sum(confs) / len(confs), 1), 'text': '\n'.join(texts)}


def ocr_page(a):
    pdf, n, dpi, psm, min_text, bounds, dims = a
    if bounds:
        return ocr_columns(pdf, n, dpi, bounds, dims)
    t = sh(['pdftotext', '-f', str(n), '-l', str(n), '-layout', pdf, '-']).stdout
    if len(t.strip()) >= min_text:
        return {'page': n, 'source': 'text-layer', 'conf': None, 'text': t}
    with tempfile.TemporaryDirectory() as d:
        sh(['pdftoppm', '-f', str(n), '-l', str(n), '-r', str(dpi), '-gray', '-png', pdf, os.path.join(d, 'p')])
        imgs = sorted(Path(d).glob('p*.png'))
        if not imgs:
            return {'page': n, 'source': 'failed', 'conf': 0.0, 'text': ''}
        r = sh(['tesseract', str(imgs[0]), 'stdout', '--psm', str(psm), '-c', 'preserve_interword_spaces=1', 'tsv'],
               env={**os.environ, 'OMP_THREAD_LIMIT': '1'})
    return tsv_to_page(n, r.stdout)


def run_ocr(pdf, pages, work, dpi, psm, workers, force, out_name='pages.jsonl', bounds=None):
    out = work / out_name
    done = set()
    if out.exists() and not force:
        done = {json.loads(l)['page'] for l in out.read_text(encoding='utf-8').splitlines() if l.strip()}
    todo = [p for p in pages if p not in done]
    print(f'OCR: {len(todo)} pages to do ({len(done)} already done)')
    mode = 'w' if force else 'a'
    results = []
    with open(out, mode, encoding='utf-8') as f, ProcessPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(ocr_page, (pdf, p, dpi, psm, 200, bounds, page_px(pdf, dpi) if bounds else None)) for p in todo]
        for i, fu in enumerate(as_completed(futs), 1):
            r = fu.result(); results.append(r)
            f.write(json.dumps(r, ensure_ascii=False) + '\n'); f.flush()
            if i % 10 == 0 or i == len(todo):
                print(f'  {i}/{len(todo)}')
    return results


def load_pages(work):
    p = work / 'pages.jsonl'
    return {} if not p.exists() else {r['page']: r for r in (json.loads(l) for l in p.read_text(encoding='utf-8').splitlines() if l.strip())}


def cmd_info(a):
    n = page_count(a.pdf)
    print(sh(['pdfinfo', a.pdf]).stdout)
    step = max(1, n // 40)
    sample = list(range(1, n + 1, step))
    texty = sum(1 for p in sample if len(sh(['pdftotext', '-f', str(p), '-l', str(p), a.pdf, '-']).stdout.strip()) >= 200)
    print(f'Pages: {n}. Text layer on {texty} of {len(sample)} sampled pages -> '
          f'{"OCR needed for most pages" if texty < len(sample) / 2 else "mostly digital text"}')


def cmd_ocr(a):
    work = Path(a.out); work.mkdir(parents=True, exist_ok=True)
    pages = parse_pages(a.pages, page_count(a.pdf), work)
    run_ocr(a.pdf, pages, work, a.dpi, a.psm, a.workers, a.force)


def parse_toc_text(text):
    entries = []
    for line in text.splitlines():
        for m in ENTRY.finditer(line):
            title = re.sub(r'\s*[.\u2026\u00b7]{2,}.*$', '', re.sub(r'\s+', ' ', m.group('title'))).strip(' .')
            page = int(m.group('page'))
            title = re.sub(r'\.\s*\.+.*$', '', title).strip(' .')   # leftover dot leaders ("Series Sprockets. . we")
            if len(title) >= 3 and page > 0 and not re.match(r'^pag\b', title, re.I):
                entries.append((title, page))
    return entries


def classify(entries):
    rows = []
    for i, (title, page) in enumerate(entries):
        letters = [c for c in title if c.isalpha()]
        upper = bool(letters) and sum(c.isupper() for c in letters) / len(letters) > 0.85 and len(letters) > 3
        nxt = entries[i + 1][1] if i + 1 < len(entries) else None
        if upper: kind = 'section'
        elif INFO_WORDS.search(title): kind = 'info'
        elif nxt == page and not re.match(r'^[A-Z]?\d', title): kind = 'group'
        else: kind = 'product'
        rows.append({'title': title, 'page': page, 'kind': kind, 'suspect': ''})
    # Section numbers never decrease in a TOC; flag entries that break the order (likely OCR misreads).
    last = 0
    for i, r in enumerate(rows):
        nxt = rows[i + 1]['page'] if i + 1 < len(rows) else r['page']
        if r['page'] < last or r['page'] > nxt + 0 and r['page'] - last > 40:
            r['suspect'] = 'page_out_of_order'
        else:
            last = r['page']
    return rows


def cmd_toc(a):
    work = Path(a.out); work.mkdir(parents=True, exist_ok=True)
    pages = parse_pages(a.toc_pages, page_count(a.pdf), work)
    bounds = [float(x) for x in a.col_bounds.split(',')]
    res = sorted(run_ocr(a.pdf, pages, work, a.dpi, 4, a.workers, True, 'toc_pages.jsonl', bounds), key=lambda r: r['page'])
    entries = []
    for r in res:
        entries += parse_toc_text(r['text'])
    rows = classify(entries)
    with open(work / 'toc.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, ['title', 'page', 'kind', 'suspect']); w.writeheader(); w.writerows(rows)
    print(f'TOC: {len(rows)} entries ({dict(Counter(r["kind"] for r in rows))}) -> {work / "toc.csv"}')


def parse_specs(text):
    specs, flags = {}, []
    infos = CHAIN_INFO.findall(text)
    if len(infos) == 1:
        w_mm, _, _, n_sp, lbf, newton = infos[0]
        specs.update({'Chain width (mm)': w_mm, 'Number of sprockets': n_sp,
                      'Rated chain capacity (lbf)': lbf, 'Rated chain capacity (N)': newton})
    elif len(infos) > 1:
        flags.append('multiple_width_rows')
        specs['Chain widths (mm)'] = ', '.join(i[0] for i in infos)
    pm = PITCH.search(text)
    if pm:
        specs['Chain pitch (mm)'] = pm.group(2)
    prefixes = [m.group('prefix') for m in MATERIAL_ROW.finditer(text)]
    if prefixes:
        specs['Material prefixes (OCR)'] = ', '.join(dict.fromkeys(prefixes))
    return specs, flags


def cmd_build(a):
    work = Path(a.out)
    toc = list(csv.DictReader(open(work / 'toc.csv', newline='', encoding='utf-8')))
    pages = load_pages(work)
    sections = []
    sec_file = Path(a.sections)
    if sec_file.exists():
        sections = [(int(r['page']), r['title']) for r in csv.DictReader(open(sec_file, newline='', encoding='utf-8'))]
    sections.sort()
    def section_for(page):
        found = ''
        for sp, st in sections:
            if sp <= page: found = st
        return found
    products, seen = [], Counter()
    for r in toc:
        if r['kind'] != 'product': continue
        pg = int(r['page']); pr = pages.get(pg)
        section = section_for(pg)
        flags = ['series_level_record_code_is_title', 'ocr_unverified'] + (['toc_page_suspect'] if r.get('suspect') else [])
        specs, conf = {}, None
        if pr is None: flags.append('page_not_ocred')
        else:
            conf = pr['conf']
            s, f = parse_specs(pr['text']); specs.update(s); flags += f
            if conf is not None and conf < FLAG_CONF: flags.append('low_ocr_confidence')
            if not s: flags.append('no_specs_parsed')
        pitch = specs.get('Chain pitch (mm)')
        width = specs.get('Chain width (mm)')
        norm = normalise(r['title']); seen[norm] += 1
        code = r['title'] if seen[norm] == 1 else f"{r['title']} (p.{pg})"
        if seen[norm] > 1: flags.append('duplicate_title_page_added_to_code')
        products.append({'product_code': code, 'name': r['title'], 'category': section, 'brand': '', 'description': '',
                         'material': '', 'pitch_mm': pitch or '', 'width_mm': width or '', 'thickness_mm': '', 'colour': '',
                         'application': '', 'source_page': pg, 'drawing_ref': '', 'ocr_confidence': conf if conf is not None else '',
                         'flags': ';'.join(flags), **{f'spec:{k}': v for k, v in specs.items()}})
    spec_cols = sorted({k for p in products for k in p if k.startswith('spec:')})
    cols = ['product_code', 'name', 'category', 'brand', 'description', 'material', 'pitch_mm', 'width_mm', 'thickness_mm',
            'colour', 'application', 'source_page', 'drawing_ref', 'ocr_confidence', 'flags'] + spec_cols
    with open(work / 'products.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, cols); w.writeheader(); w.writerows(products)
    codes = Counter(normalise(p['product_code']) for p in products)
    report = {'catalogue_name': a.catalogue_name, 'products': len(products),
              'duplicate_codes': sorted(c for c, n in codes.items() if n > 1),
              'flag_counts': dict(Counter(fl for p in products for fl in p['flags'].split(';'))),
              'low_confidence_pages': sorted(p for p, r in pages.items() if r['conf'] is not None and r['conf'] < FLAG_CONF),
              'note': 'All records are unverified OCR candidates; a person must check each against its source page.'}
    (work / 'validation_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


def cmd_previews(a):
    work = Path(a.out); (work / 'previews').mkdir(parents=True, exist_ok=True)
    for n in parse_pages(a.pages, page_count(a.pdf), work):
        sh(['pdftoppm', '-f', str(n), '-l', str(n), '-r', str(a.dpi), '-jpeg', '-jpegopt', 'quality=70',
            a.pdf, str(work / 'previews' / f'page-{n:04d}')])
    print('Previews written. Upload only if you have permission to republish the catalogue pages.')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default='scripts/work')
    sub = ap.add_subparsers(dest='cmd', required=True)
    for name in ('info', 'ocr', 'toc', 'previews'):
        sp = sub.add_parser(name); sp.add_argument('pdf')
    sub.choices['ocr'].add_argument('--pages', default='1-9999')
    sub.choices['previews'].add_argument('--pages', required=True)
    sub.choices['toc'].add_argument('--toc-pages', default='4-12')
    sub.choices['toc'].add_argument('--col-bounds', default='0.085,0.355,0.635,0.94', help='column edges as page-width fractions')
    for name in ('ocr', 'toc', 'previews'):
        sub.choices[name].add_argument('--dpi', type=int, default=200)
    for name in ('ocr', 'toc'):
        sub.choices[name].add_argument('--workers', type=int, default=max(1, (os.cpu_count() or 2) - 1))
    sub.choices['ocr'].add_argument('--psm', type=int, default=4)
    sub.choices['ocr'].add_argument('--force', action='store_true')
    sp = sub.add_parser('build'); sp.add_argument('--catalogue-name', required=True)
    sp.add_argument('--sections', default='scripts/sections.csv', help='CSV (page,title) of category start pages')
    a = ap.parse_args()
    {'info': cmd_info, 'ocr': cmd_ocr, 'toc': cmd_toc, 'build': cmd_build, 'previews': cmd_previews}[a.cmd](a)


if __name__ == '__main__':
    main()
