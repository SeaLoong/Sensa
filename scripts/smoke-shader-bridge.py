"""仅在 GitHub Actions 重放 Unity PNG 到隔离 Sensa 进程。 / CI-only Unity PNG replay into an isolated Sensa process."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

from process_smoke import SmokeSession, require_ci, wait_for_state

def replace_frame(source, target):
    """Use the same replacement primitive as the Unity File.Replace exporter."""
    if os.name != 'nt':
        Path(source).replace(target)
        return
    import ctypes
    from ctypes import wintypes
    replace = ctypes.WinDLL('kernel32', use_last_error=True).ReplaceFileW
    replace.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPCWSTR,
                        wintypes.DWORD, wintypes.LPVOID, wintypes.LPVOID]
    replace.restype = wintypes.BOOL
    if not replace(str(Path(target).resolve()), str(Path(source).resolve()), None, 0, None, None):
        raise ctypes.WinError(ctypes.get_last_error())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--exe', required=True, type=Path, help='Sensa 可执行文件。 / Sensa executable.')
    parser.add_argument('--first', required=True, type=Path, help='首个 Unity PNG。 / First Unity PNG.')
    parser.add_argument('--next', required=True, type=Path, help='后继 Unity PNG。 / Next Unity PNG.')
    parser.add_argument('--report', required=True, type=Path, help='结果 JSON 路径。 / Result JSON path.')
    parser.add_argument('--corrupt', type=Path, help='CRC 损坏帧。 / Corrupt CRC frame.')
    parser.add_argument('--recover-first', type=Path, help='首个恢复帧。 / First recovery frame.')
    parser.add_argument('--recover-next', type=Path, help='第二个恢复帧。 / Second recovery frame.')
    args = parser.parse_args()
    try:
        require_ci()
    except RuntimeError as error:
        parser.error(str(error))
    if any((args.corrupt, args.recover_first, args.recover_next)) and not all((args.corrupt, args.recover_first, args.recover_next)):
        parser.error('故障恢复需要全部三个帧参数。 / Fault recovery needs --corrupt, --recover-first and --recover-next together.')
    with SmokeSession([str(args.exe.resolve())], osc_enabled=True, report_dir=args.report.parent / 'process') as session:
        root, osc, api = session.root, session.osc_port, session.api
        current = root / 'frame.png'
        shutil.copyfile(args.first, current)
        configuration=api('/api/config')
        assert not configuration['outputs'], 'Only an isolated, device-free configuration is allowed'
        configuration['signals']=[{'oscPath':'Sensa/Lab/Shader/Z','role':'Depth','vrchatMin':0,'vrchatMax':.2},{'oscPath':'Sensa/Lab/Shader/Valid','role':'GateEnable'}]
        api('/api/config',configuration)
        api('/api/input/mode',{'mode':'osc'})
        assert not api('/api/state/overview')['runtime']['inputActive'], '切换模式必须关闭输入。 / Changing mode must disarm input.'
        bridge=session.start_child([sys.executable,str(Path(__file__).with_name('shader-osc-bridge.py')),'--image',str(current),'--port',str(osc),'--watch','--duration','12','--timeout','.8'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        def preview():return {x['path']:x['numericValue'] for x in api('/api/state/overview')['osc']['preview']}
        def wait_gate(value, timeout=3):
            return wait_for_state(preview, lambda values: values.get('Sensa/Lab/Shader/Valid') == value,
                                  f'未收到 Valid 门控 / Missing Valid gate={value}', timeout=timeout)
        wait_gate(0)
        # Atomically replace the source, matching the editor PNG exporter.
        def replace_image(path):
            next_file=root/'next.png';shutil.copyfile(path,next_file);replace_frame(next_file,current)
        def wait_motion_gate(closed):
            return wait_for_state(lambda: api('/api/state/overview'),
                                  lambda overview: overview['runtime']['gateClosed'] == closed,
                                  '运动门控未变化。 / Motion gate did not change.', timeout=2)
        replace_image(args.next)
        fresh=wait_gate(1)
        expected=(.06,0,.12)
        for axis,value in zip('XYZ',expected):assert abs(fresh['Sensa/Lab/Shader/'+axis]-value)<.00005
        api('/api/input/active',{'active':True})
        mapped = wait_for_state(lambda: api('/api/state/overview'),
                                lambda overview: abs(overview['runtime']['command']['l0'] - .6) < .001,
                                '新鲜遥测未映射为 L0。 / Fresh telemetry did not map to L0.')['runtime']['command']['l0']
        assert abs(mapped-.6)<.001, mapped
        if args.corrupt:
            replace_image(args.corrupt);wait_gate(0);wait_motion_gate(True)
            replace_image(args.next);time.sleep(.12)
            assert preview()['Sensa/Lab/Shader/Valid']==0,'An old good frame reopened the gate after CRC failure'
            replace_image(args.recover_first);time.sleep(.12)
            assert preview()['Sensa/Lab/Shader/Valid']==0,'One recovery frame reopened the gate'
            replace_image(args.recover_next);wait_gate(1);wait_motion_gate(False)
        stale=wait_gate(0)
        wait_motion_gate(True)
        api('/api/input/active',{'active':False})
        assert not api('/api/config')['outputs']
        report={'passed':True,'source':'Actual Unity GPU-encoded PNG snapshots replayed; not live VR capture','timeoutSeconds':.8,'fresh':fresh,'mappedL0':mapped,'crcStopsMotion':bool(args.corrupt),'oldFrameRejected':bool(args.corrupt),'twoFrameRecoveryVerified':bool(args.corrupt),'motionGateClosedAfterFreeze':True,'afterFreeze':stale,'outputs':[]}
        args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print('Shader PNG → bridge → Sensa OSC 通过；冻结帧关闭门控，未配置设备。 / Shader PNG -> bridge -> Sensa OSC passed; frozen frame gate closed; no outputs configured.')
        session.complete()


if __name__ == '__main__':
    main()
