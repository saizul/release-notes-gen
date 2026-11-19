import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { VERSION } from '../src/index.js';
import { cli, TempRepo } from './helpers.js';

describe('cli basics', () => {
  it('prints help and version', async () => {
    const help = await cli(['--help']);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /^Usage: release-notes-gen/);
    assert.equal((await cli(['-v'])).stdout, `${VERSION}\n`);
  });

  it('rejects unknown options and bad values with exit code 2', async () => {
    for (const args of [
      ['--nope'],
      ['--from'],
      ['--host', 'bitbucket'],
      ['--json', '--version-only'],
      ['--write=yes'],
      ['--path'],
    ]) {
      const r = await cli(args);
      assert.equal(r.code, 2, args.join(' '));
      assert.match(r.stderr, /^release-notes-gen: /);
    }
  });

  it('reads commits from stdin', async () => {
    const r = await cli(
      ['--input', '-', '--current', '1.2.0', '--from', 'v1.2.0', '--repo-url', 'https://github.com/a/b'],
      {
        stdin: 'abc1234 feat: one\ndef5678 fix: two (#4)\n',
      },
    );
    assert.equal(r.code, 0, r.stderr);
    assert.equal(
      r.stdout,
      [
        '## [1.3.0](https://github.com/a/b/compare/v1.2.0...v1.3.0) (2026-11-19)',
        '',
        '### Features',
        '',
        '- one ([abc1234](https://github.com/a/b/commit/abc1234))',
        '',
        '### Bug Fixes',
        '',
        '- two ([#4](https://github.com/a/b/pull/4)) ([def5678](https://github.com/a/b/commit/def5678))',
        '',
      ].join('\n'),
    );
  });

  it('stdin with --from as the current version, --version-only and --json', async () => {
    const opts = { stdin: '["feat!: big"]' };
    assert.equal((await cli(['--input', '-', '--from', 'v1.2.0', '--version-only'], opts)).stdout, '2.0.0\n');
    const json = JSON.parse(
      (await cli(['--input', '-', '--current', '0.3.0', '--json', '--host', 'none'], opts)).stdout,
    );
    assert.equal(json.version, '0.4.0');
    assert.equal(json.releaseType, 'minor');
    assert.equal(json.previousVersion, '0.3.0');
    assert.equal(json.commits[0].breaking, true);
    const bad = await cli(['--input', '-', '--from', 'main'], opts);
    assert.equal(bad.code, 2);
    assert.match(bad.stderr, /pass --current/);
  });

  it('reports a missing input file', async () => {
    const r = await cli(['--input', 'definitely-missing.json']);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /Cannot read --input/);
  });
});

describe('cli on a temporary git repository', () => {
  let repo: TempRepo;

  before(() => {
    repo = new TempRepo();
    repo.git('remote', 'add', 'origin', 'https://github.com/acme/rocket.git');
    repo.commit('chore: initial commit');
    repo.tag('v1.2.0');
    repo.commit('feat(engine): add a second stage\n\nCloses #10');
    repo.commit('fix: wobble on launch (#11)');
    repo.commit('docs: explain the countdown');
    repo.commit('feat: telemetry');
    repo.commit('Revert "feat: telemetry"\n\nThis reverts commit HEAD.');
    repo.write(
      'CHANGELOG.md',
      '# Changelog\n\nHand-written intro.\n\n## 1.2.0 (2026-01-01)\n\n- the first release\n',
    );
  });

  after(() => repo.remove());

  it('previews the next release since the latest tag', async () => {
    const r = await cli(['--date', '2026-11-19'], { cwd: repo.dir });
    assert.equal(r.code, 0, r.stderr);
    assert.match(
      r.stdout,
      /^## \[1\.3\.0\]\(https:\/\/github\.com\/acme\/rocket\/compare\/v1\.2\.0\.\.\.v1\.3\.0\) \(2026-11-19\)/,
    );
    assert.match(
      r.stdout,
      /- \*\*engine:\*\* add a second stage \(\[[0-9a-f]{7}\]\(https:\/\/github\.com\/acme\/rocket\/commit\/[0-9a-f]{40}\)\), closes \[#10\]/,
    );
    assert.match(r.stdout, /- wobble on launch \(\[#11\]\(https:\/\/github\.com\/acme\/rocket\/pull\/11\)\)/);
    assert.doesNotMatch(r.stdout, /countdown/);
  });

  it('--from v1.2.0 --write prepends to CHANGELOG.md and is idempotent', async () => {
    const r = await cli(['--from', 'v1.2.0', '--write', '--no-date'], { cwd: repo.dir });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /Wrote 1\.3\.0 to CHANGELOG\.md/);
    const first = readFileSync(join(repo.dir, 'CHANGELOG.md'), 'utf8');
    assert.ok(first.startsWith('# Changelog\n\nHand-written intro.\n\n## [1.3.0]('), first);
    assert.ok(first.endsWith('## 1.2.0 (2026-01-01)\n\n- the first release\n'));
    await cli(['--from', 'v1.2.0', '--write', '--no-date'], { cwd: repo.dir });
    assert.equal(readFileSync(join(repo.dir, 'CHANGELOG.md'), 'utf8'), first);
  });

  it('writes GitHub Actions outputs', async () => {
    const out = join(repo.dir, 'gh-output.txt');
    writeFileSync(out, 'existing=1\n');
    const r = await cli(['--github-output', out, '--version-only'], { cwd: repo.dir });
    assert.equal(r.stdout, '1.3.0\n');
    const text = readFileSync(out, 'utf8');
    assert.match(
      text,
      /^existing=1\nreleased=true\nversion=1\.3\.0\ntag=v1\.3\.0\nprevious-version=1\.2\.0\nprevious-tag=v1\.2\.0\nrelease-type=minor\nnotes<<(ghadelimiter_[0-9a-f-]+)\n## \[1\.3\.0\][\s\S]*\n\1\n$/,
    );
  });

  it('pre-releases continue from the newest pre-release tag', async () => {
    assert.equal(
      (await cli(['--prerelease', 'beta', '--version-only'], { cwd: repo.dir })).stdout,
      '1.3.0-beta.0\n',
    );
    repo.tag('v1.3.0-beta.0');
    repo.commit('fix: after beta');
    assert.equal(
      (await cli(['--prerelease', 'beta', '--version-only'], { cwd: repo.dir })).stdout,
      '1.3.0-beta.1\n',
    );
    // A stable release graduates the beta and lists everything since v1.2.0.
    const stable = await cli(['--json'], { cwd: repo.dir });
    const json = JSON.parse(stable.stdout);
    assert.equal(json.version, '1.3.0');
    assert.equal(json.previousTag, 'v1.2.0');
    assert.ok(json.commits.some((c: { subject: string }) => c.subject === 'add a second stage'));
  });

  it('--to a version tag regenerates that release', async () => {
    repo.tag('v1.3.0');
    repo.commit('feat!: drop the old launcher');
    const r = await cli(['--from', 'v1.2.0', '--to', 'v1.3.0', '--version-only'], { cwd: repo.dir });
    assert.equal(r.stdout, '1.3.0\n');
    assert.equal((await cli(['--version-only'], { cwd: repo.dir })).stdout, '2.0.0\n');
  });

  it('reports no release when only hidden types changed', async () => {
    repo.tag('v2.0.0');
    repo.commit('docs: more docs');
    const r = await cli([], { cwd: repo.dir });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /No release needed: none of the 1 commit since v2\.0\.0/);
  });

  it('--path limits commits to a directory', async () => {
    repo.commit('feat(web): new page', 'web.txt');
    repo.commit('fix(api): api bug', 'api.txt');
    const r = await cli(['--json', '--path', 'web.txt'], { cwd: repo.dir });
    const json = JSON.parse(r.stdout);
    assert.deepEqual(
      json.commits.map((c: { subject: string }) => c.subject),
      ['new page'],
    );
  });

  it('a config file changes sections and the tag prefix is respected', async () => {
    writeFileSync(
      join(repo.dir, '.release-notes.json'),
      JSON.stringify({ sections: [{ type: 'feat', title: 'New' }], bumps: { docs: 'patch' } }),
    );
    try {
      const r = await cli(['--no-date'], { cwd: repo.dir });
      assert.match(r.stdout, /### New\n\n- \*\*web:\*\* new page/);
      assert.doesNotMatch(r.stdout, /Bug Fixes/);
    } finally {
      writeFileSync(join(repo.dir, '.release-notes.json'), '{"oops": true}');
    }
    const bad = await cli([], { cwd: repo.dir });
    assert.equal(bad.code, 2);
    assert.match(bad.stderr, /Unknown configuration key "oops"/);
    const broken = await cli(['--config', 'missing.json'], { cwd: repo.dir });
    assert.equal(broken.code, 2);
  });

  it('unknown refs are usage errors', async () => {
    const r = await cli(['--from', 'v0.0.0-nope', '--config', 'CHANGELOG.md'], { cwd: repo.dir });
    assert.equal(r.code, 2);
    const r2 = await cli(['--from', 'v0.0.0-nope', '--host', 'none', '--repo-url', 'x'], {
      cwd: join(repo.dir),
    });
    assert.equal(r2.code, 2);
  });
});

describe('cli in a new repository without tags', () => {
  it('bumps from package.json and creates CHANGELOG.md', async () => {
    const repo = new TempRepo();
    try {
      repo.write('package.json', JSON.stringify({ name: 'x', version: '0.1.0' }));
      repo.commit('feat: hello');
      repo.commit("Merge branch 'feature'");
      const r = await cli(['--write', '--date', '2026-11-19'], { cwd: repo.dir });
      assert.equal(r.code, 0, r.stderr);
      const text = readFileSync(join(repo.dir, 'CHANGELOG.md'), 'utf8');
      assert.ok(text.startsWith('# Changelog\n\nAll notable changes'));
      assert.match(text, /\n## 0\.2\.0 \(2026-11-19\)\n\n### Features\n\n- hello \([0-9a-f]{7}\)\n$/);
    } finally {
      repo.remove();
    }
  });
});
