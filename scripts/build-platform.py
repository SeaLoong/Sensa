"""Build native packages, with optional isolated smoke in GitHub Actions.
构建原生程序，可在 GitHub Actions 中先做隔离冒烟，再打包。
"""
import argparse
import os
from pathlib import Path
import subprocess
import sys
from release import RUNTIMES, validate_tag

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', choices=RUNTIMES, required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--label', default='')
    parser.add_argument('--smoke', action='store_true', help='Run isolated native smoke before packaging (Actions only) / 打包前执行隔离冒烟（仅 Actions）')
    args = parser.parse_args()
    if args.smoke and os.environ.get('GITHUB_ACTIONS') != 'true':
        raise ValueError('Native smoke runs only in GitHub Actions / 原生冒烟仅在 GitHub Actions 执行')
    # The workflow applies this version to every manifest before building.
    # 工作流先将选定版本写入本次构建的清单；不根据事件的分支／标签猜测版本。
    tag = 'v' + args.version
    validate_tag('app', tag)
    source = ROOT / 'artifacts' / 'publish' / args.runtime
    output = ROOT / 'artifacts' / 'platform' / args.runtime

    def run(*command):
        subprocess.run(command, cwd=ROOT, check=True)

    run('dotnet', 'publish', 'src/Sensa.csproj', '-c', 'Release', '-r', args.runtime,
        '--self-contained', 'true', '-p:RestoreLockedMode=true', '-o', str(source))
    if args.smoke:
        binary = source / ('Sensa.exe' if args.runtime.startswith('win-') else 'Sensa')
        run(sys.executable, 'scripts/smoke.py', '--exe', str(binary),
            '--report-dir', str(ROOT / 'artifacts' / 'test-results' / args.runtime / 'smoke'))
    run(sys.executable, 'scripts/release.py', 'app', '--tag', tag, '--runtime', args.runtime,
        '--label', args.label, '--source', str(source), '--output', str(output))


if __name__ == '__main__':
    main()
