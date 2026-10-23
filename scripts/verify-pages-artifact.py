"""Verify and stage the exact Pages archive passed from Build to Verify."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tarfile
import tempfile

MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
MAX_EXPANDED_BYTES = 256 * 1024 * 1024
MAX_MEMBERS = 10000
MAX_MANIFEST_BYTES = 1024 * 1024


def archive_digest(stream):
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    if not 0 < size <= MAX_ARCHIVE_BYTES:
        raise ValueError('Pages archive size is outside the accepted limit')
    stream.seek(0)
    digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    stream.seek(0)
    return digest


def open_archive(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        raise ValueError('Pages archive must be a regular file')
    return path.open('rb')


def fingerprint(path):
    with open_archive(path) as stream:
        return archive_digest(stream)


def validate_members(archive):
    """Check the complete member list before writing any archive contents."""
    members, paths, total_bytes = [], {}, 0
    for member in archive:
        if len(members) >= MAX_MEMBERS:
            raise ValueError('Pages archive contains too many entries')
        name = member.name
        if ('\\' in name or ':' in name or any(ord(char) < 32 or ord(char) == 127 for char in name)
                or name.startswith('/') or '..' in name.split('/')):
            raise ValueError('Pages archive contains an unsafe path')
        path = PurePosixPath(name)
        if not name or (path == PurePosixPath('.') and not member.isdir()):
            raise ValueError('Pages archive contains an invalid root entry')
        if not (member.isfile() or member.isdir()) or member.issparse():
            raise ValueError('Pages archive entries must be regular files or directories')
        if path in paths:
            raise ValueError('Pages archive contains duplicate paths')
        paths[path] = member.isdir()
        if member.size < 0 or (member.isdir() and member.size != 0):
            raise ValueError('Pages archive contains an invalid entry size')
        total_bytes += member.size
        if total_bytes > MAX_EXPANDED_BYTES:
            raise ValueError('Pages archive expands beyond the accepted limit')
        members.append(member)
    for path in paths:
        if any(parent in paths and not paths[parent] for parent in path.parents):
            raise ValueError('Pages archive places entries below a file')
    for required in ('index.html', 'site-manifest.json'):
        if paths.get(PurePosixPath(required)) is not False:
            raise ValueError(f'Pages archive is missing the regular file {required}')
    return members, total_bytes


def extract_archive(archive_path, output, *, commit, sha256, artifact_id, artifact_name, receipt):
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Pages source must be a full commit SHA')
    if not re.fullmatch(r'[0-9a-f]{64}', sha256):
        raise ValueError('Pages archive must have a SHA-256 digest')
    if not re.fullmatch(r'[1-9][0-9]*', artifact_id):
        raise ValueError('Pages artifact ID must be a positive integer')
    if not re.fullmatch(r'github-pages-[1-9][0-9]*-[1-9][0-9]*', artifact_name):
        raise ValueError('Pages artifact name must include its run and build attempt')
    output, receipt = Path(output), Path(receipt)
    if output.exists() or output.is_symlink():
        raise ValueError('Pages staging directory must not already exist')
    if receipt.exists() or receipt.is_symlink():
        raise ValueError('Pages handoff receipt must not already exist')
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.pages-', dir=output.parent))
    try:
        with open_archive(archive_path) as stream:
            if archive_digest(stream) != sha256:
                raise ValueError('Pages archive SHA-256 does not match the Build output')
            with tarfile.open(fileobj=stream, mode='r:') as archive:
                members, total_bytes = validate_members(archive)
                # Python's data filter adds filesystem escape and special-file checks.
                # The preflight above also rejects links, duplicate paths and oversized input.
                archive.extractall(staging, members=members, filter='data')
        manifest_path = staging / 'site-manifest.json'
        if manifest_path.stat().st_size > MAX_MANIFEST_BYTES:
            raise ValueError('Pages manifest is too large')
        manifest_bytes = manifest_path.read_bytes()
        manifest = json.loads(manifest_bytes)
        if not isinstance(manifest, dict) or manifest.get('commit') != commit:
            raise ValueError('Pages manifest commit does not match the fixed source')
        evidence = {
            'schema': 1, 'commit': commit, 'artifactId': artifact_id, 'artifactName': artifact_name,
            'archiveSha256': sha256, 'siteManifestSha256': hashlib.sha256(manifest_bytes).hexdigest(),
            'fileCount': sum(member.isfile() for member in members), 'totalBytes': total_bytes,
        }
        receipt.parent.mkdir(parents=True, exist_ok=True)
        # The browser only sees a complete, verified site, after all checks succeed.
        staging.rename(output)
        try:
            with receipt.open('x', encoding='utf-8') as writer:
                json.dump(evidence, writer, indent=2)
                writer.write('\n')
        except BaseException:
            shutil.rmtree(output)
            raise
        return evidence
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    digest = commands.add_parser('fingerprint', help='Print the uploaded tar archive SHA-256')
    digest.add_argument('--archive', type=Path, required=True)
    extract = commands.add_parser('extract', help='Verify and stage a downloaded Pages archive')
    extract.add_argument('--archive', type=Path, required=True)
    extract.add_argument('--output', type=Path, required=True)
    extract.add_argument('--receipt', type=Path, required=True)
    for name in ('commit', 'sha256', 'artifact-id', 'artifact-name'):
        extract.add_argument('--' + name, required=True)
    args = parser.parse_args()
    try:
        if args.command == 'fingerprint':
            print(fingerprint(args.archive))
        else:
            extract_archive(args.archive, args.output, commit=args.commit, sha256=args.sha256,
                            artifact_id=args.artifact_id, artifact_name=args.artifact_name, receipt=args.receipt)
            print('Pages archive verified against the fixed source and ready for site checks.')
    except (OSError, ValueError, tarfile.TarError) as error:
        parser.exit(1, f'Pages archive verification failed: {error}\n')


if __name__ == '__main__':
    main()
