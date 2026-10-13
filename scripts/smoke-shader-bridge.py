"""Replay two Unity-rendered PNG frames through the real bridge into an isolated Sensa process."""
import argparse
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

def free_port(kind):
    with socket.socket(socket.AF_INET,kind) as probe:
        probe.bind(('127.0.0.1',0));return probe.getsockname()[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe',required=True,type=Path)
    parser.add_argument('--first',required=True,type=Path)
    parser.add_argument('--next',required=True,type=Path)
    parser.add_argument('--report',required=True,type=Path)
    args=parser.parse_args()
    web,osc=free_port(socket.SOCK_STREAM),free_port(socket.SOCK_DGRAM)
    with tempfile.TemporaryDirectory(prefix='sensa-shader-smoke-') as folder:
        root=Path(folder);config=root/'config.json';current=root/'frame.png';shutil.copyfile(args.first,current)
        config.write_text(json.dumps({'webUi':{'host':'127.0.0.1','port':web,'autoOpenBrowser':False},'osc':{'enabled':True,'receiverHost':'127.0.0.1','receiverPort':osc,'oscQueryEnabled':False,'oscQueryReceiver':{'enabled':False}},'outputs':[]}),encoding='utf-8')
        with (root/'service.log').open('w',encoding='utf-8') as log:
            service=subprocess.Popen([str(args.exe.resolve())],cwd=root,env=dict(os.environ,SENSA_CONFIG_PATH=str(config)),stdout=log,stderr=log)
            bridge=None
            try:
                base=f'http://127.0.0.1:{web}';deadline=time.monotonic()+30
                while True:
                    try:
                        response=urllib.request.urlopen(base+'/api/session',timeout=1);cookie=response.headers['Set-Cookie'].split(';')[0];break
                    except OSError:
                        if time.monotonic()>deadline:raise TimeoutError('Sensa startup timed out')
                        time.sleep(.1)
                def api(path,body=None):
                    data=None if body is None else json.dumps(body).encode()
                    request=urllib.request.Request(base+path,data=data,method='GET' if body is None else 'PUT',headers={'Cookie':cookie,'Origin':base,'Content-Type':'application/json'})
                    with urllib.request.urlopen(request,timeout=3) as response:return json.load(response)
                configuration=api('/api/config')
                assert not configuration['outputs'], 'Only an isolated, device-free configuration is allowed'
                configuration['signals']=[{'oscPath':'Sensa/Lab/Shader/Z','role':'Depth','vrchatMin':0,'vrchatMax':.2},{'oscPath':'Sensa/Lab/Shader/Valid','role':'GateEnable'}]
                api('/api/config',configuration)
                api('/api/input/mode',{'mode':'osc'})
                bridge=subprocess.Popen([sys.executable,str(Path(__file__).with_name('shader-osc-bridge.py')),'--image',str(current),'--port',str(osc),'--watch','--duration','5','--timeout','.8'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
                def preview():return {x['path']:x['numericValue'] for x in api('/api/state/overview')['osc']['preview']}
                def wait_gate(value,timeout=3):
                    until=time.monotonic()+timeout
                    while True:
                        values=preview()
                        if values.get('Sensa/Lab/Shader/Valid')==value:return values
                        if time.monotonic()>until:raise AssertionError(f'Missing gate={value}: {values}')
                        time.sleep(.04)
                wait_gate(0)
                # Atomically replace the source, matching the editor PNG exporter.
                next_file=root/'next.png';shutil.copyfile(args.next,next_file);next_file.replace(current)
                fresh=wait_gate(1)
                expected=(.06,0,.12)
                for axis,value in zip('XYZ',expected):assert abs(fresh['Sensa/Lab/Shader/'+axis]-value)<.00005
                api('/api/input/active',{'active':True})
                time.sleep(.1)
                mapped=api('/api/state/overview')['runtime']['command']['l0']
                assert abs(mapped-.6)<.001, mapped
                stale=wait_gate(0)
                until=time.monotonic()+2
                while not api('/api/state/overview')['runtime']['gateClosed']:
                    assert time.monotonic()<until,'Stale bridge did not close the motion gate'
                    time.sleep(.03)
                api('/api/input/active',{'active':False})
                assert not api('/api/config')['outputs']
                report={'passed':True,'source':'Two actual Unity SPS GPU-encoded PNG snapshots replayed; not live VR capture','timeoutSeconds':.8,'fresh':fresh,'mappedL0':mapped,'motionGateClosedAfterFreeze':True,'afterFreeze':stale,'outputs':[]}
                args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print('Shader PNG -> bridge -> Sensa OSC passed; frozen frame gate closed; no outputs configured.')
            finally:
                for process in (bridge,service):
                    if process is None:continue
                    process.terminate()
                    try:process.wait(timeout=5)
                    except subprocess.TimeoutExpired:process.kill();process.wait()

if __name__=='__main__':main()
