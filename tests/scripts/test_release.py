import importlib.util
import io
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import hashlib
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('release_tools', ROOT / 'scripts/release.py')
release = importlib.util.module_from_spec(spec); spec.loader.exec_module(release)

class ReleaseTests(unittest.TestCase):
    def test_desktop_archive_includes_the_linked_usage_guides(self):
        version=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'app';output=Path(folder)/'zips';(source/'web').mkdir(parents=True)
            (source/'Sensa.exe').write_bytes(b'fixture');(source/'web/app.bundle.js').write_text('fixture',encoding='utf-8')
            with patch('sys.argv',['release.py','app','--tag','v'+version,'--source',str(source),'--output',str(output)]):release.main()
            with zipfile.ZipFile(next(output.glob('*.zip'))) as archive:
                for name in ('README.md','unity/top.sealoong.sensa/AUTOMATION.md','unity/top.sealoong.sensa/COMPATIBILITY.md','tools/unity-world-lab/README.md'):
                    self.assertEqual(archive.read(name),(ROOT/name).read_bytes())
    def test_version_mismatch_is_rejected(self):
        with self.assertRaises(ValueError): release.validate_tag('app', 'v99.0.0')
        with self.assertRaises(ValueError): release.validate_tag('unity', 'unity-v../../escape')

    def test_zip_is_reproducible(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root/'src').mkdir(); (root/'src'/'file').write_bytes(b'hello')
            release.zip_directory(root/'src', root/'one.zip'); release.zip_directory(root/'src', root/'two.zip')
            self.assertEqual((root/'one.zip').read_bytes(), (root/'two.zip').read_bytes())

    def test_index_preserves_verified_history_and_detects_corruption(self):
        package = b'fixture zip bytes'
        digest = hashlib.sha256(package).hexdigest()
        host = 'https://github.com/Owner/Repo/releases/download/unity-v0.2.0'
        entry = {'name':'top.sealoong.sensa','version':'0.2.0','url':host+'/package.zip','sha256':digest}
        base = 'https://Owner.github.io/Repo'
        old = dict(entry, version='0.1.0', url=base+'/packages/top.sealoong.sensa/0.1.0/top.sealoong.sensa.zip')
        history = {'packages':{'top.sealoong.sensa':{'versions':{'0.1.0':old}}}}
        listing = [[{'draft':False,'prerelease':False,'tag_name':'unity-v0.2.0','assets':[
            {'name':'vpm-package.json','browser_download_url':host+'/vpm-package.json'},
            {'name':'package.zip','browser_download_url':entry['url']}]}]]
        fixtures = {host+'/vpm-package.json':json.dumps(entry).encode(), entry['url']:package,
                    base+'/vpm.json':json.dumps(history).encode(), old['url']:package}
        def fetch(url, **kwargs): return io.BytesIO(fixtures[url])
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, GITHUB_REPOSITORY='Owner/Repo'), patch('urllib.request.urlopen', side_effect=fetch), patch('subprocess.check_output', return_value=json.dumps(listing)):
            previous = Path.cwd()
            try:
                os.chdir(tmp); Path('.github/pages').mkdir(parents=True); Path('.github/pages/index.html').write_text('__VERSION__')
                runpy.run_path(str(ROOT/'scripts/vpm-index.py'))
                index = json.loads(Path('artifacts/pages/vpm.json').read_text())
                self.assertEqual(set(index['packages']['top.sealoong.sensa']['versions']), {'0.1.0','0.2.0'})
                self.assertEqual(Path('artifacts/pages/packages/top.sealoong.sensa/0.1.0/top.sealoong.sensa.zip').read_bytes(), package)
                fixtures[entry['url']] = b'corrupt'
                with self.assertRaises(ValueError): runpy.run_path(str(ROOT/'scripts/vpm-index.py'))
            finally: os.chdir(previous)

if __name__ == '__main__': unittest.main()
