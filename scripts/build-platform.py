"""Build native packages, with optional isolated smoke in GitHub Actions.
构建原生程序，可在 GitHub Actions 中先做隔离冒烟，再打包。
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
from release import RUNTIMES, validate_tag, write_checksums

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', choices=RUNTIMES, required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--label', default='')
    parser.add_argument('--windows-extras', action='store_true', help='Also build the per-user installer and standalone EXE / 同时构建每用户安装器与独立 EXE')
    parser.add_argument('--smoke', action='store_true', help='Run isolated native smoke before packaging (Actions only) / 打包前执行隔离冒烟（仅 Actions）')
    args = parser.parse_args()
    if args.smoke and os.environ.get('GITHUB_ACTIONS') != 'true':
        raise ValueError('Native smoke runs only in GitHub Actions / 原生冒烟仅在 GitHub Actions 执行')
    if args.windows_extras and (not args.runtime.startswith('win-') or not os.environ.get('SENSA_ISCC')):
        raise ValueError('Windows extras require a Windows runtime and pinned SENSA_ISCC / Windows 附加格式需要 Windows 平台与固定版本 SENSA_ISCC')
    # The workflow applies this version to every manifest before building.
    # 工作流先将选定版本写入本次构建的清单；不根据事件的分支／标签猜测版本。
    tag = 'v' + args.version
    validate_tag('app', tag)
    source = ROOT / 'artifacts' / 'publish' / args.runtime
    output = ROOT / 'artifacts' / 'platform' / args.runtime

    def run(*command):
        subprocess.run(command, cwd=ROOT, check=True)

    run('node', 'scripts/build-node.mjs', '--sea', '--runtime', args.runtime, '--output', str(source))
    if args.smoke:
        binary = source / ('Sensa.exe' if args.runtime.startswith('win-') else 'Sensa')
        run(str(binary), '--check-native', '--native-report',
            str(ROOT / 'artifacts' / 'test-results' / args.runtime / 'native-packages.json'))
        run(sys.executable, 'scripts/smoke.py', '--exe', str(binary),
            '--report-dir', str(ROOT / 'artifacts' / 'test-results' / args.runtime / 'smoke'))
    run(sys.executable, 'scripts/release.py', 'app', '--tag', tag, '--runtime', args.runtime,
        '--label', args.label, '--source', str(source), '--output', str(output))
    if args.windows_extras:
        single = ROOT / 'artifacts' / 'publish-single' / args.runtime
        if single.is_symlink():
            raise ValueError('Single-file build directory cannot be a symlink')
        if single.exists():
            shutil.rmtree(single)
        single.mkdir(parents=True)
        shutil.copyfile(source / 'Sensa.exe', single / 'Sensa.exe')
        binary = single / 'Sensa.exe'
        # Packaging rejects sidecars, so the smoke cannot accidentally use a web
        # directory or runtime DLLs left beside a nominally "single" executable.
        run(sys.executable, 'scripts/release.py', 'single-file', '--tag', tag, '--runtime', args.runtime,
            '--label', args.label, '--source', str(single), '--output', str(output))
        if args.smoke:
            run(str(binary), '--check-native', '--native-report',
                str(ROOT / 'artifacts' / 'test-results' / args.runtime / 'single-file-native-packages.json'))
            run(sys.executable, 'scripts/smoke.py', '--exe', str(binary),
                '--report-dir', str(ROOT / 'artifacts' / 'test-results' / args.runtime / 'single-file'))
        run(sys.executable, 'scripts/build-windows-installer.py', '--runtime', args.runtime,
            '--version', args.version, '--label', args.label, '--portable', str(source),
            '--single-file', str(binary), '--output', str(output))
        if args.smoke:
            archive_version = args.version + ('-' + args.label if args.label else '')
            installer = output / f'Sensa-{archive_version}-{args.runtime}-Setup.exe'
            run(sys.executable, 'scripts/smoke-windows-installer.py', '--installer', str(installer),
                '--single-file', str(binary), '--report-dir', str(ROOT / 'artifacts' / 'test-results' / args.runtime / 'installer'))
    # The app command above materializes the canonical offline/tool whitelist
    # into source before Electron copies this exact checked CLI distribution.
    run('node', 'scripts/build-electron.mjs', '--runtime', args.runtime, '--version', args.version,
        '--label', args.label, '--output', str(output), *(['--smoke'] if args.smoke else []))
    write_checksums(output)


if __name__ == '__main__':
    main()
