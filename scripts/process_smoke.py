"""Isolated process-smoke lifecycle, HTTP session and bounded waiting.
隔离进程冒烟的生命周期、HTTP 会话及有界等待。
"""
from dataclasses import dataclass
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request


def require_ci():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise RuntimeError('完整进程冒烟仅能在 GitHub Actions 执行。 / Full-process smoke runs only in GitHub Actions.')


def free_port(kind):
    with socket.socket(socket.AF_INET, kind) as probe:
        probe.bind(('127.0.0.1', 0))
        return probe.getsockname()[1]


def wait_for_state(fetch, predicate, description, timeout=5, *, clock=None, sleep=None):
    clock, sleep = clock or time.monotonic, sleep or time.sleep
    deadline = clock() + timeout
    while True:
        state = fetch()
        if predicate(state):
            return state
        if clock() >= deadline:
            raise AssertionError(description + '; 最后观察状态 / last observed state: ' + json.dumps(state, ensure_ascii=False))
        sleep(.05)


@dataclass(frozen=True)
class SmokeAdapters:
    popen: object = subprocess.Popen
    urlopen: object = urllib.request.urlopen
    reserve_port: object = free_port
    clock: object = time.monotonic
    sleep: object = time.sleep


class SmokeSession:
    """Own one device-free Sensa process, its children, cookie and diagnostic files.
    管理一个无设备 Sensa 进程、子进程、会话 Cookie 及诊断文件。
    """
    def __init__(self, command, *, osc_enabled=False, report_dir=None, startup_timeout=30, adapters=None):
        self.command = list(command)
        self.osc_enabled, self.report_dir = osc_enabled, Path(report_dir) if report_dir else None
        self.startup_timeout, self.adapters = startup_timeout, adapters or SmokeAdapters()
        self.passed, self.process, self.cookie = False, None, None
        self._children, self._temporary, self._log = [], None, None

    def __enter__(self):
        require_ci()
        if not self.command:
            raise ValueError('缺少 Sensa 启动命令。 / Missing Sensa launch command.')
        self._temporary = tempfile.TemporaryDirectory(prefix='sensa-process-smoke-')
        self.root = Path(self._temporary.name)
        try:
            self.port = self.adapters.reserve_port(socket.SOCK_STREAM)
            self.osc_port = self.adapters.reserve_port(socket.SOCK_DGRAM)
            self.base = f'http://127.0.0.1:{self.port}'
            config = self.root / 'config.json'
            config.write_text(json.dumps({
                'webUi': {'host': '127.0.0.1', 'port': self.port},
                'osc': {'enabled': self.osc_enabled, 'receiverHost': '127.0.0.1', 'receiverPort': self.osc_port,
                        'oscQueryEnabled': False, 'oscQueryReceiver': {'enabled': False}},
                'outputs': [],
            }), encoding='utf-8')
            self._log = (self.root / 'service.log').open('w+', encoding='utf-8')
            self.process = self.start_child([*self.command, '--open-browser', 'false'], cwd=str(self.root),
                                           env=dict(os.environ, SENSA_CONFIG_PATH=str(config)),
                                           stdout=self._log, stderr=self._log)
            self._await_session()
            if self.api('/api/config')['outputs']:
                raise AssertionError('冒烟工程禁止配置设备。 / Smoke configuration must have no outputs.')
            return self
        except BaseException:
            self.close()
            raise

    def start_child(self, command, **options):
        child = self.adapters.popen(command, **options)
        self._children.append(child)
        return child

    def _await_session(self):
        deadline = self.adapters.clock() + self.startup_timeout
        while True:
            try:
                with self.adapters.urlopen(self.base + '/api/session', timeout=1) as response:
                    self.cookie = response.headers['Set-Cookie'].split(';')[0]
                return
            except OSError as error:
                if self.process.poll() is not None or self.adapters.clock() >= deadline:
                    raise TimeoutError('Sensa 启动失败或超时。 / Sensa startup failed or timed out. ' + self.log_tail()) from error
                self.adapters.sleep(.1)

    def request(self, path, *, method='GET', body=None, headers=None, authenticated=True, timeout=10):
        values = {'Cookie': self.cookie, 'Origin': self.base} if authenticated else {}
        if body is not None:
            values['Content-Type'] = 'application/json'
        values.update(headers or {})
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(self.base + path, data=data, method=method, headers=values)
        return self.adapters.urlopen(request, timeout=timeout)

    def api(self, path, body=None, *, method=None):
        if path == '/api/config' and body is not None and (not isinstance(body, dict) or body.get('outputs') != []):
            raise AssertionError('冒烟配置更新必须显式保持 outputs=[]。 / Smoke configuration updates must explicitly keep outputs=[].')
        with self.request(path, method=method or ('GET' if body is None else 'PUT'), body=body) as response:
            return json.load(response)

    def complete(self):
        self.passed = True

    def log_tail(self):
        if self._log is None:
            return ''
        self._log.flush()
        self._log.seek(0)
        return self._log.read()[-20000:]

    def close(self):
        errors = []
        try:
            for child in reversed(self._children):
                try:
                    if child.poll() is None:
                        child.terminate()
                        try:
                            child.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            child.kill()
                            child.wait(timeout=5)
                except (OSError, subprocess.TimeoutExpired) as error:
                    errors.append(error)
                    self.passed = False
                finally:
                    for stream in (getattr(child, 'stdout', None), getattr(child, 'stderr', None)):
                        if stream is not None and stream is not self._log:
                            stream.close()
        finally:
            self._children.clear()
            try:
                if self.report_dir and self._log:
                    self.report_dir.mkdir(parents=True, exist_ok=True)
                    self._log.flush()
                    shutil.copyfile(self.root / 'service.log', self.report_dir / 'service.log')
                    (self.report_dir / 'result.json').write_text(json.dumps({
                        'passed': self.passed, 'outputs': [],
                        'scope': '隔离 HTTP/WS/OSC 进程；无硬件。 / Isolated HTTP/WS/OSC process; no hardware.',
                    }, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
            finally:
                if self._log:
                    self._log.close()
                    self._log = None
                if self._temporary:
                    self._temporary.cleanup()
                    self._temporary = None
        if errors:
            raise RuntimeError('子进程清理失败。 / Child-process cleanup failed: ' + str(errors[0])) from errors[0]

    def __exit__(self, error_type, error, traceback):
        if error is not None:
            self.passed = False
            print('Sensa 失败日志 / failure log:\n' + self.log_tail())
        self.close()
