"""Current-source workflow gates without GitHub history adapters.
当前源码的工作流门槛；不读取远端历史证据或运行产品进程。
"""
from pathlib import Path
import json
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
WORKFLOWS = ROOT / '.github/workflows'


def workflow(name):
    return (WORKFLOWS / name).read_text(encoding='utf-8')


def jobs(source):
    """Read only known top-level job declarations, not general YAML."""
    body = source.split('\njobs:\n', 1)[1]
    pieces = re.split(r'(?m)^  ([A-Za-z0-9_-]+):\n', body)
    return dict(zip(pieces[1::2], pieces[2::2]))


def needs(body):
    match = re.search(r'^    needs: (.+)$', body, re.M)
    if match is None:
        return set()
    return set(part.strip() for part in match[1].strip('[]').split(','))


class WorkflowGateContracts(unittest.TestCase):
    def test_codeql_requires_measured_build_quality_before_publication(self):
        source = workflow('codeql.yml')
        scopes = jobs(source)
        analyze = scopes['analyze']
        self.assertEqual(set(re.findall(r'language: ([a-z-]+), build-mode:', analyze)),
                         {'actions', 'csharp', 'javascript-typescript', 'python'})
        self.assertIn('{language: csharp, build-mode: manual}', analyze)
        self.assertNotRegex(analyze, r'(?m)^\s+queries:')
        self.assertIn('"threat-models":["remote"]', analyze)
        self.assertNotIn('disable-default-queries', source)
        self.assertNotIn('query-filters', source)
        self.assertNotIn('paths-ignore:', source)
        self.assertLess(analyze.index('codeql-unity.py prepare'), analyze.index('id: init'))
        self.assertLess(analyze.index('id: init'), analyze.index('dotnet build src/Sensa.sln'))
        self.assertIn('--no-incremental', analyze)
        self.assertIn('-p:UseSharedCompilation=false', analyze)
        self.assertIn('codeql-unity.py build', analyze)
        self.assertIn('          upload: never', analyze)
        self.assertLess(analyze.index('verify-codeql-csharp.py'), analyze.index('Upload verified CodeQL results'))
        self.assertIn("success() && vars.SENSA_CODEQL_ADVANCED == 'true'", analyze)
        self.assertIn('wait-for-processing: true', analyze)
        self.assertIn('category: /language:${{ matrix.language }}', analyze)

    def test_generated_and_native_build_jobs_have_no_server_granted_cache_access(self):
        for filename, names in [('update-e2e.yml', ('agent', 'candidates')), ('build.yml', ('desktop',)), ('e2e.yml', ('compatibility',))]:
            scopes = jobs(workflow(filename))
            for name in names:
                with self.subTest(workflow=filename, job=name):
                    header = scopes[name].split('    steps:\n', 1)[0]
                    self.assertRegex(header, r'(?m)^    cache-mode: none$')
                    self.assertEqual(len(re.findall(r'(?m)^    cache-mode:', header)), 1)
                    self.assertNotRegex(scopes[name], r'(?m)^\s+ACTIONS_CACHE_MODE:')
                    # The pinned setup-node toolkit skips restore/save under the
                    # server-provided mode and exposes that decision in Actions logs.
                    self.assertIn('          cache: npm', scopes[name])
                    self.assertNotIn('secrets.SENSA_PAT', scopes[name])
        configured = set()
        for path in WORKFLOWS.glob('*.yml'):
            for name, body in jobs(path.read_text(encoding='utf-8')).items():
                if re.search(r'(?m)^    cache-mode:', body):
                    configured.add((path.name, name))
        self.assertEqual(configured, {('update-e2e.yml', 'agent'), ('update-e2e.yml', 'candidates'),
                                      ('build.yml', 'desktop'), ('e2e.yml', 'compatibility')})

    def test_checkout_credentials_are_retained_only_for_authenticated_proposal_git_operations(self):
        checked = set()
        for path in WORKFLOWS.glob('*.yml'):
            for name, body in jobs(path.read_text(encoding='utf-8')).items():
                for step in re.split(r'(?m)^      - ', body)[1:]:
                    if not re.search(r'(?m)^        uses: actions/checkout@', step):
                        continue
                    checked.add((path.name, name))
                    with self.subTest(workflow=path.name, job=name):
                        if (path.name, name) == ('update-e2e.yml', 'proposal'):
                            self.assertIn('token: ${{ secrets.SENSA_PAT }}', step)
                            self.assertNotIn('persist-credentials: false', step)
                        else:
                            self.assertRegex(step, r'(?m)^          persist-credentials: false$')
        self.assertIn(('checks.yml', 'units'), checked)
        self.assertIn(('update-e2e.yml', 'proposal'), checked)
        self.assertGreater(len(checked), 2)

    def test_every_artifact_download_explicitly_fails_on_digest_mismatch(self):
        checked = set()
        for path in WORKFLOWS.glob('*.yml'):
            for step in re.split(r'(?m)^      - ', path.read_text(encoding='utf-8'))[1:]:
                if not re.search(r'(?m)^        uses: actions/download-artifact@', step):
                    continue
                checked.add(path.name)
                with self.subTest(workflow=path.name):
                    self.assertRegex(step, r'(?m)^          digest-mismatch: error$')
                    self.assertNotIn('continue-on-error:', step)
        self.assertEqual(checked, {'ci.yml', 'release.yml', 'pages.yml', 'update-e2e.yml'})

    def test_dependabot_updates_cover_application_test_capture_and_protocol_bridge_dependencies(self):
        source = (ROOT / '.github/dependabot.yml').read_text(encoding='utf-8')
        entries = {}
        for ecosystem, body in re.findall(r'(?ms)^  - package-ecosystem: (\S+)\n(.*?)(?=^  - |\Z)', source):
            directory = re.search(r'(?m)^    directory: (\S+)$', body).group(1)
            self.assertNotIn((ecosystem, directory), entries)
            entries[ecosystem, directory] = body
        required = {('npm', '/'), ('github-actions', '/')}
        for project in (*ROOT.glob('src/*.csproj'), *ROOT.glob('tests/*/*.csproj')):
            if '<PackageReference ' in project.read_text(encoding='utf-8'):
                required.add(('nuget', '/' + project.parent.relative_to(ROOT).as_posix()))
        for requirements in (*ROOT.glob('scripts/requirements*.txt'),
                             *ROOT.glob('tools/protocol-bridge/requirements*.txt')):
            required.add(('pip', '/' + requirements.parent.relative_to(ROOT).as_posix()))
        self.assertTrue(required <= entries.keys(), f'Missing dependency update directories: {required - entries.keys()}')
        for key in required:
            with self.subTest(ecosystem=key[0], directory=key[1]):
                self.assertIn('      interval: weekly', entries[key])
                self.assertNotRegex(entries[key], r'(?m)^    ignore:')
        npm = entries['npm', '/']
        self.assertIn('      react-runtime:', npm)
        self.assertIn('      react-security:', npm)
        self.assertIn('        applies-to: security-updates', npm)

    def test_optional_bluetooth_dependency_pins_keep_windows_and_bless_backends_separate(self):
        directory = ROOT / 'tools/protocol-bridge'
        requirements = {}
        for path in directory.glob('requirements-*.txt'):
            entries = [line.strip() for line in path.read_text(encoding='utf-8').splitlines()
                       if line.strip() and not line.lstrip().startswith('#')]
            self.assertTrue(entries, path.name)
            for entry in entries:
                self.assertRegex(entry, r'^[A-Za-z0-9_.-]+==[0-9][A-Za-z0-9_.!+-]*(?:; .+)?$')
            requirements[path.name] = entries
        bless = [entry for entry in requirements['requirements-ble-input.txt'] if entry.startswith('bless==')]
        self.assertEqual(len(bless), 1)
        self.assertIn('; sys_platform != "win32"', bless[0])
        windows = requirements['requirements-ble-input-windows.txt']
        self.assertTrue(all(entry.startswith('winrt-') and '; sys_platform == "win32"' in entry
                            for entry in windows))
        versions = {entry.split('==', 1)[1].split(';', 1)[0] for entry in windows}
        for version in versions:
            epoch, _, release = version.rpartition('!')
            numeric = re.match(r'([0-9]+)\.([0-9]+)', release or version)
            self.assertIsNotNone(numeric)
            # Epoch-versioned projections and the independently versioned runtime
            # need not share a literal release string. Preserve Bleak's >=3.1 floor.
            self.assertTrue((epoch and int(epoch) > 0) or tuple(map(int, numeric.groups())) >= (3, 1))
        self.assertFalse(any(entry.startswith('bless==') for entry in windows))

    def test_every_sdk_install_uses_the_same_exact_non_rolling_repository_version(self):
        sdk = json.loads((ROOT / 'global.json').read_text(encoding='utf-8'))['sdk']
        self.assertRegex(sdk['version'], r'^\d+\.\d+\.[1-9]\d{2,}$')
        # A patch roll-forward also changes the SDK's implicit ILLink dependency,
        # so setup-dotnet's installation channel must match locked restore.
        self.assertEqual(sdk.get('rollForward'), 'disable')
        configured = set()
        for path in WORKFLOWS.glob('*.yml'):
            for step in re.split(r'(?m)^      - ', path.read_text(encoding='utf-8'))[1:]:
                if not re.search(r'(?m)^        uses: actions/setup-dotnet@', step):
                    continue
                with self.subTest(workflow=path.name, step=step.splitlines()[0]):
                    self.assertIn('          global-json-file: global.json', step)
                    self.assertNotRegex(step, r'(?m)^          dotnet-(?:version|channel):')
                    configured.add(path.name)
        self.assertEqual(configured, {'checks.yml', 'build.yml', 'e2e.yml', 'update-e2e.yml', 'codeql.yml'})

    def test_repository_write_secret_is_confined_to_trusted_publication_jobs(self):
        allowed = {'ci.yml': 'preview', 'release.yml': 'publish', 'update-e2e.yml': 'proposal'}
        for path in WORKFLOWS.glob('*.yml'):
            source = path.read_text(encoding='utf-8')
            self.assertNotIn('secrets: inherit', source)
            for name, body in jobs(source).items():
                with self.subTest(workflow=path.name, job=name):
                    if name != allowed.get(path.name):
                        self.assertNotIn('secrets.SENSA_PAT', body)
                        continue
                    self.assertIn('GH_TOKEN: ${{ secrets.SENSA_PAT }}', body)
                    self.assertIn('test -n "$GH_TOKEN"', body)
                    self.assertIn('      contents: read', body)
                    if name == 'proposal':
                        self.assertIn('token: ${{ secrets.SENSA_PAT }}', body)
                    else:
                        self.assertIn('persist-credentials: false', body)
        maintenance = jobs(workflow('update-e2e.yml'))
        self.assertIn("!cancelled() && needs.source.result == 'success' && needs.candidates.result == 'success'", maintenance['proposal'])
        self.assertIn("needs.candidates.outputs.changed == 'true'", maintenance['proposal'])
        self.assertIn("!cancelled() && inputs.mode == 'agent'", maintenance['agent'])
        self.assertIn("inputs.mode == 'agent' && needs.agent.result == 'success'", maintenance['candidates'])
        self.assertIn("inputs.mode == 'screenshots' && needs.agent.result == 'skipped'", maintenance['candidates'])
        self.assertNotIn('gh workflow run', maintenance['proposal'])
        self.assertIn('persist-credentials: false', maintenance['agent'])
        self.assertIn('persist-credentials: false', maintenance['candidates'])

    def test_checks_pin_the_tested_source_before_running_full_normal_comparison(self):
        source = workflow('checks.yml')
        scopes = jobs(source)
        self.assertIn('commit: ${{ steps.source.outputs.commit }}', scopes['units'])
        self.assertIn('ref: ${{ inputs.source_ref }}', scopes['units'])
        self.assertIn('git rev-parse HEAD', scopes['units'])
        for command in ('npm test', 'dotnet test tests/Sensa.Tests/Sensa.Tests.csproj',
                        'python -X utf8 -m unittest discover -s tests/scripts',
                        'python scripts/release.py check-unity'):
            self.assertIn(command, scopes['units'])
        self.assertNotIn('continue-on-error', scopes['units'])
        self.assertNotIn('|| true', scopes['units'])
        self.assertEqual(needs(scopes['e2e']), {'units'})
        self.assertIn('uses: ./.github/workflows/e2e.yml', scopes['e2e'])
        self.assertIn('source_commit: ${{ needs.units.outputs.commit }}', scopes['e2e'])
        self.assertIn('update_snapshots: false', scopes['e2e'])
        self.assertIn('value: ${{ jobs.units.outputs.commit }}', source)
        self.assertIn('value: ${{ jobs.e2e.outputs.comparison_sha }}', source)
        self.assertNotIn('continue-on-error', scopes['e2e'])

    def test_both_publication_channels_require_tested_builds_and_matching_comparison_proof(self):
        for filename, publisher, channel in (('ci.yml', 'preview', 'preview'),
                                              ('release.yml', 'publish', 'stable')):
            with self.subTest(workflow=filename):
                source = workflow(filename)
                scopes = jobs(source)
                self.assertIn('uses: ./.github/workflows/checks.yml', scopes['checks'])
                self.assertEqual(needs(scopes['build']), {'checks'})
                self.assertIn('source_ref: ${{ needs.checks.outputs.commit }}', scopes['build'])
                self.assertIn('uses: ./.github/workflows/build.yml', scopes['build'])
                self.assertIn('channel: ' + channel, scopes['build'])
                publish = scopes[publisher]
                self.assertEqual(needs(publish), {'checks', 'build'})
                self.assertIn('SENSA_E2E_COMPARISON_SHA: ${{ needs.checks.outputs.comparison_sha }}', publish)
                self.assertIn('SOURCE_COMMIT: ${{ needs.build.outputs.commit }}', publish)
                self.assertIn('--commit "$SOURCE_COMMIT"', publish)
                self.assertIn('--channel ' + channel, publish)
                self.assertIn('ref: ${{ needs.build.outputs.commit }}', publish)
                self.assertIn('group: sensa-release-publication', publish)
                self.assertNotIn('continue-on-error', publish)
                self.assertNotIn('always()', publish.split('    steps:\n', 1)[0])
                self.assertNotIn('ci_evidence', source)
        ci = workflow('ci.yml')
        self.assertIn("github.event_name == 'push' && github.ref == 'refs/heads/main'", jobs(ci)['preview'])
        stable = workflow('release.yml')
        self.assertIn('workflow_dispatch:', stable.split('\njobs:\n', 1)[0])
        self.assertNotIn('tags:', stable)
        self.assertIn('source_ref: main', jobs(stable)['checks'])
        self.assertIn('require_main: true', jobs(stable)['checks'])
        self.assertIn('version: ${{ inputs.version }}', jobs(stable)['build'])
        self.assertEqual(needs(jobs(stable)['pages']), {'publish'})
        self.assertIn('uses: ./.github/workflows/pages.yml', jobs(stable)['pages'])

    def test_build_artifacts_share_one_pinned_commit_and_include_all_supported_platforms(self):
        source = workflow('build.yml')
        scopes = jobs(source)
        self.assertIn('ref: ${{ inputs.source_ref }}', scopes['plan'])
        self.assertIn('fetch-depth: 0', scopes['plan'])
        self.assertIn('scripts/prepare-release.py', scopes['plan'])
        self.assertCountEqual(re.findall(r'rid: ([a-z0-9-]+)', scopes['desktop']),
                              ('win-x64', 'win-arm64', 'linux-x64', 'linux-arm64', 'osx-x64', 'osx-arm64'))
        for target in ('desktop', 'unity'):
            with self.subTest(target=target):
                self.assertEqual(needs(scopes[target]), {'plan'})
                self.assertIn('ref: ${{ needs.plan.outputs.commit }}', scopes[target])
                self.assertIn('SENSA_SOURCE_COMMIT: ${{ needs.plan.outputs.commit }}', scopes[target])
                self.assertIn('BUILD_VERSION: ${{ needs.plan.outputs.version }}', scopes[target])
                self.assertIn('scripts/prepare-release.py --apply-version "$BUILD_VERSION"', scopes[target])
                self.assertIn('overwrite: true', scopes[target])
                self.assertNotIn('      GITHUB_SHA:', scopes[target])
        self.assertIn('--smoke', scopes['desktop'])
        self.assertIn('scripts/smoke-shader-bridge.py', scopes['desktop'])

    def test_comparison_receipt_is_written_only_after_report_validation_and_never_for_candidates(self):
        browser = jobs(workflow('e2e.yml'))['browser']
        self.assertIn('SENSA_SOURCE_COMMIT: ${{ inputs.source_commit || github.sha }}', browser)
        self.assertIn('ref: ${{ inputs.source_commit || github.sha }}', browser)
        self.assertIn('E2E_SUITE: all', browser)
        self.assertIn('run: npm run e2e:ci', browser)
        self.assertNotIn('continue-on-error', browser)
        steps = re.split(r'(?m)^      - ', browser)
        comparison = next(step for step in steps if '\n        id: comparison\n' in step)
        self.assertIn('if: ${{ !inputs.update_snapshots }}', comparison)
        self.assertNotIn('always()', comparison)
        self.assertLess(comparison.index('--verify-comparison artifacts/e2e/summary.json'),
                        comparison.index('echo "sha=$SENSA_SOURCE_COMMIT"'))
        finalizer = next(step for step in steps if '--finalize-report artifacts/e2e/summary.json' in step)
        self.assertIn('if: always()', finalizer)
        self.assertIn('E2E_COMMAND_OUTCOME: ${{ steps.browser_tests.outcome }}', finalizer)
        artifact = next(step for step in steps if 'name: e2e-report\n' in step)
        self.assertIn('if: always()', artifact)
        self.assertIn('artifacts/e2e/summary.json', artifact)
        self.assertIn('artifacts/e2e/summary.md', artifact)

    def test_container_browser_jobs_share_bounded_dependency_setup_before_tests(self):
        playwright_version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['devDependencies']['@playwright/test']
        images = set()
        for filename, job_name in (('e2e.yml', 'browser'), ('e2e.yml', 'compatibility'), ('update-e2e.yml', 'candidates'), ('pages.yml', 'verify')):
            with self.subTest(workflow=filename):
                body = jobs(workflow(filename))[job_name]
                image = re.search(r'(?m)^    container: (\S+)$', body).group(1)
                self.assertRegex(image, r'^mcr\.microsoft\.com/playwright:v' + re.escape(playwright_version)
                                 + r'-noble@sha256:[a-f0-9]{64}$')
                images.add(image)
                steps = re.split(r'(?m)^      - ', body)
                installers = [step for step in steps if 'run: bash scripts/install-e2e-dependencies.sh' in step]
                self.assertEqual(len(installers), 1)
                installer = installers[0]
                self.assertIn('timeout-minutes: 5', installer)
                self.assertNotIn('continue-on-error', installer)
                self.assertNotIn('if:', installer)
                self.assertNotIn('apt-get', body)
                self.assertLess(body.index('run: bash scripts/install-e2e-dependencies.sh'),
                                body.index('run: npm run e2e:ci'))
        self.assertEqual(len(images), 1, 'Browser jobs must use the same reviewed Playwright image digest')

    def test_pages_publish_automatically_only_after_built_site_browser_checks(self):
        source = workflow('pages.yml')
        header = source.split('\njobs:\n', 1)[0]
        self.assertIn('push:', header)
        self.assertIn('branches: [main]', header)
        self.assertIn('workflow_call:', header)
        self.assertNotIn('workflow_dispatch:', header)
        scopes = jobs(source)
        build = scopes['build']
        verify = scopes['verify']
        deploy = scopes['deploy']
        self.assertIn('ref: main', build)
        self.assertIn('node --test tests/web/site.test.mjs', build)
        self.assertIn('sensa_commit=$(git rev-parse HEAD)', build)
        self.assertIn('>> "$GITHUB_ENV"', build)
        self.assertIn('run: GITHUB_SHA="$SENSA_SOURCE_COMMIT" npm run build:pages', build)
        self.assertIn('run: python3 scripts/vpm-index.py --allow-empty', build)
        self.assertNotIn('container:', build)
        self.assertNotIn('npm run e2e:ci', build)
        self.assertEqual(needs(verify), {'build'})
        self.assertIn('ref: ${{ needs.build.outputs.commit }}', verify)
        self.assertIn('SENSA_SOURCE_COMMIT: ${{ needs.build.outputs.commit }}', verify)
        self.assertIn('SENSA_SITE_DIRECTORY: artifacts/pages', verify)
        self.assertIn('E2E_SUITE: site', verify)
        self.assertRegex(verify, r"E2E_UPDATE_SNAPSHOTS: ['\"]?false['\"]?(?:\n|$)")
        self.assertIn('run: npm run e2e:ci', verify)
        self.assertNotIn('npm run build:pages', verify)
        self.assertNotIn('playwright install', source)
        self.assertNotIn('install-pages-dependencies', source)
        self.assertEqual(needs(deploy), {'build', 'verify'})
        for body in (build, verify, deploy):
            self.assertNotIn('continue-on-error', body)
            self.assertNotIn('always()', body.split('    steps:\n', 1)[0])
        self.assertNotIn('always()', deploy)

    def test_pages_verifies_and_deploys_one_immutable_archive_across_partial_reruns(self):
        scopes = jobs(workflow('pages.yml'))
        build, verify, deploy = (scopes[name] for name in ('build', 'verify', 'deploy'))
        for key, value in (('commit', 'source.outputs.commit'), ('artifact_name', 'source.outputs.artifact_name'),
                           ('artifact_id', 'upload.outputs.artifact_id'), ('archive_sha256', 'archive.outputs.sha256')):
            self.assertIn(f'{key}: ${{{{ steps.{value} }}}}', build)
        self.assertIn('artifact_name=github-pages-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}', build)
        self.assertIn('name: ${{ steps.source.outputs.artifact_name }}', build)
        self.assertIn('retention-days: 14', build)
        self.assertIn('fingerprint --archive "$RUNNER_TEMP/artifact.tar"', build)
        self.assertLess(build.index('npm run build:pages'), build.index('uses: actions/upload-pages-artifact@'))
        self.assertLess(build.index('uses: actions/upload-pages-artifact@'), build.index('fingerprint --archive'))
        self.assertIn('artifact-ids: ${{ needs.build.outputs.artifact_id }}', verify)
        self.assertIn('digest-mismatch: error', verify)
        self.assertIn('merge-multiple: true', verify)
        self.assertIn('SENSA_PAGES_ARCHIVE_SHA256: ${{ needs.build.outputs.archive_sha256 }}', verify)
        self.assertIn('--commit "$SENSA_SOURCE_COMMIT" --sha256 "$SENSA_PAGES_ARCHIVE_SHA256"', verify)
        self.assertIn('--archive artifacts/site-archive/artifact.tar --output "$SENSA_SITE_DIRECTORY"', verify)
        self.assertIn('--artifact-id "$SENSA_PAGES_ARTIFACT_ID" --artifact-name "$SENSA_PAGES_ARTIFACT_NAME"', verify)
        self.assertLess(verify.index('uses: actions/download-artifact@'), verify.index('scripts/verify-pages-artifact.py extract'))
        self.assertLess(verify.index('scripts/verify-pages-artifact.py extract'), verify.index('run: npm run e2e:ci'))
        self.assertNotIn('uses: actions/upload-pages-artifact@', verify + deploy)
        self.assertIn('artifact_name: ${{ needs.build.outputs.artifact_name }}', deploy)
        self.assertNotIn('GITHUB_RUN_ATTEMPT', verify + deploy)
        steps = re.split(r'(?m)^      - ', verify)
        finalizer = next(step for step in steps if '--finalize-report artifacts/e2e/summary.json' in step)
        report = next(step for step in steps if 'name: pages-verification\n' in step)
        self.assertIn('if: always()', finalizer)
        self.assertIn('E2E_COMMAND_OUTCOME: ${{ steps.site_tests.outcome }}', finalizer)
        self.assertIn('if: always()', report)
        for artifact in ('summary.json', 'summary.md', 'pages-artifact.json', 'results.json', 'report/', 'results/'):
            self.assertIn('artifacts/e2e/' + artifact, report)
        self.assertIn('artifacts/pages/site-manifest.json', report)
        self.assertIn('retention-days: 14', report)


if __name__ == '__main__':
    unittest.main()
