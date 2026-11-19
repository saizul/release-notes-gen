import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Commit, findReferences, parseCommit, parseCommits } from '../src/index.js';

type Expected = Partial<Omit<Commit, 'references'>> & { references?: string[] };

/** Parser vectors: message -> the fields that must match. */
const VECTORS: [string, Expected][] = [
  [
    'feat: add a thing',
    { type: 'feat', scope: null, subject: 'add a thing', breaking: false, conventional: true },
  ],
  ['fix(parser): handle empty input', { type: 'fix', scope: 'parser', subject: 'handle empty input' }],
  ['Feat(API): upper-case type', { type: 'feat', scope: 'API', subject: 'upper-case type' }],
  ['feat(api,cli): two scopes', { type: 'feat', scope: 'api,cli' }],
  ['feat(@scope/pkg): npm scope', { type: 'feat', scope: '@scope/pkg' }],
  ['feat(): empty scope', { type: 'feat', scope: null, subject: 'empty scope' }],
  ['feat:no space after colon', { type: 'feat', subject: 'no space after colon' }],
  ['feat!: breaking bang', { breaking: true, breakingNotes: ['breaking bang'] }],
  ['feat(api)!: breaking with scope', { scope: 'api', breaking: true }],
  [
    'feat: new option\n\nSome body text.\n\nBREAKING CHANGE: the old option is gone',
    { breaking: true, breakingNotes: ['the old option is gone'], body: 'Some body text.' },
  ],
  ['fix: x\n\nBREAKING-CHANGE: hyphen form', { breaking: true, breakingNotes: ['hyphen form'] }],
  [
    'feat!: bang and footer\n\nBREAKING CHANGE: explained here',
    { breaking: true, breakingNotes: ['explained here'] },
  ],
  [
    'refactor: body note\n\nIntro paragraph.\nBREAKING CHANGE: written in the body\nand continued\n\nMore text.',
    { breaking: true, breakingNotes: ['written in the body\nand continued'] },
  ],
  [
    'feat: multi-line footer\n\nBREAKING CHANGE: first line\nsecond line\nReviewed-by: Sam',
    {
      breakingNotes: ['first line\nsecond line'],
      footers: [
        { token: 'BREAKING CHANGE', value: 'first line\nsecond line' },
        { token: 'Reviewed-by', value: 'Sam' },
      ],
    },
  ],
  [
    'fix: footers\n\nbody\n\nRefs: #123\nSigned-off-by: A Person <a@example.com>',
    {
      body: 'body',
      footers: [
        { token: 'Refs', value: '#123' },
        { token: 'Signed-off-by', value: 'A Person <a@example.com>' },
      ],
    },
  ],
  [
    'fix: hash footer\n\nFixes #42',
    { footers: [{ token: 'Fixes', value: '#42' }], references: ['closes? fixes #42'] },
  ],
  [
    'docs: note in the middle\n\nNote: this is body text\n\nAnd this too.',
    { body: 'Note: this is body text\n\nAnd this too.', footers: [] },
  ],
  ['feat: squash merge (#123)', { subject: 'squash merge', pr: 123, references: [] }],
  ['feat: squash merge from fork (owner/repo#5)', { subject: 'squash merge from fork', pr: 5 }],
  ['fix: closes in body\n\nThis closes #7 and resolves #8.', { references: ['closes #7', 'resolves #8'] }],
  ['fix: lists\n\nFixes #1, #2 and #3', { references: ['fixes #1', 'fixes #2', 'fixes #3'] }],
  ['feat: cross repo\n\nCloses: other/repo#9', { references: ['closes other/repo#9'] }],
  [
    'feat: gitlab\n\nCloses group/sub/project#4 and see !12',
    { references: ['closes group/sub/project#4', '!12'] },
  ],
  ['fix: GH-style GH-15', { references: ['#15'] }],
  ['fix: not refs: issue#1 a#b http://x.test/#2 `#3` stays', { references: [] }],
  [
    'Revert "feat: shiny button"\n\nThis reverts commit 1234567890abcdef1234567890abcdef12345678.',
    {
      type: 'revert',
      conventional: false,
      subject: 'feat: shiny button',
      revert: { header: 'feat: shiny button', hash: '1234567890abcdef1234567890abcdef12345678' },
    },
  ],
  [
    'revert: feat(ui): shiny button\n\nRefs: 1234567',
    { type: 'revert', conventional: true, revert: { header: 'feat(ui): shiny button', hash: '1234567' } },
  ],
  [
    'revert(ui): Revert "feat(ui): shiny"\n\nThis reverts commit abcdef0.',
    { type: 'revert', scope: 'ui', revert: { header: 'feat(ui): shiny', hash: 'abcdef0' } },
  ],
  [
    'Merge pull request #77 from someone/feature-x\n\nfeat: the PR title',
    { ignored: 'merge', merge: { pr: 77, source: 'someone/feature-x' }, pr: 77, conventional: false },
  ],
  ["Merge branch 'main' into feature", { ignored: 'merge', merge: { pr: null, source: 'main' } }],
  [
    "Merge branch 'feature' into 'main'\n\nfeat: thing\n\nSee merge request group/project!42",
    { ignored: 'merge', merge: { pr: 42, source: 'feature' }, pr: 42 },
  ],
  ["Merge remote-tracking branch 'origin/main'", { ignored: 'merge' }],
  ['fixup! feat: thing', { ignored: 'fixup' }],
  ['squash! fix: other', { ignored: 'fixup' }],
  ['amend! fix: other', { ignored: 'fixup' }],
  ['', { ignored: 'empty' }],
  ['Update README.md', { type: null, conventional: false, subject: 'Update README.md', breaking: false }],
  [
    'WIP stuff\n\nBREAKING CHANGE: not conventional',
    { conventional: false, breaking: false, breakingNotes: [] },
  ],
  [
    'feat: windows line endings\r\n\r\nBREAKING CHANGE: crlf\r\n',
    { breaking: true, breakingNotes: ['crlf'] },
  ],
  ['\n\n  feat: leading blank lines', { type: 'feat', subject: 'leading blank lines' }],
  ['feat: trailing spaces   \n\n', { subject: 'trailing spaces' }],
  ['chore(release): 1.2.0', { type: 'chore', scope: 'release', subject: '1.2.0' }],
  ['feat(deps)!: bump\n\nbreaking change: lower-case token', { breakingNotes: ['lower-case token'] }],
  ['fix: emoji 🎉 and unicode ünïcödé', { subject: 'fix: emoji 🎉 and unicode ünïcödé'.slice(5) }],
];

const refString = (r: Commit['references'][number]) =>
  `${r.action ? `${r.action} ` : ''}${r.repository ?? ''}${r.prefix}${r.number}`;

describe('parseCommit vectors', () => {
  for (const [message, expected] of VECTORS) {
    it(JSON.stringify(message.split('\n')[0] || '(empty)'), () => {
      const c = parseCommit(message);
      const { references, ...rest } = expected;
      for (const [key, value] of Object.entries(rest)) {
        assert.deepEqual(c[key as keyof Commit], value, `${key} of ${JSON.stringify(message)}`);
      }
      if (references) {
        const actual = c.references.map(refString);
        const want = references.map((r) => r.replace(/^closes\? /, ''));
        assert.deepEqual(actual, want);
      }
    });
  }
});

describe('parseCommit metadata', () => {
  it('keeps hash, author and date, and treats many parents as a merge', () => {
    const c = parseCommit({
      hash: 'abcdef1234567890',
      message: 'feat: x',
      author: 'Ada',
      date: '2026-01-01T00:00:00Z',
      parents: ['a', 'b'],
    });
    assert.equal(c.hash, 'abcdef1234567890');
    assert.equal(c.shortHash, 'abcdef1');
    assert.equal(c.author, 'Ada');
    assert.equal(c.date, '2026-01-01T00:00:00Z');
    assert.equal(c.ignored, 'merge');
  });

  it('parseCommits maps every input', () => {
    const commits = parseCommits(['feat: a', { message: 'fix: b', hash: '1234567' }]);
    assert.deepEqual(
      commits.map((c) => [c.type, c.shortHash]),
      [
        ['feat', ''],
        ['fix', '1234567'],
      ],
    );
  });

  it('findReferences dedupes and upgrades the action', () => {
    assert.deepEqual(findReferences('see #1, then fixes #1').map(refString), ['fixes #1']);
  });
});
