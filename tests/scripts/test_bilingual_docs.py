"""Public documentation contracts / 公开文档契约.

Paired guides and inline bilingual domain decisions are checked separately.
成对指南与中英同页的领域决策分别验证；内部代理文档不属于公开指南配对范围。
"""
from pathlib import Path
import re
import unittest
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
GUIDE_FOLDERS = ('docs', 'unity/top.sealoong.sensa', 'tools/unity-world-lab', 'tools/unity-avatar-lab')


def guide_pairs(root=ROOT):
    pairs = [(root / 'README.zh-CN.md', root / 'README.md')]
    for folder in GUIDE_FOLDERS:
        base = root / folder
        if (base / 'README.md').exists():
            pairs.append((base / 'README.zh-CN.md', base / 'README.md'))
        pairs.extend((page, page.with_name(page.stem + '.en.md')) for page in sorted(base.glob('*.md'))
                     if not page.name.endswith(('.en.md', '.zh-CN.md')) and page.name != 'README.md')
    return pairs


def relative_links(markdown):
    """Return local Markdown targets outside fenced examples.
    提取代码围栏之外的本地 Markdown 目标。
    """
    prose = re.sub(r'(?ms)^\s*(?:```|~~~).*?^\s*(?:```|~~~)\s*$', '', markdown)
    for target in re.findall(r'\]\(([^)]+)\)', prose):
        target = target.strip().strip('<>')
        if urlsplit(target).scheme or target.startswith('#'):
            continue
        location = unquote(target.split('#', 1)[0].split('?', 1)[0])
        if location:
            yield location


class PublicGuideContracts(unittest.TestCase):
    def test_every_public_guide_has_substantial_reciprocal_language_entry_points(self):
        pairs = guide_pairs()
        self.assertIn(ROOT / 'docs/architecture.md', [pair[0] for pair in pairs])
        self.assertIn(ROOT / 'docs/development.md', [pair[0] for pair in pairs])
        for chinese, english in pairs:
            with self.subTest(guide=chinese.relative_to(ROOT).as_posix()):
                self.assertTrue(chinese.is_file())
                self.assertTrue(english.is_file(), str(english))
                chinese_text = chinese.read_text(encoding='utf-8')
                english_text = english.read_text(encoding='utf-8')
                self.assertIn('](' + english.name + ')', chinese_text)
                self.assertIn('](' + chinese.name + ')', english_text)
                self.assertGreater(len(english_text), 300)
                self.assertRegex(chinese_text, r'[\u3400-\u9fff]')
                self.assertGreater(len(re.findall(r'\b[A-Za-z]{3,}\b', english_text)), 20)

    def test_both_languages_domain_decisions_and_glossary_have_resolvable_relative_links(self):
        paths = {path for pair in guide_pairs() for path in pair}
        paths.add(ROOT / 'GLOSSARY.md')
        paths.update((ROOT / 'docs/adr').glob('*.md'))
        for page in sorted(paths):
            for link in relative_links(page.read_text(encoding='utf-8')):
                with self.subTest(page=page.relative_to(ROOT).as_posix(), link=link):
                    self.assertTrue((page.parent / link).exists(), f'{page}: {link}')

    def test_domain_glossary_and_architecture_decisions_contain_both_languages(self):
        glossary = (ROOT / 'GLOSSARY.md').read_text(encoding='utf-8')
        definitions = re.findall(r'(?m)^\| \*\*[^|]+\*\* \| (.+) \|$', glossary)
        self.assertTrue(definitions, 'The glossary needs domain definitions / 术语表需要领域定义')
        for definition in definitions:
            with self.subTest(definition=definition):
                self.assertRegex(definition, r'[\u3400-\u9fff]')
                self.assertGreater(len(re.findall(r'\b[A-Za-z]{3,}\b', definition)), 3)
        decisions = sorted((ROOT / 'docs/adr').glob('*.md'))
        self.assertGreaterEqual(len(decisions), 2)
        for path in decisions:
            with self.subTest(decision=path.name):
                prose = path.read_text(encoding='utf-8')
                self.assertGreater(len(re.findall(r'[\u3400-\u9fff]', prose)), 20)
                self.assertGreater(len(re.findall(r'\b[A-Za-z]{3,}\b', prose)), 20)

    def test_unity_english_guides_and_inspector_entry_point_have_distinct_asset_guids(self):
        package = ROOT / 'unity/top.sealoong.sensa'
        assets = [*package.glob('*.en.md'), *package.glob('*.zh-CN.md'), package / 'Editor/SensaInspectorLabels.cs']
        guids = []
        for asset in assets:
            with self.subTest(asset=asset.relative_to(ROOT).as_posix()):
                metadata = Path(str(asset) + '.meta')
                self.assertTrue(metadata.is_file())
                match = re.search(r'(?m)^guid: ([a-f0-9]{32})$', metadata.read_text(encoding='utf-8'))
                self.assertIsNotNone(match)
                guids.append(match[1])
        self.assertEqual(len(guids), len(set(guids)))

    def test_link_reader_ignores_external_links_and_code_but_keeps_decoded_local_targets(self):
        text = '[local](guide.en.md#usage) [external](https://example.test/path)\n\n```md\n[example](not-a-real-file.md)\n```\n\n[space](images/a%20b.png) [anchor](#section)'
        self.assertEqual(list(relative_links(text)), ['guide.en.md', 'images/a b.png'])


if __name__ == '__main__':
    unittest.main()
