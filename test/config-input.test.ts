import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigError, DEFAULT_SECTIONS, InputError, parseCommitInput, resolveConfig } from '../src/index.js';

describe('resolveConfig', () => {
  it('returns the defaults', () => {
    const c = resolveConfig();
    assert.equal(c.tagPrefix, 'v');
    assert.equal(c.sections.length, DEFAULT_SECTIONS.length);
    assert.equal(c.bumps.feat, 'minor');
    assert.equal(c.preMajor, true);
  });

  it('merges bumps and replaces sections', () => {
    const c = resolveConfig({
      bumps: { Docs: 'patch', fix: null },
      sections: [{ type: ['FEAT', 'fix'], title: 'Changes' }],
      tagPrefix: '',
      repoUrl: '',
      host: 'gitlab',
      preMajor: false,
      $schema: 'ignored',
    });
    assert.equal(c.bumps.docs, 'patch');
    assert.equal(c.bumps.fix, null);
    assert.equal(c.bumps.feat, 'minor');
    assert.deepEqual(c.sections, [{ type: ['feat', 'fix'], title: 'Changes', hidden: false }]);
    assert.equal(c.tagPrefix, '');
    assert.equal(c.repoUrl, null);
    assert.equal(c.host, 'gitlab');
    assert.equal(c.preMajor, false);
  });

  it('rejects bad values with a clear message', () => {
    const bad: [unknown, RegExp][] = [
      [[], /must be an object/],
      [{ nope: 1 }, /Unknown configuration key "nope"/],
      [{ sections: {} }, /"sections" must be an array/],
      [{ sections: [1] }, /sections\[0\] must be an object/],
      [{ sections: [{ type: '', title: 'x' }] }, /sections\[0\]\.type/],
      [{ sections: [{ type: 'a' }] }, /sections\[0\]\.title/],
      [{ sections: [{ type: 'a', title: 'A', hidden: 'yes' }] }, /hidden/],
      [{ bumps: [] }, /"bumps" must be an object/],
      [{ bumps: { feat: 'huge' } }, /bumps\.feat/],
      [{ tagPrefix: 1 }, /"tagPrefix" must be a string/],
      [{ repoUrl: 1 }, /"repoUrl" must be a string or null/],
      [{ preMajor: 'no' }, /"preMajor" must be true or false/],
      [{ host: 'bitbucket' }, /"host" must be/],
    ];
    for (const [input, message] of bad)
      assert.throws(() => resolveConfig(input), { name: 'ConfigError', message });
    assert.ok(new ConfigError('x') instanceof Error);
  });
});

describe('parseCommitInput', () => {
  it('JSON arrays of strings and objects', () => {
    assert.deepEqual(parseCommitInput('["feat: a", "fix: b"]'), [
      { message: 'feat: a' },
      { message: 'fix: b' },
    ]);
    assert.deepEqual(
      parseCommitInput(
        JSON.stringify({
          commits: [
            {
              sha: 'abc1234',
              message: 'feat: a',
              author: 'Ada',
              date: '2026-01-01',
              parents: [{ sha: 'p1' }],
            },
            { id: 'def5678', subject: 'fix: b', parents: ['x', 'y'] },
          ],
        }),
      ),
      [
        { hash: 'abc1234', message: 'feat: a', author: 'Ada', date: '2026-01-01', parents: ['p1'] },
        { hash: 'def5678', message: 'fix: b', parents: ['x', 'y'] },
      ],
    );
    assert.throws(() => parseCommitInput('[1]'), InputError);
    assert.throws(() => parseCommitInput('[{"hash":"x"}]'), /no "message"/);
    assert.throws(() => parseCommitInput('{"a":1}'), /must be an array/);
    assert.throws(() => parseCommitInput('[oops'), /does not parse/);
  });

  it('default git log output', () => {
    const log = [
      'commit 1111111111111111111111111111111111111111',
      'Merge: aaaaaaa bbbbbbb',
      'Author: Ada Lovelace <ada@example.com>',
      'Date:   Mon Jan 1 00:00:00 2026 +0000',
      '',
      '    Merge pull request #5 from a/b',
      '',
      '    feat: thing',
      '',
      'commit 2222222222222222222222222222222222222222',
      'Author: Grace <grace@example.com>',
      'Date:   Mon Jan 1 00:00:00 2026 +0000',
      '',
      '    fix(core): bug',
      '    ',
      '    commit messages can mention commit 123abcd too',
      '',
    ].join('\n');
    assert.deepEqual(parseCommitInput(log), [
      {
        hash: '1111111111111111111111111111111111111111',
        parents: ['aaaaaaa', 'bbbbbbb'],
        author: 'Ada Lovelace',
        date: 'Mon Jan 1 00:00:00 2026 +0000',
        message: 'Merge pull request #5 from a/b\n\nfeat: thing',
      },
      {
        hash: '2222222222222222222222222222222222222222',
        author: 'Grace',
        date: 'Mon Jan 1 00:00:00 2026 +0000',
        message: 'fix(core): bug\n\ncommit messages can mention commit 123abcd too',
      },
    ]);
  });

  it('NUL-separated messages', () => {
    assert.deepEqual(parseCommitInput('feat: a\n\nbody\u0000fix: b\n\u0000'), [
      { message: 'feat: a\n\nbody' },
      { message: 'fix: b' },
    ]);
  });

  it('one header per line, with or without a hash', () => {
    assert.deepEqual(parseCommitInput('\uFEFFabc1234 feat: a\r\nfix: b\n\n'), [
      { hash: 'abc1234', message: 'feat: a' },
      { message: 'fix: b' },
    ]);
    assert.deepEqual(parseCommitInput('   '), []);
  });
});
