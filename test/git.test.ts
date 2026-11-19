import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { GitError, listVersionTags, readCommits, refExists, remoteUrl } from '../src/git.js';
import { TempRepo } from './helpers.js';

describe('git helpers on a temporary repository', () => {
  let repo: TempRepo;
  const hashes: string[] = [];

  before(() => {
    repo = new TempRepo();
    hashes.push(repo.commit('chore: initial commit'));
    repo.tag('v1.0.0');
    hashes.push(repo.commit('feat(core): first feature\n\nWith a body.\n\nRefs: #1'));
    repo.tag('v1.1.0-rc.0');
    repo.tag('not-a-version');
    repo.tag('v2.0.0+build');
    hashes.push(repo.commit('fix: unit separator \u001f and record separator are fine'));
    repo.tag('v1.1.0');
    repo.git('checkout', '-q', '-b', 'side', hashes[0]!);
    repo.commit('feat: on a side branch', 'side.txt');
    repo.tag('v9.0.0');
    repo.git('checkout', '-q', 'main');
    repo.git('remote', 'add', 'origin', 'git@github.com:acme/demo.git');
  });

  after(() => repo.remove());

  it('lists version tags reachable from HEAD, newest first', () => {
    assert.deepEqual(
      listVersionTags({ cwd: repo.dir }).map((t) => t.name),
      ['v1.1.0', 'v1.1.0-rc.0', 'v1.0.0'],
    );
    assert.deepEqual(
      listVersionTags({ cwd: repo.dir, includePrerelease: false }).map((t) => t.name),
      ['v1.1.0', 'v1.0.0'],
    );
    assert.equal(listVersionTags({ cwd: repo.dir, mergedInto: '' })[0]!.name, 'v9.0.0');
    assert.deepEqual(listVersionTags({ cwd: repo.dir, tagPrefix: 'x' }), []);
  });

  it('reads commits in a range with full messages', () => {
    const commits = readCommits({ cwd: repo.dir, from: 'v1.0.0' });
    assert.equal(commits.length, 2);
    assert.equal(commits[0]!.hash, hashes[2]);
    assert.equal(commits[0]!.message.trim(), 'fix: unit separator \u001f and record separator are fine');
    assert.equal(commits[1]!.message.trim(), 'feat(core): first feature\n\nWith a body.\n\nRefs: #1');
    assert.equal(commits[1]!.author, 'Test User');
    assert.match(commits[1]!.date!, /^2026-01-01T00:00:0\d/);
    assert.equal(commits[1]!.parents!.length, 1);
    assert.equal(readCommits({ cwd: repo.dir }).length, 3);
  });

  it('remote URL and refs', () => {
    assert.equal(remoteUrl(repo.dir), 'git@github.com:acme/demo.git');
    assert.equal(remoteUrl(repo.dir, 'upstream'), null);
    assert.equal(refExists('v1.0.0', repo.dir), true);
    assert.equal(refExists('nope', repo.dir), false);
  });

  it('a bad range is a GitError', () => {
    assert.throws(() => readCommits({ cwd: repo.dir, from: 'does-not-exist' }), GitError);
  });

  it('an empty repository has no commits', () => {
    const empty = new TempRepo();
    try {
      assert.deepEqual(readCommits({ cwd: empty.dir }), []);
      assert.deepEqual(listVersionTags({ cwd: empty.dir, mergedInto: '' }), []);
    } finally {
      empty.remove();
    }
  });
});
