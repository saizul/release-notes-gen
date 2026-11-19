import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_CHANGELOG_HEADER, prependToChangelog } from '../src/index.js';

const section = (v: string) => `## ${v} (2026-11-19)\n\n### Bug Fixes\n\n- thing ${v}\n`;

describe('prependToChangelog', () => {
  it('creates a changelog with the header', () => {
    assert.equal(
      prependToChangelog(null, section('1.0.0'), '1.0.0'),
      `${DEFAULT_CHANGELOG_HEADER}\n\n${section('1.0.0')}`,
    );
    assert.equal(
      prependToChangelog('  \n', section('1.0.0'), '1.0.0', '# Changes'),
      `# Changes\n\n${section('1.0.0')}`,
    );
  });

  it('inserts above the newest release, after the intro', () => {
    const existing = `# Changelog\n\nIntro text.\n\n${section('1.0.0')}`;
    assert.equal(
      prependToChangelog(existing, section('1.1.0'), '1.1.0'),
      `# Changelog\n\nIntro text.\n\n${section('1.1.0')}\n${section('1.0.0')}`,
    );
  });

  it('keeps an Unreleased section on top', () => {
    const existing = `# Changelog\n\n## [Unreleased]\n\n- pending\n\n## [1.0.0] - 2026-01-01\n\n- old\n`;
    assert.equal(
      prependToChangelog(existing, section('1.1.0'), '1.1.0'),
      `# Changelog\n\n## [Unreleased]\n\n- pending\n\n${section('1.1.0')}\n## [1.0.0] - 2026-01-01\n\n- old\n`,
    );
  });

  it('replaces an existing section for the same version', () => {
    const once = prependToChangelog(`# Changelog\n\n${section('1.0.0')}`, section('1.1.0'), '1.1.0');
    const twice = prependToChangelog(once, '## 1.1.0 (2026-11-20)\n\n- regenerated\n', '1.1.0');
    assert.equal(twice, `# Changelog\n\n## 1.1.0 (2026-11-20)\n\n- regenerated\n\n${section('1.0.0')}`);
    const linked =
      '# Changelog\n\n## [1.1.0](https://x.test/compare) (2026-11-19)\n\n- a\n\n## 1.0.0\n\n- b\n';
    assert.equal(
      prependToChangelog(linked, '## [1.1.0](https://x.test/compare) (2026-11-21)\n\n- c\n', '1.1.0'),
      '# Changelog\n\n## [1.1.0](https://x.test/compare) (2026-11-21)\n\n- c\n\n## 1.0.0\n\n- b\n',
    );
  });

  it('does not confuse 1.1.0 with 1.1.0-rc.1 or 11.1.0', () => {
    const existing = '# Changelog\n\n## 1.1.0-rc.1\n\n- rc\n\n## 11.1.0\n\n- other\n';
    const out = prependToChangelog(existing, '## 1.1.0\n\n- final\n', '1.1.0');
    assert.equal(
      out,
      '# Changelog\n\n## 1.1.0\n\n- final\n\n## 1.1.0-rc.1\n\n- rc\n\n## 11.1.0\n\n- other\n',
    );
  });

  it('keeps link definitions at the bottom', () => {
    const existing = '# Changelog\n\nIntro\n\n[1.0.0]: https://x.test/1.0.0\n';
    assert.equal(
      prependToChangelog(existing, '## 1.1.0\n\n- new\n', '1.1.0'),
      '# Changelog\n\nIntro\n\n## 1.1.0\n\n- new\n\n[1.0.0]: https://x.test/1.0.0\n',
    );
  });

  it('ignores headings inside code fences and handles CRLF', () => {
    const existing = '# Changelog\r\n\r\n```md\r\n## not a release\r\n```\r\n\r\n## 1.0.0\r\n\r\n- old\r\n';
    assert.equal(
      prependToChangelog(existing, '## 1.1.0\n\n- new\n', '1.1.0'),
      '# Changelog\n\n```md\n## not a release\n```\n\n## 1.1.0\n\n- new\n\n## 1.0.0\n\n- old\n',
    );
  });

  it('appends when there is no release heading yet', () => {
    assert.equal(
      prependToChangelog('# Changelog\n', '## 0.1.0\n\n- first\n', '0.1.0'),
      '# Changelog\n\n## 0.1.0\n\n- first\n',
    );
  });
});
