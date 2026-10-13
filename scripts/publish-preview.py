"""Publish a complete immutable prerelease after all native builds succeed."""
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
RUNTIMES=('win-x64','win-arm64','linux-x64','linux-arm64','osx-x64','osx-arm64')

def collect(root):
    files=[]
    for rid in RUNTIMES:
        suffix='.zip' if rid.startswith('win-') else '.tar.gz'
        matches=list(root.rglob('Sensa-*-'+rid+suffix))
        if len(matches)!=1:raise ValueError('Expected exactly one archive for '+rid)
        files.extend(matches)
    unity=list(root.rglob('top.sealoong.sensa-*.zip'))
    if len(unity)!=1:raise ValueError('Expected exactly one Unity archive')
    files.extend(unity)
    for file in files:
        expected=(file.parent/'SHA256SUMS.txt').read_text(encoding='utf-8').splitlines()
        digest=hashlib.sha256(file.read_bytes()).hexdigest()
        if f'{digest}  {file.name}' not in expected:raise ValueError('Checksum mismatch: '+file.name)
    return files

def main():
    if os.environ.get('GITHUB_EVENT_NAME')!='push' or os.environ.get('GITHUB_REF')!='refs/heads/main':
        raise ValueError('Automatic prereleases are restricted to main push runs')
    sha=os.environ['GITHUB_SHA'];number=os.environ['GITHUB_RUN_NUMBER'];attempt=os.environ['GITHUB_RUN_ATTEMPT']
    if not re.fullmatch('[0-9a-f]{40}',sha) or not number.isdigit() or not attempt.isdigit():raise ValueError('Invalid run identity')
    tag=f'preview-{number}-{attempt}-{sha[:8]}'
    output=ROOT/'artifacts'/'preview';output.mkdir(parents=True,exist_ok=True)
    archives=collect(ROOT/'artifacts'/'downloaded')
    for path in archives:shutil.copyfile(path,output/path.name)
    checksums=output/'SHA256SUMS.txt';checksums.write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in archives),encoding='utf-8')
    notes=ROOT/'artifacts'/'preview-notes.md'
    notes.write_text(f'''开发预览 · `{sha}`

Windows / Linux / macOS 的 x64 与 ARM64 自包含程序，以及独立 Unity 资产包。
按系统和处理器选择文件；Windows 解压后运行 Sensa.exe，Linux/macOS 解包后运行 ./Sensa。
打开 http://127.0.0.1:5086 。完整目录需要保留；程序不需要另装 .NET。

这是自动预发布，桌面启动与无设备冒烟已在各自平台执行；真实硬件、签名/公证和 PCVR 行为不由这些检查保证。
Unity 包需在 Avatar 项目安装相应 SDK、Modular Avatar/NDMF，使用 SPS 自动配置时还需 VRCFury。
此预览不更新 VPM 稳定索引。

使用文档见压缩包 README 和 docs/，校验值见 SHA256SUMS.txt。
''',encoding='utf-8')
    assets=[str(output/p.name) for p in archives]+[str(checksums)]
    subprocess.run(['gh','release','create',tag,'--target',sha,'--draft','--prerelease','--latest=false','--title',f'Sensa 开发预览 #{number} ({sha[:8]})','--notes-file',str(notes),*assets],check=True)
    subprocess.run(['gh','release','edit',tag,'--draft=false','--prerelease','--latest=false'],check=True)
    url=f'https://github.com/{os.environ["GITHUB_REPOSITORY"]}/releases/tag/{tag}'
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a',encoding='utf-8') as report:report.write(f'[下载开发预览]({url})\n')
    print(url)

if __name__=='__main__':main()
