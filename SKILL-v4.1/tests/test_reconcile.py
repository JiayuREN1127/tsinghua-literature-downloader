import importlib.util
import tempfile
import unittest
from pathlib import Path

import fitz

spec = importlib.util.spec_from_file_location('reconcile', Path(__file__).parents[1] / 'scripts/reconcile-pdfs.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReconcileTests(unittest.TestCase):
    def test_identity_and_provisional_misassignment(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            p = root / 'provisional.pdf'
            doc = fitz.open()
            page = doc.new_page()
            page.insert_text((50, 60), 'Reliable teamwork performance evidence\n10.1234/example.2026')
            doc.save(p)
            doc.close()
            row = dict(id='P1', title='Reliable teamwork performance evidence', doi='10.1234/example.2026', path=p.name)
            before = p.read_bytes()
            self.assertEqual(module.check(row, root)['status'], 'success')
            wrong = dict(row, id='P2', title='Different unrelated citation about astronomers', doi='10.9999/wrong')
            self.assertEqual(module.check(wrong, root)['status'], 'review_required')
            self.assertEqual(p.read_bytes(), before)

    def test_skipped_and_missing_are_not_delivered(self):
        root = Path('/nonexistent')
        self.assertEqual(module.check(dict(id='P1', status='skipped', failure_reason='no access'), root)['status'], 'skipped')
        self.assertEqual(module.check(dict(id='P2', title='Missing article', path='missing.pdf'), root)['status'], 'review_required')


if __name__ == '__main__':
    unittest.main()
