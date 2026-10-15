"""Run local Unity lab checks, requiring fresh passing reports as well as a zero exit code.

Does not upload content, connect devices, install packages, or change Git remotes.
Close the selected project in Unity first. GPU suites deliberately keep graphics enabled.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import time
import uuid
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SUITES = {
    'world-editor': ('world', 'SensaLab.LabValidation.Run', False, [
        'Validation/editor-results.json', 'Validation/editor/material-isolation.json']),
    'world-functional': ('world', 'SensaLab.FunctionalValidation.Run', False, [
        'Validation/functional/results.json', 'Validation/interaction/world.json',
        'Validation/functional/material-isolation.json']),
    'world-geometry': ('world', 'SensaLab.LabPlayValidation.Run', False, [
        'Validation/playmode-status.json', 'Validation/point-cases-playmode.json',
        'Validation/locomotion-playmode.json', 'Validation/material-isolation.json']),
    'world-offset': ('world', 'SensaLab.LabPlayValidation.RunOffset', False, [
        'Validation/offset/playmode-status.json', 'Validation/offset/point-cases-playmode.json',
        'Validation/offset/locomotion-playmode.json', 'Validation/offset/material-isolation.json']),
    'avatar-tests': ('avatar', 'SensaAvatarLab.AvatarLab.PrepareTests', False, []),
    'avatar-build': ('avatar', 'SensaAvatarLab.AvatarLab.BuildFullFlowWithSdk', False, [
        'Validation/sdk-full-flow-build.json', 'Validation/sdk-full-flow-contents.json']),
}


def fingerprint(path):
    if not path.is_file():
        return None
    return (path.stat().st_mtime_ns, hashlib.sha256(path.read_bytes()).hexdigest())


def validate_report(path, before, started_ns):
    current = fingerprint(path)
    if current is None:
        raise ValueError(f'Missing report: {path}')
    # Allow coarse filesystem timestamps, but never accept an unchanged old report.
    if current == before or current[0] < started_ns - 2_000_000_000:
        raise ValueError(f'Stale report: {path}')
    if path.suffix == '.xml':
        root = ET.parse(path).getroot()
        total, passed = int(root.get('total', '0')), int(root.get('passed', '0'))
        if root.tag != 'test-run' or root.get('result') != 'Passed' or total <= 0 or passed != total:
            raise ValueError(f'Failed, empty or skipped Unity tests: {path}')
    else:
        data = json.loads(path.read_text(encoding='utf-8-sig'))
        if not isinstance(data, dict) or data.get('passed') is not True:
            raise ValueError(f'Report did not pass: {path}')
    return current


def run_suite(name, project, unity, output, timeout):
    _, method, quit_after, relative_reports = SUITES[name]
    folder = output / name
    folder.mkdir(parents=True, exist_ok=False)
    reports = [project / item for item in relative_reports]
    command = [str(unity), '-batchmode', '-projectPath', str(project), '-executeMethod', method,
               '-logFile', str(folder / 'unity.log')]
    if quit_after:
        command.append('-quit')
    if name == 'avatar-tests':
        results = folder / 'tests.xml'
        command.extend(['-runTests', '-testPlatform', 'EditMode', '-testFilter', 'UnityBox.Sensa.Tests',
                        '-testResults', str(results)])
        reports.append(results)
    before = {path: fingerprint(path) for path in reports}
    authoring = [project / 'Assets/SensaLab/Functional/FunctionalLab.unity',
                 project / 'Assets/SensaLab/Generated/SensaLab.unity'] if SUITES[name][0] == 'world' else []
    source_hashes = {path: fingerprint(path)[1] for path in authoring if path.is_file()}
    started_ns = time.time_ns()
    result = {'suite': name, 'project': str(project), 'passed': False, 'command': command,
              'startedUtc': datetime.now(timezone.utc).isoformat(), 'reports': []}
    try:
        # subprocess.run waits for the actual Unity process on Windows too.
        # Timeout kills only the process launched here, never another open editor.
        with (folder / 'launcher.log').open('w', encoding='utf-8') as log:
            process = subprocess.run(command, stdout=log, stderr=log, timeout=timeout, check=False)
        result['exitCode'] = process.returncode
        if process.returncode != 0:
            raise ValueError(f'Unity exited with code {process.returncode}; see {folder / "unity.log"}')
        for path, digest in source_hashes.items():
            current = fingerprint(path)
            if current is None or current[1] != digest:
                raise ValueError(f'Validation changed an authoring scene: {path}')
        result['authoringScenesUnchanged'] = True if source_hashes else None
        for index, path in enumerate(reports):
            validate_report(path, before[path], started_ns)
            copy = folder / f'{index}-{path.name}'
            copy.write_bytes(path.read_bytes())
            result['reports'].append(str(copy))
        result['passed'] = True
    except (OSError, ValueError, ET.ParseError, subprocess.TimeoutExpired) as exc:
        result['error'] = str(exc)
    result['durationSeconds'] = round((time.time_ns() - started_ns) / 1e9, 2)
    (folder / 'result.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--unity', required=True, type=Path)
    parser.add_argument('--world', type=Path)
    parser.add_argument('--avatar', type=Path)
    parser.add_argument('--suite', action='append', choices=SUITES, required=True)
    parser.add_argument('--timeout', type=float, default=900, help='Seconds per Unity process (default: 900)')
    parser.add_argument('--output', type=Path, help='New output directory; existing directories are never reused')
    args = parser.parse_args()
    if not args.unity.is_file() or not 0 < args.timeout < float('inf'):
        parser.error('Expected a Unity executable and a positive finite timeout')
    for name in args.suite:
        project = getattr(args, SUITES[name][0])
        if project is None or not (project / 'ProjectSettings/ProjectVersion.txt').is_file():
            parser.error(f'{name} requires an existing --{SUITES[name][0]} Unity project')
    if len(set(args.suite)) != len(args.suite):
        parser.error('Do not repeat a suite in the same run')
    output = (args.output or ROOT / 'artifacts/lab-validation' /
              (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8])).resolve()
    output.mkdir(parents=True, exist_ok=False)
    results = []
    for name in args.suite:
        print(f'Running {name}; logs: {output / name}', flush=True)
        result = run_suite(name, getattr(args, SUITES[name][0]).resolve(), args.unity.resolve(), output, args.timeout)
        results.append(result)
        summary = {'passed': len(results) == len(args.suite) and all(r['passed'] for r in results),
                   'requested': args.suite, 'results': results,
                   'unverified': ['VRChat client avatar OSC', 'VR hand interaction', 'HMD image visibility', 'physical devices']}
        (output / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
        print(f'{name}: {"PASS" if result["passed"] else result.get("error", "FAIL")}', flush=True)
        if not result['passed']:
            return 1
    print(f'Report: {output / "summary.json"}', flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
