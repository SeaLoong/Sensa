"""Current-source workflow gates without GitHub history adapters.
当前源码的工作流门槛；不读取远端历史证据或运行产品进程。
"""
from pathlib import Path
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
        for filename, job_name in (('e2e.yml', 'browser'), ('update-e2e.yml', 'candidates'), ('pages.yml', 'verify')):
            with self.subTest(workflow=filename):
                body = jobs(workflow(filename))[job_name]
                self.assertIn('container: mcr.microsoft.com/playwright:v1.64.1-noble', body)
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
