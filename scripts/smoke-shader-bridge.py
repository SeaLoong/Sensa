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
        configuration['signals'] = []
        api('/api/config', configuration)
        assert not api('/api/state/overview')['runtime']['inputActive'], '诊断回放必须保持输入关闭。 / Diagnostic replay must keep input disarmed.'
        prefix = 'Sensa/Shader/v1/0/'
        bridge=session.start_child([sys.executable,str(Path(__file__).with_name('shader-osc-bridge.py')),'--image',str(current),'--port',str(osc),'--watch','--duration','12','--timeout','.8'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        def preview():return {x['path']:x['numericValue'] for x in api('/api/state/overview')['osc']['preview']}
        def wait_gate(value, timeout=3):
            return wait_for_state(preview, lambda values: values.get(prefix + 'Valid') == value,
                                  f'未收到 Valid 门控 / Missing Valid gate={value}', timeout=timeout)
        wait_gate(0)
        # Atomically replace the source, matching the editor PNG exporter.
        def replace_image(path):
            next_file=root/'next.png';shutil.copyfile(path,next_file);replace_frame(next_file,current)
        replace_image(args.next)
        fresh=wait_gate(1)
        expected=(.06,0,.12)
        for axis,value in zip('XYZ',expected): assert abs(fresh[prefix + axis]-value)<.00005
        assert fresh[prefix + 'Profile'] == 0 and fresh[prefix + 'Producer'] == 0
        assert not api('/api/state/overview')['runtime']['inputActive']
        if args.corrupt:
            replace_image(args.corrupt);wait_gate(0)
            replace_image(args.next);time.sleep(.12)
            assert preview()[prefix + 'Valid']==0,'An old good frame reopened the gate after CRC failure'
            replace_image(args.recover_first);time.sleep(.12)
            assert preview()[prefix + 'Valid']==0,'One recovery frame reopened the gate'
            replace_image(args.recover_next);wait_gate(1)
        stale=wait_gate(0)
        assert stale[prefix + 'Profile'] == 0 and stale[prefix + 'Producer'] == 0
        assert not api('/api/state/overview')['runtime']['inputActive']
        assert not api('/api/config')['outputs']
        report={'passed':True,'source':'Unity diagnostic Profile0 PNG replay; not native root capture or motion evidence','timeoutSeconds':.8,'fresh':fresh,'profile':0,'inputActive':False,'crcClosesTransportGate':bool(args.corrupt),'oldFrameRejected':bool(args.corrupt),'twoFrameRecoveryVerified':bool(args.corrupt),'transportGateClosedAfterFreeze':True,'afterFreeze':stale,'outputs':[]}
        args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print('诊断 PNG → bridge → OSC 通过；输入保持关闭。 / Diagnostic PNG -> bridge -> OSC passed; input stayed disarmed.')
        session.complete()


if __name__ == '__main__':
    main()
