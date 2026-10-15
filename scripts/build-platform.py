"""Build, run and package the native self-contained app on a CI runner."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from release import RUNTIMES

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--runtime',choices=RUNTIMES,required=True);parser.add_argument('--label',default='');args=parser.parse_args()
    source=ROOT/'artifacts'/'publish'/args.runtime
    output=ROOT/'artifacts'/'platform'/args.runtime
    def run(*command):subprocess.run(command,cwd=ROOT,check=True)
    run('dotnet','restore','tests/Sensa.Tests/Sensa.Tests.csproj','--locked-mode')
    run('dotnet','test','tests/Sensa.Tests/Sensa.Tests.csproj','-c','Release','--no-restore','--logger','trx;LogFileName=backend.trx','--results-directory',str(ROOT/'artifacts'/'test-results'/args.runtime))
    run('dotnet','publish','src/Sensa.csproj','-c','Release','-r',args.runtime,'--self-contained','true','-p:RestoreLockedMode=true','-o',str(source))
    binary=source/('Sensa.exe' if args.runtime.startswith('win-') else 'Sensa')
    run(sys.executable,'scripts/smoke.py','--exe',str(binary),'--report-dir',str(ROOT/'artifacts'/'test-results'/args.runtime/'smoke'))
    version=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))['version']
    tag=os.environ['GITHUB_REF_NAME'] if os.environ.get('GITHUB_REF_TYPE')=='tag' else 'v'+version
    run(sys.executable,'scripts/release.py','app','--tag',tag,'--runtime',args.runtime,'--label',args.label,'--source',str(source),'--output',str(output))

if __name__=='__main__':main()
