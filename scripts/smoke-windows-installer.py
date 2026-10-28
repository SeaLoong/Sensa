"""Actions-only install, native application smoke and uninstall in a temp directory.
仅在 Actions 中执行临时目录安装、原生程序冒烟与卸载。
"""
import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from process_smoke import require_ci, wait_for_state
from release import PROTOCOL_BRIDGE_ASSETS

ROOT = Path(__file__).resolve().parents[1]


def wait_for_uninstaller(uninstaller, timeout=10, *, clock=None, sleep=None):
    # Inno's launcher can exit while its helper still holds the original EXE.
    # Inno 启动进程退出后，自删除辅助进程可能仍占用原始 EXE。
    wait_for_state(lambda: {'uninstallerExists': uninstaller.exists()},
                   lambda state: not state['uninstallerExists'],
                   'Uninstaller self-removal did not finish / 卸载程序未完成自删除',
                   timeout=timeout, clock=clock, sleep=sleep)


def verify_installer(installer, single, report):
    require_ci()
    if os.name != 'nt':
        raise RuntimeError('Windows installer smoke requires Windows / Windows 安装器冒烟需要 Windows')
    report.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='sensa-installer-smoke-') as temporary:
        directory = Path(temporary) / 'app'
        uninstaller = directory / 'unins000.exe'
        def install(log):
            subprocess.run([str(installer.resolve()), '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART',
                            '/CURRENTUSER', '/NOICONS', '/DIR=' + str(directory),
                            '/LOG=' + str((report / log).resolve())], check=True, timeout=180)
        try:
            install('install.log')
            executable = directory / 'Sensa.exe'
            if hashlib.sha256(executable.read_bytes()).digest() != hashlib.sha256(single.read_bytes()).digest():
                raise AssertionError('Installed application differs from the checked single EXE / 安装后程序与已检查单文件不同')
            for name in ('docs/parameter-geometry.html', 'scripts/shader-osc-bridge.py', 'scripts/telemetry_qr.py', 'LICENSE', *PROTOCOL_BRIDGE_ASSETS):
                if not (directory / name).is_file():
                    raise AssertionError('Missing installed offline asset / 安装后缺少离线内容: ' + name)
            for name in PROTOCOL_BRIDGE_ASSETS:
                if (directory / name).read_bytes() != (ROOT / name).read_bytes():
                    raise AssertionError('Installed protocol bridge differs from source / 安装后的协议桥与源码不同: ' + name)
            subprocess.run([sys.executable, str(ROOT / 'scripts/smoke.py'), '--exe', str(executable),
                            '--report-dir', str((report / 'application').resolve())], check=True, timeout=300)
            (directory / 'config.json').write_text('user configuration must survive uninstall', encoding='utf-8')
            (directory / 'recordings').mkdir(exist_ok=True)
            (directory / 'recordings/user.txt').write_text('user recording', encoding='utf-8')
            install('reinstall.log')
            if (directory / 'config.json').read_text(encoding='utf-8') != 'user configuration must survive uninstall':
                raise AssertionError('Reinstall changed user configuration / 重新安装改写了用户配置')
            if (directory / 'recordings/user.txt').read_text(encoding='utf-8') != 'user recording':
                raise AssertionError('Reinstall changed user recordings / 重新安装改写了用户录制')
        finally:
            if uninstaller.is_file():
                subprocess.run([str(uninstaller), '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART',
                                '/LOG=' + str((report / 'uninstall.log').resolve())], check=True, timeout=180)
                wait_for_uninstaller(uninstaller)
        if (directory / 'Sensa.exe').exists() or (directory / 'docs/parameter-geometry.html').exists():
            raise AssertionError('Uninstaller left installed program files / 卸载后残留安装的程序文件')
        if not (directory / 'config.json').is_file() or not (directory / 'recordings/user.txt').is_file():
            raise AssertionError('Uninstaller removed user data / 卸载程序删除了用户数据')
    (report / 'result.txt').write_text('Install, isolated application smoke and uninstall passed.\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--installer', type=Path, required=True)
    parser.add_argument('--single-file', type=Path, required=True)
    parser.add_argument('--report-dir', type=Path, required=True)
    args = parser.parse_args()
    verify_installer(args.installer, args.single_file, args.report_dir)


if __name__ == '__main__':
    main()
