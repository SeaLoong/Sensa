"""Run the shared local XERJ code/document index used by Codex."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]
URL = 'http://127.0.0.1:19200'
IDENTITY = hashlib.sha256(str(ROOT).encode()).hexdigest()[:12]
STATE_BASE = (Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData/Local')) / 'Sensa'
              if os.name == 'nt' else
              Path(os.environ.get('XDG_STATE_HOME', Path.home() / '.local/state')) / 'sensa')
STATE = STATE_BASE / 'xerj' / IDENTITY
STARTUP_TIMEOUT = 110


def executable():
    value = os.environ.get('XERJ_BIN', '')
    path = Path(value)
    if not value or not path.is_absolute() or not path.is_file():
        raise RuntimeError('Set XERJ_BIN to the absolute path of the installed XERJ binary.')
    return str(path)


def child_environment():
    environment = {key: value for key, value in os.environ.items()
                   if key not in ('XERJ_CONFIG', 'XERJ_AUTH', 'XERJ_API_KEY', 'TYPESAFE_API_KEY')
                   and not key.lower().endswith('_proxy')}
    return {**environment, 'XERJ_URL': URL, 'XERJ_DISABLE_FEEDBACK': 'true',
            'NO_PROXY': '127.0.0.1,localhost,::1', 'no_proxy': '127.0.0.1,localhost,::1'}


def native_options():
    return {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}


def acquire_lock():
    """An open locked handle owns the service; closing it releases ownership."""
    STATE.mkdir(parents=True, exist_ok=True)
    handle = (STATE / 'service.lock').open('a+b')
    handle.seek(0, os.SEEK_END)
    if handle.tell() == 0:
        handle.write(b'0')
        handle.flush()
    handle.seek(0)
    try:
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()
        return None
    return handle


def healthy():
    try:
        with build_opener(ProxyHandler({})).open(URL + '/_cluster/health', timeout=1) as response:
            return response.status == 200
    except (OSError, URLError):
        return False


def ready():
    # Never trust a leftover readiness file after its supervisor has exited.
    guard = acquire_lock()
    if guard is not None:
        try:
            (STATE / 'ready.json').unlink(missing_ok=True)
        finally:
            guard.close()
        return False
    try:
        marker = json.loads((STATE / 'ready.json').read_text(encoding='utf-8'))
        return marker == {'root': str(ROOT), 'url': URL} and healthy()
    except (OSError, ValueError):
        return False


def index_command(binary, watch=False):
    command = [binary, 'autoindex', str(ROOT), '--url', URL,
               '--state-dir', str(STATE / 'autoindex'), '--prefix', 'sensa',
               '--no-graph', '--workers', '2', '--max-file-mb', '10',
               '--yes', '--disable-feedback']
    if watch:
        command += ['--watch', '--debounce', '1000']
    return command


def watcher_ready(offset):
    # Read only this launch's tail; old successful watch logs are not readiness.
    with (STATE / 'autoindex.log').open('rb') as log:
        log.seek(0, os.SEEK_END)
        log.seek(max(offset, log.tell() - 4096))
        return re.search(rb'(?m)^watch: [0-9]+ directories watched', log.read()) is not None


def stop_child(child):
    if child.poll() is None:
        child.terminate()
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=10)


def wait_until(check, children, deadline):
    while True:
        if (STATE / 'stop').exists():
            raise RuntimeError('XERJ stop requested.')
        for child in children:
            if child.poll() is not None:
                raise RuntimeError(f'XERJ child exited ({child.returncode}); inspect {STATE}.')
        if check():
            return
        if time.monotonic() >= deadline:
            raise RuntimeError(f'XERJ startup timed out; inspect {STATE}.')
        time.sleep(0.2)


def serve():
    binary = executable()
    guard = acquire_lock()
    if guard is None:
        return 0
    children = []
    try:
        (STATE / 'ready.json').unlink(missing_ok=True)
        (STATE / 'stop').unlink(missing_ok=True)
        # Native XERJ also reserves the next two ports; do not adopt another node.
        for port in (19200, 19201, 19202):
            with socket.socket() as probe:
                try:
                    probe.bind(('127.0.0.1', port))
                except OSError as error:
                    raise RuntimeError(f'Port {port} is occupied; stop its owner before starting XERJ.') from error
        config = STATE / 'xerj.toml'
        config.write_text('[rerank]\nenabled = false\n', encoding='utf-8')
        environment = child_environment()
        deadline = time.monotonic() + STARTUP_TIMEOUT
        with (STATE / 'node.log').open('ab') as node_log, \
                (STATE / 'initial-index.log').open('ab') as initial_log, \
                (STATE / 'autoindex.log').open('ab') as index_log:
            node = subprocess.Popen(
                [binary, '--config', str(config), '--bind', '127.0.0.1', '--insecure',
                 '--embed-mode', 'lexical', '--port', '19200', '--no-auto-port',
                 '--data-dir', str(STATE / 'data')],
                cwd=ROOT, env=environment, stdin=subprocess.DEVNULL, stdout=node_log, stderr=node_log,
                **native_options())
            children.append(node)
            wait_until(healthy, children, deadline)
            initial = subprocess.Popen(index_command(binary), cwd=ROOT, env=environment,
                                       stdin=subprocess.DEVNULL, stdout=initial_log, stderr=initial_log,
                                       **native_options())
            children.append(initial)
            wait_until(lambda: initial.poll() is not None, [node], deadline)
            if initial.returncode not in (0, 3):
                raise RuntimeError(f'Initial XERJ indexing failed; inspect {STATE / "initial-index.log"}.')
            if initial.returncode == 3:
                print(f'XERJ indexing completed with skipped/junk files; inspect {STATE / "initial-index.log"}.',
                      file=sys.stderr)
            children.remove(initial)
            watch_offset = index_log.seek(0, os.SEEK_END)
            watcher = subprocess.Popen(index_command(binary, watch=True), cwd=ROOT, env=environment,
                                       stdin=subprocess.DEVNULL, stdout=index_log, stderr=index_log,
                                       **native_options())
            children.append(watcher)
            wait_until(lambda: watcher_ready(watch_offset), children, deadline)
            marker = STATE / 'ready.tmp'
            marker.write_text(json.dumps({'root': str(ROOT), 'url': URL}), encoding='utf-8')
            marker.replace(STATE / 'ready.json')
            while not (STATE / 'stop').exists():
                for child in children:
                    if child.poll() is not None:
                        raise RuntimeError(f'XERJ child exited; inspect {STATE}.')
                time.sleep(0.5)
    finally:
        (STATE / 'ready.json').unlink(missing_ok=True)
        for child in reversed(children):
            stop_child(child)
        guard.close()
    return 0


def ensure_service():
    if ready():
        return
    binary = executable()
    STATE.mkdir(parents=True, exist_ok=True)
    options = ({'creationflags': subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP}
               if os.name == 'nt' else {'start_new_session': True})
    with (STATE / 'launcher.log').open('ab') as log:
        supervisor = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), 'serve'],
                                      cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                      env={**child_environment(), 'XERJ_BIN': binary}, **options)
    deadline = time.monotonic() + STARTUP_TIMEOUT + 2
    while not ready():
        if supervisor.poll() not in (None, 0):
            raise RuntimeError(f'XERJ supervisor failed; inspect {STATE / "launcher.log"}.')
        if time.monotonic() >= deadline:
            raise RuntimeError(f'XERJ not ready; inspect {STATE / "launcher.log"}.')
        time.sleep(0.2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('mcp', 'serve', 'status', 'stop'))
    args = parser.parse_args()
    if args.command == 'serve':
        return serve()
    if args.command == 'mcp':
        binary = executable()
        ensure_service()
        # Explicit stdio preserves MCP pipe handles with CREATE_NO_WINDOW on Windows.
        return subprocess.run([binary, 'mcp'], cwd=ROOT, env=child_environment(),
                              stdin=sys.stdin, stdout=sys.stdout, stderr=sys.stderr,
                              **native_options()).returncode
    if args.command == 'status':
        running = ready()
        print(f'{"ready" if running else "stopped/starting"}: {URL}\nstate: {STATE}')
        return 0 if running else 1
    STATE.mkdir(parents=True, exist_ok=True)
    (STATE / 'stop').touch()
    print(f'Stop requested; state: {STATE}')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, RuntimeError) as error:
        print(f'XERJ: {error}', file=sys.stderr)
        sys.exit(1)
