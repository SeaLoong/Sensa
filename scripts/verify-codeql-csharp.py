"""Check measured CodeQL C# quality and archived tracked-source coverage.

This reads the query result already produced by CodeQL analysis. It does not
rerun a query suite, exclude source paths, or substitute build success for data.
"""
import argparse
import datetime
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
THRESHOLD = 85.0
METRICS = (
    'Percentage of calls with call target',
    'Percentage of expressions with known type',
)
NONE_METRIC = "Is extracted with build-mode set to 'none'"


class VerificationError(ValueError):
    pass


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def git(repository, *arguments):
    result = subprocess.run(['git', *arguments], cwd=repository,
                            capture_output=True, check=True)
    return result.stdout


def numeric_metrics(decoded):
    """Accept the actual two-column BQRS select result, never a summary banner."""
    if not isinstance(decoded, dict):
        raise VerificationError('ExtractorInformation is not a JSON result object')
    table = decoded.get('#select')
    columns = table.get('columns') if isinstance(table, dict) else None
    if not isinstance(columns, list) or len(columns) != 2:
        raise VerificationError('ExtractorInformation has no two-column #select result')
    rows = table.get('tuples')
    if not isinstance(rows, list):
        raise VerificationError('ExtractorInformation has no result tuples')
    wanted = (*METRICS, NONE_METRIC)
    measured = {}
    for row in rows:
        if not isinstance(row, list) or len(row) != 2:
            raise VerificationError('ExtractorInformation contains an invalid metric tuple')
        key, value = row
        if not isinstance(key, str):
            raise VerificationError('ExtractorInformation contains a non-string metric key')
        if key not in wanted:
            continue
        if key in measured:
            raise VerificationError(f'Duplicate measured metric: {key}')
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise VerificationError(f'Metric is not a finite number: {key}')
        measured[key] = value
    missing = sorted(set(wanted) - measured.keys())
    if missing:
        raise VerificationError('Missing measured metrics: ' + ', '.join(missing))
    for key in METRICS:
        if not 0 <= measured[key] <= 100:
            raise VerificationError(f'Percentage outside 0..100: {key}')
    if measured[NONE_METRIC] not in (0, 1):
        raise VerificationError('Invalid standalone-extraction metric')
    return measured


def source_equivalent(actual, expected):
    if actual == expected:
        return 'exact'
    # CodeQL source archives may normalize encoding markers or line endings.
    # Accept only these textual changes, never altered source tokens.
    try:
        archived = actual.decode('utf-8-sig').replace('\r\n', '\n')
        tracked = expected.decode('utf-8-sig').replace('\r\n', '\n')
    except UnicodeDecodeError:
        return None
    return 'utf8-bom-or-newlines' if archived == tracked else None


def source_coverage(repository, commit, archive):
    tracked = [name for name in git(repository, 'ls-tree', '-r', '--name-only', '-z', commit)
               .decode('utf-8').split('\0')
               if name and Path(name).suffix.lower() == '.cs']
    if not tracked:
        raise VerificationError('No tracked C# sources found; coverage cannot be verified')
    prefix = repository.resolve().as_posix().rstrip('/')
    expected = {name: git(repository, 'show', f'{commit}:{name}') for name in tracked}
    matched = []
    missing = []
    mismatched = []
    with zipfile.ZipFile(archive) as source_zip:
        names = source_zip.namelist()
        if len(names) != len(set(names)):
            raise VerificationError('Source archive contains duplicate entry names')
        name_set = set(names)
        for name in sorted(expected):
            candidates = [key for key in (name, prefix + '/' + name,
                                         prefix.lstrip('/') + '/' + name) if key in name_set]
            candidates = sorted(set(candidates))
            if not candidates:
                missing.append(name)
                continue
            matches = []
            for entry in candidates:
                actual = source_zip.read(entry)
                comparison = source_equivalent(actual, expected[name])
                if comparison:
                    matches.append({'path': name, 'archiveEntry': entry,
                                    'comparison': comparison,
                                    'gitBlobSha256': sha256(expected[name]),
                                    'archiveContentSha256': sha256(actual)})
            if not matches:
                mismatched.append(name)
            else:
                matched.append(matches[0])
        extra = sorted(name for name in names if name.lower().endswith('.cs')
                       and name not in {row['archiveEntry'] for row in matched})
    return {'trackedCSharpCount': len(tracked), 'matchedCount': len(matched),
            'missing': missing, 'contentMismatches': mismatched, 'matched': matched,
            'additionalCSharpEntryCount': len(extra), 'additionalCSharpEntries': extra,
            'allTrackedSourcesCovered': not missing and not mismatched}


def database_path(arguments):
    if arguments.database:
        return Path(arguments.database).resolve()
    if not arguments.databases_json:
        raise VerificationError('CodeQL did not provide a C# database location')
    locations = json.loads(arguments.databases_json)
    if not isinstance(locations, dict) or not isinstance(locations.get('csharp'), str):
        raise VerificationError('CodeQL database-location output has no C# database')
    if not locations['csharp']:
        raise VerificationError('CodeQL returned an empty C# database path')
    return Path(locations['csharp']).resolve()


def verify(arguments):
    repository = Path(arguments.repository).resolve()
    report = {'schema': 1, 'observedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'language': 'csharp', 'configuredBuildMode': 'manual',
              'repository': os.environ.get('GITHUB_REPOSITORY'),
              'runId': os.environ.get('GITHUB_RUN_ID'),
              'runAttempt': os.environ.get('GITHUB_RUN_ATTEMPT'),
              'expectedCommit': arguments.expected_commit, 'threshold': THRESHOLD,
              'querySuiteRerun': False, 'metrics': None, 'sourceCoverage': None,
              'errors': [], 'result': 'failed'}
    errors = report['errors']
    database = None
    try:
        commit = git(repository, 'rev-parse', 'HEAD').decode('ascii').strip()
        report['commit'] = commit
        if arguments.expected_commit and commit != arguments.expected_commit:
            errors.append('Checked-out commit differs from the requested source commit')
        database = database_path(arguments)
        report['databasePath'] = str(database)
        if not database.is_dir():
            raise VerificationError('C# database directory is missing')
        archive = database / 'src.zip'
        if not archive.is_file() or not archive.resolve().is_relative_to(database):
            errors.append('C# database source archive src.zip is missing or outside the database')
        else:
            try:
                coverage = source_coverage(repository, commit, archive)
                report['sourceCoverage'] = coverage
                report['sourceArchiveSha256'] = sha256(archive.read_bytes())
                if not coverage['allTrackedSourcesCovered']:
                    errors.append('Tracked C# sources are absent from or differ in the source archive')
            except (VerificationError, OSError, ValueError, zipfile.BadZipFile,
                    subprocess.CalledProcessError) as error:
                errors.append('Source coverage verification failed: ' + type(error).__name__)
        candidates = sorted(path for path in (database / 'results').rglob('ExtractorInformation.bqrs')
                            if path.parent.name == 'Telemetry')
        if len(candidates) != 1:
            errors.append(f'Expected exactly one C# extraction metric result; found {len(candidates)}')
        elif not arguments.codeql:
            errors.append('CodeQL did not provide its analysis binary path')
        else:
            decoded_path = Path(arguments.output).resolve().with_name('csharp-metrics.json')
            decoded_path.parent.mkdir(parents=True, exist_ok=True)
            command = [arguments.codeql, 'bqrs', 'decode', '--format=json',
                       '--output=' + str(decoded_path), str(candidates[0])]
            decoded = subprocess.run(command, capture_output=True, timeout=120)
            report['metricBqrsPath'] = str(candidates[0])
            report['metricBqrsSha256'] = sha256(candidates[0].read_bytes())
            report['metricDecodeExitCode'] = decoded.returncode
            if decoded.returncode != 0:
                errors.append(f'CodeQL metric decoding failed with exit {decoded.returncode}')
            elif not decoded_path.is_file():
                errors.append('CodeQL did not write decoded metrics')
            else:
                try:
                    measured = numeric_metrics(json.loads(decoded_path.read_text(encoding='utf-8')))
                    report['metrics'] = measured
                    for key in METRICS:
                        if measured[key] < THRESHOLD:
                            errors.append(f'{key} is below {THRESHOLD:g}%')
                    if measured[NONE_METRIC] != 0:
                        errors.append('C# was extracted in standalone none mode rather than a traced build')
                except (VerificationError, OSError, ValueError) as error:
                    errors.append('Measured metric verification failed: ' + str(error))
    except (VerificationError, OSError, ValueError, subprocess.SubprocessError) as error:
        errors.append('C# verification could not complete: ' + type(error).__name__)
    if not errors:
        report['result'] = 'passed'
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    locations = parser.add_mutually_exclusive_group()
    locations.add_argument('--database', help='C# database directory')
    locations.add_argument('--databases-json', help='db-locations output from CodeQL analyze')
    parser.add_argument('--codeql', default='', help='codeql-path output from CodeQL init')
    parser.add_argument('--repository', default=str(ROOT))
    parser.add_argument('--expected-commit', default=os.environ.get('GITHUB_SHA', ''))
    parser.add_argument('--output', required=True)
    arguments = parser.parse_args()
    report = verify(arguments)
    output = Path(arguments.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    summary = {'result': report['result'], 'commit': report.get('commit'),
               'metrics': report['metrics'], 'trackedSources':
               (report['sourceCoverage'] or {}).get('trackedCSharpCount'),
               'coveredSources': (report['sourceCoverage'] or {}).get('matchedCount'),
               'errors': report['errors']}
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if report['result'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())
