"""Build and smoke-test native candidates in CI. / 在 CI 构建并冒烟验证原生候选."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from release import RUNTIMES

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', choices=RUNTIMES, required=True)
    parser.add_argument('--label', default='')
    args = parser.parse_args()
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise ValueError('Native smoke runs only in GitHub Actions / 原生冒烟仅在 GitHub Actions 执行')
    source = ROOT / 'artifacts' / 'publish' / args.runtime
    output = ROOT / 'artifacts' / 'platform' / args.runtime

    def run(*command):
        subprocess.run(command, cwd=ROOT, check=True)

    # Interface tests already ran once in the checks workflow.
    # 接口测试已在 checks 工作流运行一次；此处只验证原生可执行文件。
    run('dotnet', 'publish', 'src/Sensa.csproj', '-c', 'Release', '-r', args.runtime,
        '--self-contained', 'true', '-p:RestoreLockedMode=true', '-o', str(source))
    binary = source / ('Sensa.exe' if args.runtime.startswith('win-') else 'Sensa')
    run(sys.executable, 'scripts/smoke.py', '--exe', str(binary),
        '--report-dir', str(ROOT / 'artifacts' / 'test-results' / args.runtime / 'smoke'))
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    tag = os.environ['GITHUB_REF_NAME'] if os.environ.get('GITHUB_REF_TYPE') == 'tag' else 'v' + version
    run(sys.executable, 'scripts/release.py', 'app', '--tag', tag, '--runtime', args.runtime,
        '--label', args.label, '--source', str(source), '--output', str(output))


if __name__ == '__main__':
    main()
