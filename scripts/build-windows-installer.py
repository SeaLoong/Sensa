"""Package a per-user installer from the checked single EXE and offline guides.
将已检查的单文件程序与离线指南打包为当前用户安装器。
"""
import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
from release import archive_files, validate_tag, write_checksums, WINDOWS_RUNTIMES

ROOT = Path(__file__).resolve().parents[1]
GUIDE_DIRECTORIES = ('docs', 'scripts', 'tools', 'unity')
GUIDE_FILES = ('README.md', 'README.zh-CN.md', 'README.en.md', 'GLOSSARY.md', 'LICENSE', 'BUILD-INFO.json')


def prepare_payload(portable, single, payload):
    files = dict((name, path) for path, name in archive_files(portable))
    if single.is_symlink() or not single.is_file():
        raise ValueError('Installer requires a regular single-file EXE / 安装器需要普通单文件 EXE')
    if payload.exists():
        shutil.rmtree(payload)
    payload.mkdir(parents=True)
    shutil.copyfile(single, payload / 'Sensa.exe')
    for name in GUIDE_FILES:
        shutil.copyfile(files[name], payload / name)
    for name in GUIDE_DIRECTORIES:
        if not (portable / name).is_dir():
            raise ValueError('Installer offline directory is missing / 安装器离线目录缺失: ' + name)
        (payload / name).mkdir()
    for name, path in files.items():
        if Path(name).parts[0] in GUIDE_DIRECTORIES:
            destination = payload / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, destination)
    # Never package a prior run's user state into a new installation.
    if any(path.name in ('config.json', 'recordings') for path in payload.iterdir()):
        raise ValueError('Installer payload contains user state / 安装内容包含用户数据')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', choices=WINDOWS_RUNTIMES, required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--label', default='')
    parser.add_argument('--portable', type=Path, required=True)
    parser.add_argument('--single-file', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--compiler', default=os.environ.get('SENSA_ISCC', ''))
    args = parser.parse_args()
    validate_tag('app', 'v' + args.version)
    if args.label and not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9.-]{0,95}', args.label):
        raise ValueError('Invalid build label / 构建标识无效')
    if not args.compiler:
        raise ValueError('Set SENSA_ISCC to the pinned Inno Setup compiler / 请设置固定版本 Inno Setup 编译器 SENSA_ISCC')
    version = args.version + ('-' + args.label if args.label else '')
    payload = ROOT / 'artifacts' / 'installer-payload' / args.runtime
    prepare_payload(args.portable, args.single_file, payload)
    args.output.mkdir(parents=True, exist_ok=True)
    name = f'Sensa-{version}-{args.runtime}-Setup'
    subprocess.run([args.compiler, '/Qp', '/DAppVersion=' + args.version,
                    '/DAppDisplayVersion=' + version,
                    '/DTargetArch=' + args.runtime.removeprefix('win-'), '/DPayloadDir=' + str(payload.resolve()),
                    '/O' + str(args.output.resolve()), '/F' + name, str(ROOT / 'installer/Sensa.iss')],
                   cwd=ROOT, check=True)
    destination = args.output / (name + '.exe')
    if destination.is_symlink() or not destination.is_file():
        raise ValueError('Installer compiler did not produce the expected EXE / 安装器编译器未生成预期 EXE')
    write_checksums(args.output)
    print(destination.name)


if __name__ == '__main__':
    main()
