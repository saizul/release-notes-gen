import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bumpVersion, compareSemver, formatSemver, maxReleaseType, parseSemver } from '../src/index.js';

describe('parseSemver', () => {
  it('parses versions with and without a prefix', () => {
    assert.deepEqual(parseSemver('1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [], build: [] });
    assert.deepEqual(parseSemver('v1.2.3-beta.2+sha.5'), {
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: ['beta', 2],
      build: ['sha', '5'],
    });
    assert.equal(parseSemver('release-1.0.0', 'release-')?.major, 1);
  });

  it('rejects invalid versions', () => {
    for (const bad of [
      '1.2',
      '01.2.3',
      '1.2.3-01',
      '1.2.3-',
      'x',
      '',
      '1.2.3.4',
      '99999999999999999999.0.0',
    ]) {
      assert.equal(parseSemver(bad), null, bad);
    }
  });

  it('formatSemver round-trips', () => {
    for (const v of ['0.0.0', '1.2.3-rc.1', '2.0.0-alpha+001', '1.0.0-x-y.7']) {
      assert.equal(formatSemver(parseSemver(v)!), v);
    }
  });
});

describe('compareSemver', () => {
  it('follows the semver.org precedence example', () => {
    const ordered = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0',
      '1.0.1',
      '1.1.0',
      '2.0.0',
    ];
    for (let i = 0; i < ordered.length - 1; i++) {
      assert.ok(compareSemver(ordered[i]!, ordered[i + 1]!) < 0, `${ordered[i]} < ${ordered[i + 1]}`);
      assert.ok(compareSemver(ordered[i + 1]!, ordered[i]!) > 0);
    }
    assert.equal(compareSemver('1.0.0+a', '1.0.0+b'), 0);
    assert.throws(() => compareSemver('x', '1.0.0'), TypeError);
  });
});

describe('bumpVersion', () => {
  const cases: [string, 'major' | 'minor' | 'patch', string | false, string][] = [
    ['1.2.3', 'patch', false, '1.2.4'],
    ['1.2.3', 'minor', false, '1.3.0'],
    ['1.2.3', 'major', false, '2.0.0'],
    ['0.4.1', 'major', false, '1.0.0'],
    ['1.2.3', 'minor', 'beta', '1.3.0-beta.0'],
    ['1.3.0-beta.0', 'patch', 'beta', '1.3.0-beta.1'],
    ['1.3.0-beta.1', 'minor', 'beta', '1.3.0-beta.2'],
    ['1.3.0-beta.1', 'major', 'beta', '2.0.0-beta.0'],
    ['1.3.0-beta.4', 'minor', 'rc', '1.3.0-rc.0'],
    ['1.3.0-rc.2', 'patch', false, '1.3.0'],
    ['1.3.0-rc.2', 'minor', false, '1.3.0'],
    ['1.3.0-rc.2', 'major', false, '2.0.0'],
    ['1.3.1-rc.0', 'patch', 'rc', '1.3.1-rc.1'],
    ['1.3.1-rc.0', 'minor', 'rc', '1.4.0-rc.0'],
    ['2.0.0-rc.1', 'major', 'rc', '2.0.0-rc.2'],
    ['2.0.0-rc.1', 'minor', false, '2.0.0'],
    ['1.0.0-alpha', 'patch', 'alpha', '1.0.0-alpha.0'],
    ['1.0.0-alpha.beta.1', 'patch', 'alpha', '1.0.0-alpha.beta.2'],
    ['1.2.3+build.1', 'patch', false, '1.2.4'],
  ];
  for (const [current, type, pre, expected] of cases) {
    it(`${current} + ${type}${pre ? ` (${pre})` : ''} = ${expected}`, () => {
      assert.equal(bumpVersion(current, type, { prerelease: pre }), expected);
    });
  }

  it('maxReleaseType', () => {
    assert.equal(maxReleaseType(null, null), null);
    assert.equal(maxReleaseType(null, 'patch'), 'patch');
    assert.equal(maxReleaseType('minor', null), 'minor');
    assert.equal(maxReleaseType('minor', 'major'), 'major');
    assert.equal(maxReleaseType('minor', 'patch'), 'minor');
  });
});
