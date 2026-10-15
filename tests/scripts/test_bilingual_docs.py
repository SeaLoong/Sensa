"""Documentation parity and packaged English entry points."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FOLDERS = ('docs', 'unity/top.sealoong.sensa', 'tools/unity-world-lab', 'tools/unity-avatar-lab')

class BilingualDocumentationTests(unittest.TestCase):
    def test_guides_have_linked_counterparts(self):
        paths = [ROOT / 'README.md']
        for folder in FOLDERS:
            paths.extend(p for p in (ROOT / folder).glob('*.md') if '.en.' not in p.name)
        for path in paths:
            with self.subTest(path=path):
                english = path.with_name(path.stem + '.en.md')
                self.assertTrue(english.is_file())
                self.assertIn('](' + english.name + ')', path.read_text(encoding='utf8'))
                self.assertIn('](' + path.name + ')', english.read_text(encoding='utf8'))
                self.assertGreater(len(english.read_text(encoding='utf8')), 300)

    def test_english_relative_links_resolve(self):
        paths = [ROOT / 'README.en.md']
        for folder in FOLDERS:
            paths.extend((ROOT / folder).glob('*.en.md'))
        for path in paths:
            for link in re.findall(r'\]\(([^)]+)\)', path.read_text(encoding='utf8')):
                if '://' in link or link.startswith('#'):
                    continue
                target = link.split('#', 1)[0]
                with self.subTest(page=path, link=link):
                    self.assertTrue((path.parent / target).is_file())

    def test_unity_new_sources_and_guides_have_metadata(self):
        package = ROOT / 'unity/top.sealoong.sensa'
        for path in [*package.glob('*.en.md'), package / 'Editor/SensaInspectorLabels.cs']:
            self.assertRegex(Path(str(path)+'.meta').read_text(), r'guid: [a-f0-9]{32}')

if __name__ == '__main__':
    unittest.main()
