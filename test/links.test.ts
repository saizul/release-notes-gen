import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLinker, linkifyReferences, parseRepoUrl } from '../src/index.js';

describe('parseRepoUrl', () => {
  const cases: [string, string | null, string?][] = [
    ['git@github.com:owner/repo.git', 'https://github.com/owner/repo', 'github'],
    ['https://github.com/owner/repo', 'https://github.com/owner/repo', 'github'],
    ['https://github.com/owner/repo.git/', 'https://github.com/owner/repo', 'github'],
    ['git+https://github.com/owner/repo.git', 'https://github.com/owner/repo', 'github'],
    ['https://x-access-token:SECRET@github.com/owner/repo.git', 'https://github.com/owner/repo', 'github'],
    ['ssh://git@github.com/owner/repo.git', 'https://github.com/owner/repo', 'github'],
    ['git@gitlab.com:group/sub/project.git', 'https://gitlab.com/group/sub/project', 'gitlab'],
    [
      'ssh://git@gitlab.example.com:2222/group/project.git',
      'https://gitlab.example.com/group/project',
      'gitlab',
    ],
    ['https://gitlab.com/group/project/-/tree/main', 'https://gitlab.com/group/project', 'gitlab'],
    ['http://git.internal/team/app', 'http://git.internal/team/app', 'none'],
    ['github.com/owner/repo', 'https://github.com/owner/repo', 'github'],
    ['/home/me/repo', null],
    ['./repo', null],
    ['C:\\repos\\x', null],
    ['C:/repos/x', null],
    ['file:///tmp/repo.git', null],
    ['https://github.com/', null],
    ['', null],
  ];
  for (const [input, url, host] of cases) {
    it(input || '(empty)', () => {
      const info = parseRepoUrl(input);
      assert.equal(info?.url ?? null, url);
      if (host) assert.equal(info?.host, host);
      if (info) assert.ok(!info.url.includes('SECRET'));
    });
  }

  it('an explicit host overrides detection', () => {
    assert.equal(parseRepoUrl('https://git.example.com/a/b', 'gitlab')?.host, 'gitlab');
  });
});

describe('createLinker', () => {
  it('GitHub', () => {
    const l = createLinker(parseRepoUrl('https://github.com/o/r'));
    assert.equal(l.commit('abc'), 'https://github.com/o/r/commit/abc');
    assert.equal(
      l.reference({ prefix: '#', number: 1, repository: null }),
      'https://github.com/o/r/issues/1',
    );
    assert.equal(
      l.reference({ prefix: '#', number: 2, repository: 'x/y' }),
      'https://github.com/x/y/issues/2',
    );
    assert.equal(l.reference({ prefix: '!', number: 3, repository: null }), null);
    assert.equal(l.pullRequest(4), 'https://github.com/o/r/pull/4');
    assert.equal(l.compare('v1.0.0', 'v1.1.0'), 'https://github.com/o/r/compare/v1.0.0...v1.1.0');
  });

  it('GitLab', () => {
    const l = createLinker(parseRepoUrl('https://gitlab.com/g/p'));
    assert.equal(l.commit('abc'), 'https://gitlab.com/g/p/-/commit/abc');
    assert.equal(
      l.reference({ prefix: '#', number: 1, repository: null }),
      'https://gitlab.com/g/p/-/issues/1',
    );
    assert.equal(
      l.reference({ prefix: '!', number: 2, repository: 'g/q' }),
      'https://gitlab.com/g/q/-/merge_requests/2',
    );
    assert.equal(l.pullRequest(3), 'https://gitlab.com/g/p/-/merge_requests/3');
    assert.equal(l.compare('v1', 'v2'), 'https://gitlab.com/g/p/-/compare/v1...v2');
  });

  it('no repository means no links', () => {
    const l = createLinker(null);
    assert.equal(l.commit('a'), null);
    assert.equal(l.compare('a', 'b'), null);
    assert.equal(createLinker(parseRepoUrl('https://git.example.com/a/b')).commit('a'), null);
  });
});

describe('linkifyReferences', () => {
  const l = createLinker(parseRepoUrl('https://github.com/o/r'));
  it('links references but not inside code spans', () => {
    assert.equal(
      linkifyReferences('fix #1 and `#2`, again #1 (x/y#3)', l),
      'fix [#1](https://github.com/o/r/issues/1) and `#2`, again [#1](https://github.com/o/r/issues/1) ([x/y#3](https://github.com/x/y/issues/3))',
    );
    assert.equal(linkifyReferences('no refs here', l), 'no refs here');
    assert.equal(linkifyReferences('#1', createLinker(null)), '#1');
  });
});
