"""Compile all Sensa Unity C# for CodeQL using verified real SDK references.

prepare runs before CodeQL initialization and builds only external reference
assemblies. build runs after initialization and always compiles every tracked
Unity package and lab C# source. This does not launch Unity, import assets, run tests or validate a
Unity/VRChat client. Vendor binaries are never committed or published by this tool.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / '.github/codeql/unity-sources.json'
MARKER = '.sensa-codeql-unity'
MAX_FILES = 20000
MAX_FILE_BYTES = 256 * 1024 * 1024
MAX_EXPANDED_BYTES = 512 * 1024 * 1024


class HttpsOnlyRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        if urllib.parse.urlsplit(new_url).scheme != 'https':
            raise ValueError('Reference download redirects must retain HTTPS')
        return super().redirect_request(request, response, code, message, headers, new_url)


def reject_links(path: Path) -> None:
    if any(part.is_symlink() for part in (path, *path.parents)):
        raise ValueError('Generated paths must not contain symbolic links')


def digest(path: Path, algorithm: str = 'sha256') -> str:
    value = hashlib.new(algorithm)
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def safe_relative(name: str) -> Path:
    path = PurePosixPath(name)
    if (not name or path.is_absolute() or '..' in path.parts or '\\' in name
            or ':' in name or any(ord(c) < 32 for c in name)):
        raise ValueError('Unsafe archive or manifest path')
    return Path(*path.parts)


def inside(root: Path, name: str) -> Path:
    path = root / safe_relative(name)
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError('Path escapes the prepared directory')
    return path


def verify_archive(path: Path, spec: dict) -> bool:
    return (path.is_file() and not path.is_symlink()
            and path.stat().st_size == spec['bytes']
            and all(digest(path, key) == spec[key] for key in ('sha256', 'sha1', 'md5') if key in spec))


def archive(spec: dict, cache: Path, reuse: list[Path]) -> Path:
    suffix = '.zip' if spec['format'] == 'zip' else '.tar.gz' if spec['format'] == 'tar.gz' else '.tar.xz'
    target = cache / (spec['sha256'] + suffix)
    reject_links(target)
    if verify_archive(target, spec):
        return target
    for directory in reuse:
        if not directory.is_dir():
            continue
        # Local archives remain untrusted until the exact publisher/pinned hashes match.
        for candidate in directory.rglob('*' + suffix.replace('.tar.gz', '.tgz')):
            if candidate.is_file() and candidate.stat().st_size == spec['bytes'] and verify_archive(candidate, spec):
                return candidate
    request = urllib.request.Request(spec['url'], headers={'User-Agent': 'Sensa-CodeQL-reference-compiler'})
    if urllib.parse.urlsplit(spec['url']).scheme != 'https':
        raise ValueError('Reference downloads require HTTPS')
    partial = target.with_suffix(target.suffix + '.partial')
    reject_links(partial)
    try:
        with urllib.request.build_opener(HttpsOnlyRedirect()).open(request, timeout=60) as response, partial.open('wb') as output:
            received = 0
            while chunk := response.read(4 * 1024 * 1024):
                received += len(chunk)
                if received > spec['bytes']:
                    raise ValueError('Reference download exceeds its pinned size')
                output.write(chunk)
        if not verify_archive(partial, spec):
            raise ValueError('Reference download size or integrity does not match the lock')
        partial.replace(target)
    except (urllib.error.URLError, OSError) as exc:
        partial.unlink(missing_ok=True)
        raise RuntimeError('Reference download failed: ' + type(exc).__name__) from None
    except Exception:
        partial.unlink(missing_ok=True)
        raise
    return target


def extract_package(archive_path: Path, destination: Path, kind: str) -> None:
    seen: set[str] = set()
    total = 0

    def accept(name: str, size: int) -> Path:
        nonlocal total
        relative = safe_relative(name)
        key = relative.as_posix().casefold()
        if key in seen or len(seen) >= MAX_FILES or size < 0 or size > MAX_FILE_BYTES:
            raise ValueError('Duplicate or oversized archive member')
        seen.add(key)
        total += size
        if total > MAX_EXPANDED_BYTES:
            raise ValueError('Expanded package exceeds its limit')
        path = inside(destination, relative.as_posix())
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    if kind == 'zip':
        with zipfile.ZipFile(archive_path) as source:
            for member in source.infolist():
                if member.is_dir():
                    safe_relative(member.filename)
                    continue
                mode = member.external_attr >> 16
                if stat.S_IFMT(mode) not in (0, stat.S_IFREG):
                    raise ValueError('Links and special package entries are not supported')
                path = accept(member.filename, member.file_size)
                with source.open(member) as data, path.open('xb') as output:
                    shutil.copyfileobj(data, output)
    else:
        with tarfile.open(archive_path, 'r:gz') as source:
            for member in source:
                if member.isdir():
                    safe_relative(member.name)
                    continue
                if not member.isfile():
                    raise ValueError('Links and special package entries are not supported')
                path = accept(member.name, member.size)
                with source.extractfile(member) as data, path.open('xb') as output:
                    shutil.copyfileobj(data, output)


def prepare_sdk(output: Path, spec: dict, editor_root: Path | None, reuse: list[Path]) -> list[Path]:
    sdk = output / 'sdk'
    reject_links(sdk)
    profile = spec['reference_files']

    def valid(root: Path) -> bool:
        return all((path := inside(root, name)).is_file() and not path.is_symlink()
                   and digest(path) == expected for name, expected in profile.items())

    if editor_root is not None:
        candidates = [editor_root / 'Data', editor_root / 'Editor/Data', editor_root]
        source_root = next((root for root in candidates if valid(root)), None)
        if source_root is None:
            raise ValueError('Local Editor does not match the locked reference DLL hashes')
        for name in profile:
            target = inside(sdk, name)
            reject_links(target)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(inside(source_root, name), target)
    elif not valid(sdk):
        source_archive = archive(spec, output / 'cache', reuse)
        pending = set(profile)
        prefix = spec['archive_data_prefix']
        # The complete archive was verified first. Only fixed, regular DLL members
        # are written; the remaining multi-GB Editor is neither extracted nor run.
        with tarfile.open(source_archive, mode='r|xz') as source:
            for member in source:
                if not member.name.startswith(prefix):
                    continue
                name = member.name[len(prefix):]
                if name not in pending:
                    continue
                if not member.isfile() or member.size > MAX_FILE_BYTES:
                    raise ValueError('Invalid SDK reference member')
                target = inside(sdk, name)
                reject_links(target)
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.extractfile(member) as data, target.open('wb') as stream:
                    shutil.copyfileobj(data, stream)
                pending.remove(name)
                if not pending:
                    break
        if pending:
            raise ValueError('The pinned Editor archive is missing reference DLLs')
    if not valid(sdk):
        raise ValueError('Prepared SDK DLL integrity verification failed')
    return [inside(sdk, name) for name in profile]


def compiler(dotnet: str) -> tuple[str, Path, str]:
    expected = json.loads((ROOT / 'global.json').read_text(encoding='utf-8'))['sdk']['version']
    result = subprocess.run([dotnet, '--version'], cwd=ROOT, capture_output=True, text=True, check=True)
    if result.stdout.strip() != expected:
        raise ValueError('CodeQL reference compilation requires the exact global.json SDK')
    sdks = subprocess.check_output([dotnet, '--list-sdks'], cwd=ROOT, text=True).splitlines()
    candidates = [Path(line.split('[', 1)[1].rsplit(']', 1)[0]) / expected / 'Roslyn/bincore/csc.dll'
                  for line in sdks if line.startswith(expected + ' [')]
    if len(candidates) != 1 or not candidates[0].is_file():
        raise ValueError('Cannot locate the pinned SDK C# compiler')
    return dotnet, candidates[0], expected


def sources(directory: Path, assembly: str, *, dependencies: bool = False) -> list[Path]:
    definitions = list(directory.rglob('*.asmdef'))
    own = [p for p in definitions if p.parent == directory]
    if len(own) != 1 or json.loads(own[0].read_text(encoding='utf-8-sig'))['name'] != assembly:
        raise ValueError('Unexpected Unity assembly definition')
    children = [p.parent for p in definitions if p.parent != directory]
    if children and not dependencies:
        raise ValueError('A new Sensa assembly requires an explicit compilation plan')
    result = sorted(p for p in directory.rglob('*.cs') if not any(p.is_relative_to(child) for child in children))
    if not result or any(p.is_symlink() for p in result):
        raise ValueError('Unity sources must be nonempty regular files')
    return result


def compile_assembly(tool: tuple[str, Path, str], output: Path, name: str, files: list[Path],
                     references: list[Path], base_defines: list[str], extra_defines: list[str],
                     *, unsafe: bool = False) -> Path:
    destination = output / (name + '.dll')
    for path in (destination, output / (name + '.rsp'), output / (name + '.log')):
        reject_links(path)
    args = ['-nologo', '-noconfig', '-nostdlib+', '-target:library', '-langversion:9.0',
            '-nullable:disable', '-debug:portable', '-deterministic+', '-optimize-',
            '-out:' + str(destination), '-define:' + ';'.join(base_defines + extra_defines)]
    if unsafe:
        args.append('-unsafe+')
    args.extend('-reference:' + str(path) for path in references)
    args.extend(str(path) for path in files)
    response = output / (name + '.rsp')
    response.write_text('\n'.join('"' + arg.replace('"', '\\"') + '"' for arg in args) + '\n', encoding='utf-8')
    destination.unlink(missing_ok=True)
    result = subprocess.run([tool[0], str(tool[1]), '@' + str(response)], cwd=ROOT,
                            capture_output=True, text=True, timeout=180)
    (output / (name + '.log')).write_text(result.stdout + result.stderr, encoding='utf-8')
    if result.returncode != 0 or not destination.is_file():
        raise RuntimeError('C# reference compilation failed for ' + name + ':\n' + result.stdout + result.stderr)
    print(f'Compiled {name}: {len(files)} source files', flush=True)
    return destination


def refs_unique(paths: list[Path]) -> list[Path]:
    result = {}
    for path in paths:
        result.setdefault(path.name.casefold(), path)
    return list(result.values())


def initialize_output(output: Path) -> None:
    reject_links(output)
    for name in (MARKER, 'sdk', 'cache', 'packages', 'dependencies', 'sensa', 'prepared.json', 'coverage.json'):
        reject_links(output / name)
    if output == ROOT or ROOT.is_relative_to(output) or output.is_symlink():
        raise ValueError('Prepared output must be a dedicated generated directory')
    if output.exists() and any(output.iterdir()) and not (output / MARKER).is_file():
        raise ValueError('Refusing to overwrite an unowned prepared directory')
    output.mkdir(parents=True, exist_ok=True)
    (output / MARKER).write_text('Sensa CodeQL Unity reference compiler\n', encoding='utf-8')
    (output / 'cache').mkdir(exist_ok=True)


def prepare(args: argparse.Namespace) -> None:
    reject_links(args.output.absolute())
    output = args.output.resolve()
    initialize_output(output)
    lock = json.loads(LOCK.read_text(encoding='utf-8'))
    prepare_sdk(output, lock['editor'], args.editor_root, args.archive_cache)
    packages = {}
    package_root = output / 'packages'
    package_root.mkdir(exist_ok=True)
    for spec in lock['packages']:
        package_archive = archive(spec, output / 'cache', args.archive_cache)
        with tempfile.TemporaryDirectory(prefix='package-', dir=output) as temporary:
            extracted = Path(temporary)
            extract_package(package_archive, extracted, spec['format'])
            source = inside(extracted, spec['archive_prefix']) if spec['archive_prefix'] else extracted
            metadata = json.loads((source / 'package.json').read_text(encoding='utf-8-sig'))
            if (metadata.get('name'), metadata.get('version')) != (spec['name'], spec['version']):
                raise ValueError('Extracted package identity does not match the source lock')
            key = spec.get('id', spec['name'])
            safe_relative(key)
            target = package_root / key
            if target.exists():
                if target.is_symlink():
                    raise ValueError('Prepared package cannot be a link')
                shutil.rmtree(target)
            shutil.copytree(source, target)
            packages[key] = target
    tool = compiler(args.dotnet)
    contexts = {}
    for context_name, context in lock['contexts'].items():
        references = [inside(output / 'sdk', name) for name in lock['editor']['reference_profiles'][context['sdk_profile']]]
        references.extend(inside(packages[entry['package']], entry['path']) for entry in context['package_references'])
        references = refs_unique(references)
        deps = output / 'dependencies' / context_name
        reject_links(deps)
        deps.mkdir(parents=True, exist_ok=True)
        for plan in context['dependencies']:
            directory = inside(packages[plan['package']], plan['directory'])
            files = sources(directory, plan['assembly'], dependencies=True)
            asmdef = json.loads(next(directory.glob('*.asmdef')).read_text(encoding='utf-8-sig'))
            references.append(compile_assembly(tool, deps, plan['assembly'], files, references,
                                               context['base_defines'], plan.get('defines', []),
                                               unsafe=asmdef.get('allowUnsafeCode', False)))
        contexts[context_name] = {path.relative_to(output).as_posix(): digest(path) for path in references}
    state = {'schema': 2, 'sourceLockSha256': digest(LOCK), 'sdkVersion': tool[2],
             'purpose': 'Real reference compilation only; no Unity Editor/test execution',
             'references': contexts}
    (output / 'prepared.json').write_text(json.dumps(state, indent=2) + '\n', encoding='utf-8')
    print(f'Prepared verified Unity references with .NET SDK {tool[2]}', flush=True)


def owned_sources(plan: dict) -> list[Path]:
    files = []
    for directory in plan.get('directories', []):
        root = inside(ROOT, directory)
        if plan.get('asmdef'):
            files.extend(sources(root, plan['assembly']))
        else:
            if list(root.rglob('*.asmdef')):
                raise ValueError('A new lab assembly requires an explicit compilation plan')
            files.extend(sorted(root.rglob('*.cs')))
    files.extend(inside(ROOT, name) for name in plan.get('files', []))
    if not files or any(path.is_symlink() or not path.is_file() for path in files):
        raise ValueError('Owned C# sources must be regular files')
    return sorted(set(files))


def build(args: argparse.Namespace) -> None:
    reject_links(args.prepared.absolute())
    output = args.prepared.resolve()
    reject_links(output / 'prepared.json')
    reject_links(output / 'sensa')
    reject_links(output / 'coverage.json')
    state = json.loads((output / 'prepared.json').read_text(encoding='utf-8'))
    lock = json.loads(LOCK.read_text(encoding='utf-8'))
    if state['schema'] != 2 or state['sourceLockSha256'] != digest(LOCK):
        raise ValueError('Prepared references do not match the current source lock')
    tool = None
    coverage = {}
    compilation_count = 0
    for context_name, references_state in state['references'].items():
        references = []
        for name, expected in references_state.items():
            path = inside(output, name)
            reject_links(path)
            if not path.is_file() or digest(path) != expected:
                raise ValueError('Prepared reference integrity verification failed')
            references.append(path)
        if tool is None:
            tool = compiler(args.dotnet)
            if tool[2] != state['sdkVersion']:
                raise ValueError('Prepare and build must use the same pinned SDK')
        destination = output / 'sensa' / context_name
        reject_links(destination)
        destination.mkdir(parents=True, exist_ok=True)
        for plan in lock['contexts'][context_name]['owned_assemblies']:
            files = owned_sources(plan)
            references.append(compile_assembly(tool, destination, plan['assembly'], files,
                                               references, lock['contexts'][context_name]['base_defines'],
                                               plan.get('defines', [])))
            compilation_count += len(files)
            for path in files:
                name = path.relative_to(ROOT).as_posix()
                entry = coverage.setdefault(name, {'path': name, 'sha256': digest(path), 'assemblies': []})
                entry['assemblies'].append(context_name + '/' + plan['assembly'])
    tracked = subprocess.check_output(['git', 'ls-files', '*.cs'], cwd=ROOT, text=True).splitlines()
    expected = {name for name in tracked if not name.startswith(('src/', 'tests/Sensa.Tests/'))}
    if set(coverage) != expected:
        missing = sorted(expected - coverage.keys())
        extra = sorted(coverage.keys() - expected)
        raise ValueError('Non-desktop C# coverage is incomplete: ' + json.dumps({'missing': missing, 'extra': extra}))
    report = {'schema': 1, 'sdkVersion': tool[2], 'sourceLockSha256': state['sourceLockSha256'],
              'buildMode': 'manual', 'sourceCount': len(coverage), 'sourceCompilationCount': compilation_count,
              'allUnitySourcesCompiled': True, 'allNonDesktopCSharpCompiled': True,
              'editorInvoked': False, 'testsExecuted': False,
              'sources': [coverage[name] for name in sorted(coverage)]}
    (output / 'coverage.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'Compiled every non-desktop Sensa C# file: {len(coverage)}', flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest='command', required=True)
    setup = subparsers.add_parser('prepare')
    setup.add_argument('--output', type=Path, required=True)
    setup.add_argument('--editor-root', type=Path, help='Optional local Editor; every locked DLL hash is still verified')
    setup.add_argument('--archive-cache', type=Path, action='append', default=[], help='Optional verified local archive reuse')
    setup.add_argument('--dotnet', default=shutil.which('dotnet') or 'dotnet')
    setup.set_defaults(function=prepare)
    compile_parser = subparsers.add_parser('build')
    compile_parser.add_argument('--prepared', type=Path, required=True)
    compile_parser.add_argument('--dotnet', default=shutil.which('dotnet') or 'dotnet')
    compile_parser.set_defaults(function=build)
    args = parser.parse_args()
    try:
        args.function(args)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError, KeyError) as exc:
        parser.exit(1, f'{exc}\n')


if __name__ == '__main__':
    main()
