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

    def test_pages_publish_automatically_only_after_built_site_browser_checks(self):
        source = workflow('pages.yml')
        header = source.split('\njobs:\n', 1)[0]
        self.assertIn('push:', header)
        self.assertIn('branches: [main]', header)
        self.assertIn('workflow_call:', header)
        self.assertNotIn('workflow_dispatch:', header)
        scopes = jobs(source)
        build = scopes['build']
        self.assertIn('ref: main', build)
        self.assertIn('node --test tests/web/site.test.mjs', build)
        self.assertIn('E2E_SUITE: site', build)
        self.assertRegex(build, r"E2E_UPDATE_SNAPSHOTS: ['\"]?false['\"]?(?:\n|$)")
        self.assertIn('SENSA_SOURCE_COMMIT=$(git rev-parse HEAD)', build)
        self.assertIn('>> "$GITHUB_ENV"', build)
        self.assertIn('run: npm run e2e:ci', build)
        self.assertNotIn('continue-on-error', build)
        self.assertLess(build.index('npm run build:pages'), build.index('run: npm run e2e:ci'))
        self.assertLess(build.index('run: npm run e2e:ci'), build.index('uses: actions/upload-pages-artifact@'))
        self.assertEqual(needs(scopes['deploy']), {'build'})
        self.assertNotIn('always()', scopes['deploy'])


if __name__ == '__main__':
    unittest.main()
