import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultConfig, generate, parseCommits, ReleaseError, releaseTypeFor } from '../src/index.js';

const H = (n: number) => `${String(n).padStart(7, '0')}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
const commits = (...messages: string[]) => messages.map((message, i) => ({ hash: H(i + 1), message }));

describe('releaseTypeFor', () => {
  const config = defaultConfig();
  const type = (major: number, ...messages: string[]) =>
    releaseTypeFor(parseCommits(messages), config, major);

  it('picks the largest bump', () => {
    assert.equal(type(1, 'docs: x', 'chore: y'), null);
    assert.equal(type(1, 'fix: x', 'docs: y'), 'patch');
    assert.equal(type(1, 'perf: x'), 'patch');
    assert.equal(type(1, 'fix: x', 'feat: y'), 'minor');
    assert.equal(type(1, 'feat: x', 'fix!: y'), 'major');
    assert.equal(type(1, 'docs: x\n\nBREAKING CHANGE: hidden types count too'), 'major');
    assert.equal(type(1, 'Update README'), null);
  });

  it('pre-1.0: breaking changes bump the minor version', () => {
    assert.equal(type(0, 'feat!: x'), 'minor');
    assert.equal(releaseTypeFor(parseCommits(['feat!: x']), { ...config, preMajor: false }, 0), 'major');
  });

  it('ignores merges, fixups and commit/revert pairs', () => {
    const list = parseCommits([
      { hash: H(2), message: 'Revert "feat: x"\n\nThis reverts commit 0000001aaaa.' },
      { hash: H(1), message: 'feat: x' },
      { message: 'Merge pull request #1 from a/b\n\nfeat!: big' },
      { message: 'fixup! feat!: y' },
    ]);
    assert.equal(releaseTypeFor(list, config), null);
  });

  it('custom bumps', () => {
    const custom = { ...config, bumps: { ...config.bumps, docs: 'patch' as const, fix: null } };
    assert.equal(releaseTypeFor(parseCommits(['docs: x']), custom), 'patch');
    assert.equal(releaseTypeFor(parseCommits(['fix: x']), custom), null);
  });
});

describe('generate', () => {
  const base = { currentVersion: '1.2.0', previousTag: 'v1.2.0', date: '2026-11-19' };

  it('renders a full section with GitHub links', () => {
    const release = generate({
      ...base,
      config: { repoUrl: 'https://github.com/acme/widgets.git' },
      commits: commits(
        'feat(cli): add --json flag (#31)',
        'fix: crash on empty input\n\nFixes #20',
        'perf(parser): faster tokenizer',
        'docs: typo',
        'feat(api)!: rename `run` to `start`\n\nBREAKING CHANGE: `run()` is now `start()`.\nUpdate your imports.',
        'feat: support #12 in subjects',
      ),
    });
    assert.equal(release.version, '2.0.0');
    assert.equal(release.tag, 'v2.0.0');
    assert.equal(release.releaseType, 'major');
    assert.equal(release.previousVersion, '1.2.0');
    const R = 'https://github.com/acme/widgets';
    assert.equal(
      release.notes,
      [
        `## [2.0.0](${R}/compare/v1.2.0...v2.0.0) (2026-11-19)`,
        '',
        '### BREAKING CHANGES',
        '',
        '- **api:** `run()` is now `start()`.',
        `  Update your imports. ([0000005](${R}/commit/${H(5)}))`,
        '',
        '### Features',
        '',
        `- support [#12](${R}/issues/12) in subjects ([0000006](${R}/commit/${H(6)}))`,
        `- **api:** rename \`run\` to \`start\` ([0000005](${R}/commit/${H(5)}))`,
        `- **cli:** add --json flag ([#31](${R}/pull/31)) ([0000001](${R}/commit/${H(1)}))`,
        '',
        '### Bug Fixes',
        '',
        `- crash on empty input ([0000002](${R}/commit/${H(2)})), closes [#20](${R}/issues/20)`,
        '',
        '### Performance',
        '',
        `- **parser:** faster tokenizer ([0000003](${R}/commit/${H(3)}))`,
        '',
      ].join('\n'),
    );
  });

  it('renders GitLab links', () => {
    const release = generate({
      ...base,
      config: { repoUrl: 'git@gitlab.com:group/sub/project.git' },
      commits: commits('fix: thing\n\nCloses #3\n\nSee merge request group/sub/project!8', 'feat: see !4'),
    });
    const R = 'https://gitlab.com/group/sub/project';
    assert.match(
      release.notes,
      new RegExp(`^## \\[1\\.3\\.0\\]\\(${R}/-/compare/v1\\.2\\.0\\.\\.\\.v1\\.3\\.0\\)`),
    );
    assert.ok(release.notes.includes(`([!8](${R}/-/merge_requests/8))`));
    assert.ok(release.notes.includes(`closes [#3](${R}/-/issues/3)`));
    assert.ok(release.notes.includes(`see [!4](${R}/-/merge_requests/4)`));
    assert.ok(release.notes.includes(`(${R}/-/commit/${H(1)})`));
  });

  it('renders plain text without a repository URL', () => {
    const release = generate({ ...base, commits: commits('fix: a (#9)') });
    assert.equal(release.notes, '## 1.2.1 (2026-11-19)\n\n### Bug Fixes\n\n- a (#9) (0000001)\n');
  });

  it('host none disables links', () => {
    const release = generate({
      ...base,
      config: { repoUrl: 'https://github.com/a/b', host: 'none' },
      commits: commits('fix: a'),
    });
    assert.ok(!release.notes.includes('https://'));
  });

  it('returns no release when nothing calls for one', () => {
    const release = generate({ ...base, commits: commits('docs: x', 'chore: y', 'Merge branch x') });
    assert.equal(release.version, null);
    assert.equal(release.tag, null);
    assert.equal(release.notes, '');
    assert.equal(release.included.length, 2);
    assert.equal(release.commits.length, 3);
  });

  it('pre-releases', () => {
    assert.equal(
      generate({ ...base, prerelease: 'beta', commits: commits('feat: a') }).version,
      '1.3.0-beta.0',
    );
    assert.equal(
      generate({ ...base, currentVersion: '1.3.0-beta.0', prerelease: 'beta', commits: commits('fix: a') })
        .version,
      '1.3.0-beta.1',
    );
    assert.throws(() => generate({ ...base, prerelease: 'be ta', commits: [] }), ReleaseError);
  });

  it('releaseAs forces a type or an exact version', () => {
    assert.equal(generate({ ...base, releaseAs: 'major', commits: [] }).version, '2.0.0');
    assert.equal(generate({ ...base, releaseAs: 'v1.5.0', commits: [] }).version, '1.5.0');
    assert.equal(generate({ ...base, releaseAs: '1.5.0', commits: [] }).releaseType, 'minor');
    assert.equal(
      generate({ ...base, releaseAs: '1.2.1', commits: [] }).notes,
      '## 1.2.1 (2026-11-19)\n\nNo notable changes.\n',
    );
    assert.throws(() => generate({ ...base, releaseAs: 'huge', commits: [] }), /must be major, minor, patch/);
  });

  it('validates the current version and date', () => {
    assert.throws(() => generate({ currentVersion: 'banana', commits: [] }), ReleaseError);
    assert.throws(() => generate({ ...base, date: '19/11/2026', commits: commits('fix: a') }), ReleaseError);
    assert.equal(
      generate({ ...base, date: null, commits: commits('fix: a') }).notes.split('\n')[0],
      '## 1.2.1',
    );
    assert.equal(
      generate({ ...base, date: new Date('2030-01-02T03:04:05Z'), commits: commits('fix: a') }).notes.split(
        '\n',
      )[0],
      '## 1.2.1 (2030-01-02)',
    );
    assert.equal(generate({ commits: commits('feat: first') }).version, '0.1.0');
  });

  it('cancels a commit and its revert, keeps a lone revert', () => {
    const release = generate({
      ...base,
      commits: [
        { hash: H(3), message: `Revert "feat: b"\n\nThis reverts commit ${H(2)}.` },
        { hash: H(2), message: 'feat: b' },
        { hash: H(1), message: 'revert: fix: old bug\n\nRefs: 9999999' },
      ],
    });
    assert.equal(release.version, '1.2.1');
    assert.ok(release.notes.includes('### Reverts\n\n- fix: old bug'));
    assert.ok(!release.notes.includes('feat: b'));
  });

  it('git reverts without a hash cancel by header', () => {
    const release = generate({ ...base, commits: commits('Revert "feat: b"', 'feat: b', 'fix: c') });
    assert.equal(release.version, '1.2.1');
    assert.ok(!release.notes.includes('Reverts'));
  });

  it('dedupes cherry-picks', () => {
    const release = generate({ ...base, commits: commits('fix: same', 'fix: same') });
    assert.equal(release.notes.match(/- same/g)?.length, 1);
  });

  it('includeMerges reads the header from the merge body', () => {
    const merge = {
      hash: H(1),
      parents: ['a', 'b'],
      message: 'Merge pull request #12 from me/x\n\nfeat(ui): dark mode',
    };
    assert.equal(generate({ ...base, commits: [merge] }).version, null);
    const release = generate({ ...base, config: { includeMerges: true }, commits: [merge] });
    assert.equal(release.version, '1.3.0');
    assert.ok(release.notes.includes('- **ui:** dark mode (#12) (0000001)'));
    const noHeader = { ...merge, message: 'Merge pull request #13 from me/y\n\nSome title' };
    assert.equal(generate({ ...base, config: { includeMerges: true }, commits: [noHeader] }).version, null);
  });

  it('custom sections, otherTitle and showAuthors', () => {
    const release = generate({
      ...base,
      config: {
        sections: [
          { type: ['feat', 'fix'], title: 'Changes' },
          { type: 'chore', title: 'Housekeeping' },
        ],
        otherTitle: 'Other',
        showAuthors: true,
      },
      commits: [
        { hash: H(1), message: 'feat: a', author: 'Ada' },
        { hash: H(2), message: 'fix: b' },
        { hash: H(3), message: 'chore: c' },
        { hash: H(4), message: 'Tweak things' },
        { hash: H(5), message: 'perf: hidden by omission' },
      ],
    });
    assert.equal(
      release.notes,
      [
        '## 1.3.0 (2026-11-19)',
        '',
        '### Changes',
        '',
        '- a (0000001), by Ada',
        '- b (0000002)',
        '',
        '### Housekeeping',
        '',
        '- c (0000003)',
        '',
        '### Other',
        '',
        '- Tweak things (0000004)',
        '',
      ].join('\n'),
    );
  });

  it('a custom tag prefix', () => {
    const release = generate({
      currentVersion: 'release-1.0.0',
      previousTag: 'release-1.0.0',
      date: null,
      config: { tagPrefix: 'release-', repoUrl: 'https://github.com/a/b' },
      commits: commits('fix: a'),
    });
    assert.equal(release.tag, 'release-1.0.1');
    assert.ok(
      release.notes.startsWith('## [1.0.1](https://github.com/a/b/compare/release-1.0.0...release-1.0.1)'),
    );
  });
});
