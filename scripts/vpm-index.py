"""Build VPM index from published, verified GitHub Release assets.

Unavailable assets abort deployment. Legacy Pages packages are copied only after
hash verification, so the first migration does not silently strand old versions.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request
import urllib.parse

repository = os.environ['GITHUB_REPOSITORY']
base = os.environ.get('PAGES_BASE_URL', f'https://{repository.split("/")[0]}.github.io/{repository.split("/")[1]}')
output = Path('artifacts/pages'); output.mkdir(parents=True, exist_ok=True)
versions = {}

def fetch(url):
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read()

releases = json.loads(subprocess.check_output(['gh', 'api', '--paginate', '--slurp', f'repos/{repository}/releases?per_page=100'], text=True))
for page in releases:
    for release in page:
        if release['draft'] or release['prerelease'] or not release['tag_name'].startswith('unity-v'):
            continue
        manifests = [a for a in release['assets'] if a['name'] == 'vpm-package.json']
        if not manifests:
            continue
        entry = json.loads(fetch(manifests[0]['browser_download_url']))
        if entry['name'] != 'top.sealoong.sensa' or release['tag_name'] != 'unity-v' + entry['version']:
            raise ValueError('Release manifest identity mismatch')
        allowed = {a['browser_download_url'] for a in release['assets']}
        if entry['url'] not in allowed or hashlib.sha256(fetch(entry['url'])).hexdigest() != entry['sha256']:
            raise ValueError('Release package checksum mismatch')
        if entry['version'] in versions:
            raise ValueError('Duplicate release version')
        versions[entry['version']] = entry

try:
    old = json.loads(fetch(base + '/vpm.json'))
except urllib.error.HTTPError as ex:
    if ex.code != 404: raise
    old = {}
for version, entry in old.get('packages', {}).get('top.sealoong.sensa', {}).get('versions', {}).items():
    if version in versions: continue
    # Do not fetch arbitrary hosts from a remote index in a privileged workflow.
    expected = urllib.parse.urlsplit(base)
    location = urllib.parse.urlsplit(entry['url'])
    prefix = expected.path.rstrip('/') + '/packages/top.sealoong.sensa/'
    if location.scheme != 'https' or location.netloc.lower() != expected.netloc.lower() or not location.path.startswith(prefix):
        raise ValueError('Unrecognized historical asset location; migrate it to a release first')
    data = fetch(entry['url'])
    if hashlib.sha256(data).hexdigest() != entry['sha256']:
        raise ValueError('Historical package checksum mismatch')
    if not __import__('re').fullmatch(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', version): raise ValueError('Invalid historical version')
    if entry['version'] != version: raise ValueError('Historical version mismatch')
    target = output / 'packages/top.sealoong.sensa' / version / 'top.sealoong.sensa.zip'
    target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
    versions[version] = dict(entry, url=f'{base}/packages/top.sealoong.sensa/{version}/top.sealoong.sensa.zip')

if not versions: raise ValueError('Refusing to deploy an empty package index')
index = {'name':'Sensa', 'id':'top.sealoong.sensa.repo', 'url':base + '/vpm.json', 'author':{'name':'SeaLoong'}, 'packages':{'top.sealoong.sensa':{'versions':versions}}}
(output / 'vpm.json').write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding='utf-8')
latest = max(versions, key=lambda v: tuple(map(int, v.split('-')[0].split('.'))))
(output / 'index.html').write_text(Path('.github/pages/index.html').read_text(encoding='utf-8').replace('__VERSION__', latest), encoding='utf-8')
