#!/usr/bin/env python3
"""Batch-final DOI/title check; write one log, never rename/delete PDFs."""
import argparse
import csv
import hashlib
import json
import re
from pathlib import Path


def check(row, root):
    result = dict(row)
    if row.get('status') in ('skipped', 'unresolved', 'failed'):
        return result
    p = Path(row.get('path', ''))
    if not p.is_absolute():
        p = root / p
    try:
        import fitz
        if not p.is_file() or p.read_bytes()[:4] != b'%PDF':
            raise ValueError('missing_or_not_pdf')
        with fitz.open(p) as doc:
            if not len(doc):
                raise ValueError('zero_pages')
            text = ' '.join(doc[i].get_text() for i in range(min(3, len(doc))))
            result['pages'] = len(doc)
        norm = lambda s: re.sub(r'[^\w]', '', s.casefold())
        doi = row.get('doi', '')
        result['doi_match'] = bool(doi and norm(doi) in norm(text))
        words = [w for w in re.findall(r'\w+', row.get('title', '').casefold()) if len(w) > 3]
        result['title_overlap'] = round(sum(w in text.casefold() for w in words) / max(1, len(words)), 3)
        title_ok = bool(words) and result['title_overlap'] >= .7
        result['status'] = 'success' if title_ok and (not doi or result['doi_match']) else 'review_required'
        result['failure_reason'] = '' if result['status'] == 'success' else 'doi_or_title_needs_review'
        result['bytes'] = p.stat().st_size
        result['sha256'] = hashlib.sha256(p.read_bytes()).hexdigest()
    except Exception as e:
        result.update(status='review_required', failure_reason=str(e))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--log', type=Path, required=True)
    args = parser.parse_args()
    if args.log.exists():
        parser.error('log already exists; choose a new path')
    rows = json.loads(args.manifest.read_text())
    if len({r['id'] for r in rows}) != len(rows):
        parser.error('duplicate paper IDs in manifest')
    results = [check(r, args.manifest.parent) for r in rows]
    fields = ['id', 'title', 'doi', 'source_database', 'source_url', 'action', 'trigger', 'attempts', 'path', 'status', 'failure_reason', 'pages', 'doi_match', 'title_overlap', 'bytes', 'sha256']
    args.log.parent.mkdir(parents=True, exist_ok=True)
    with args.log.open('x', newline='') as f:
        writer = csv.DictWriter(f, fields, delimiter='\t', extrasaction='ignore')
        writer.writeheader()
        for row in results:
            if isinstance(row.get('attempts'), (list, dict)):
                row['attempts'] = json.dumps(row['attempts'], ensure_ascii=False)
            writer.writerow(row)
    counts = {s: sum(r.get('status') == s for r in results) for s in sorted({r.get('status', 'unknown') for r in results})}
    print(json.dumps({'counts': counts, 'log': str(args.log)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
