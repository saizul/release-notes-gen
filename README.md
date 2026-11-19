# release-notes-gen

[![CI](https://github.com/saizul/release-notes-gen/actions/workflows/ci.yml/badge.svg)](https://github.com/saizul/release-notes-gen/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/saizul/release-notes-gen?sort=semver)](https://github.com/saizul/release-notes-gen/releases)
[![npm (GitHub Packages)](https://img.shields.io/badge/npm-%40saizul%2Frelease--notes--gen-blue)](https://github.com/saizul/release-notes-gen/pkgs/npm/release-notes-gen)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![Node 20+](https://img.shields.io/badge/node-20%2B-blue)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

The next version number and a clean changelog from your commit messages, in
one command and zero dependencies.

```console
$ release-notes-gen --from v1.2.0 --write
## [1.3.0](https://github.com/acme/rocket/compare/v1.2.0...v1.3.0) (2026-11-19)

### Features

- **engine:** add a second stage ([4f2c1a9](https://github.com/acme/rocket/commit/4f2c1a9...)), closes [#10](https://github.com/acme/rocket/issues/10)

### Bug Fixes

- wobble on launch ([#11](https://github.com/acme/rocket/pull/11)) ([b81e0d3](https://github.com/acme/rocket/commit/b81e0d3...))
Wrote 1.3.0 to CHANGELOG.md
```

- **Semantic version from [Conventional Commits](https://www.conventionalcommits.org/)**:
  `feat` is minor, `fix` and `perf` are patch, `!` or `BREAKING CHANGE` is
  major (minor while you are on `0.x`). Pre-releases like `1.3.0-rc.0`,
  `-rc.1`, ... and graduating them to `1.3.0` just work.
- **A robust parser**: scopes (`feat(api,cli)`, `feat(@org/pkg)`), `!`,
  multi-line footers and git trailers, `BREAKING CHANGE` in footers or the
  body, git's `Revert "..."` and `revert:` commits (a commit and its revert
  cancel out), merge commits from GitHub and GitLab, `fixup!`/`squash!`,
  squash-merge `(#123)` suffixes and CRLF messages.
- **Links for GitHub and GitLab**: commits, pull and merge requests, issues
  (including `owner/repo#12` and `Closes #1, #2 and #3`) and the compare
  view. The repository is detected from the `origin` remote, with any
  credentials stripped.
- **Updates `CHANGELOG.md`**: inserts the new section above the last
  release (and below `## [Unreleased]`), keeps your intro and link
  definitions, and replaces the section when you run it twice.
- **Use it how you like**: a CLI, a typed library (ESM and CommonJS), and a
  composite GitHub Action. It reads `git log` itself, or commits from a
  file or stdin as JSON, `git log` output or one line per commit.

## Contents

- [Install](#install)
- [60-second quick start](#60-second-quick-start)
- [How the version is chosen](#how-the-version-is-chosen)
- [CLI](#cli)
- [GitHub Action](#github-action)
- [Configuration](#configuration)
- [Library API](#library-api)
- [Commit parsing details](#commit-parsing-details)
- [Examples](#examples)
- [FAQ](#faq)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Install

The package is published to GitHub Packages as `@saizul/release-notes-gen`.
Tell npm where the `@saizul` scope lives (once per project or in
`~/.npmrc`):

```console
$ echo "@saizul:registry=https://npm.pkg.github.com" >> .npmrc
$ npm install --save-dev @saizul/release-notes-gen
```

GitHub Packages needs a token with `read:packages` even for public
packages; see [Authenticating to GitHub Packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-to-github-packages).
The GitHub Action needs no install at all.

Node 20 or newer and `git` on the `PATH` (only when reading from git).

## 60-second quick start

```console
$ npx release-notes-gen                  # preview: next version + notes since the latest tag
$ npx release-notes-gen --version-only   # just "1.3.0"
$ npx release-notes-gen --write          # prepend the notes to CHANGELOG.md
$ git tag v$(npx release-notes-gen --version-only)
```

No tags yet? The version in `package.json` (or `0.0.0`) is the starting
point and the whole history is used. Use `--release-as 1.0.0` to pick the
first version yourself.

## How the version is chosen

1. **The range** is `--from..--to`. Without `--from` it starts at the
   newest stable version tag reachable from `--to` (or the newest tag of
   any kind with `--prerelease`).
2. **The current version** is `--current`, or the version of an explicit
   `--from` tag, or the newest reachable version tag, then `package.json`,
   then `0.0.0`.
3. **The release type** is the largest bump any commit asks for:

   | Commit | Bump |
   | --- | --- |
   | `feat!: ...`, `fix(api)!: ...`, or a `BREAKING CHANGE:` footer | major (minor on `0.x`, see `preMajor`) |
   | `feat: ...` | minor |
   | `fix: ...`, `perf: ...`, `revert: ...`, `deps: ...` | patch |
   | `docs`, `chore`, `refactor`, `test`, `ci`, `build`, `style`, anything else | none |

   If nothing asks for a bump, there is no release: the CLI says so and
   exits with code 0 (`released=false` in the Action).
4. **Pre-releases.** A pre-release already covers the bump it was made
   for:

   | Current | Commits | `--prerelease rc` | stable |
   | --- | --- | --- | --- |
   | `1.2.0` | feat | `1.3.0-rc.0` | `1.3.0` |
   | `1.3.0-rc.0` | fix | `1.3.0-rc.1` | `1.3.0` |
   | `1.3.0-rc.1` | feat | `1.3.0-rc.2` | `1.3.0` |
   | `1.3.0-rc.1` | breaking | `2.0.0-rc.0` | `2.0.0` |
   | `1.3.0-beta.4` | fix | `1.3.0-rc.0` | `1.3.0` |

   When you graduate, the notes cover everything since the last stable
   tag, not only since the last release candidate.

## CLI

```text
release-notes-gen [options] [-- <path>...]
```

| Option | Description |
| --- | --- |
| `--from <ref>` | Start after this ref (default: the latest version tag) |
| `--to <ref>` | End at this ref (default: `HEAD`). If it is a version tag, that release is regenerated |
| `--current <version>` | The version to bump from |
| `--release-as <x>` | Force `major`, `minor`, `patch` or an exact version |
| `--prerelease [id]` | Make a pre-release (id default `rc`) |
| `--tag-prefix <prefix>` | Prefix of version tags (default `v`; use `''` for bare versions) |
| `--path <path>` | Only commits touching this path; repeatable, or list paths after `--` |
| `--input <file\|->` | Read commits from a file or stdin instead of git |
| `--cwd <dir>` | Run in this directory |
| `--write`, `-w` | Prepend the notes to the changelog |
| `--changelog <file>` | Changelog path (default `CHANGELOG.md`) |
| `--json` | Print the release as JSON (version, tag, notes, commits) |
| `--version-only` | Print only the next version (nothing if there is no release) |
| `--github-output <file>` | Append `released`, `version`, `tag`, `previous-version`, `previous-tag`, `release-type` and `notes` in GitHub Actions output format |
| `--date <YYYY-MM-DD>` | Date in the heading (default today, UTC) |
| `--no-date` | Leave the date out |
| `--repo-url <url>` | Repository URL for links (default: the `origin` remote) |
| `--host <name>` | `github`, `gitlab` or `none` (default: detected from the URL) |
| `--include-merges` | Read headers from merge commit bodies, following first parents only |
| `--show-authors` | Credit the author after each entry |
| `--config <file>` | Configuration file (default `.release-notes.json` if it exists) |
| `--help`, `-h` / `--version`, `-v` | Help and version |

Exit codes: `0` success (including "no release needed"), `1` runtime
error (for example git failed), `2` bad options or configuration.

### Input formats for `--input`

Detected automatically:

```console
$ git log v1.2.0..HEAD | release-notes-gen --input - --current 1.2.0        # default git log output
$ git log --oneline v1.2.0..HEAD | release-notes-gen --input - --from v1.2.0  # "<hash> <header>" lines
$ git log --format=%B%x00 v1.2.0..HEAD | release-notes-gen --input -          # NUL-separated messages
$ release-notes-gen --input commits.json --current 2.4.1                       # JSON
```

JSON is an array of messages or `{ "hash", "message", "parents", "author", "date" }`
objects (`sha`/`id` and `subject`/`body` are accepted too), or
`{ "commits": [...] }`, which covers the GitHub API's push event payload
shape after a small `jq` step. With `--input`, `--from` is used for the
compare link and, if it is a version, as the current version.

## GitHub Action

```yaml
name: Release
on:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # tags and history are needed

      - id: notes
        uses: saizul/release-notes-gen@v0.1.0
        with:
          write: 'true'

      - if: steps.notes.outputs.released == 'true'
        env:
          GH_TOKEN: ${{ github.token }}
          TAG: ${{ steps.notes.outputs.tag }}
          NOTES: ${{ steps.notes.outputs.notes }}
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git commit -am "chore(release): $TAG"
          git tag "$TAG"
          git push --follow-tags
          gh release create "$TAG" --title "$TAG" --notes "$NOTES"
```

| Input | Default | Description |
| --- | --- | --- |
| `from` | latest version tag | Start after this ref |
| `to` | `HEAD` | End at this ref |
| `write` | `false` | Prepend the notes to the changelog |
| `changelog` | `CHANGELOG.md` | Changelog path |
| `prerelease` | | Pre-release identifier such as `beta` |
| `release-as` | | `major`, `minor`, `patch` or a version |
| `tag-prefix` | `v` | Prefix of version tags |
| `config` | | Configuration file |
| `path` | | Only commits touching this path |
| `include-merges` | `false` | Read headers from merge commit bodies |
| `working-directory` | `.` | Directory of the repository |

Outputs: `released` (`true`/`false`), `version`, `tag`, `previous-version`,
`previous-tag`, `release-type` and `notes`.

The Action is a composite action: it builds the CLI from its own source with
the runner's Node (20 or newer, preinstalled on GitHub-hosted runners) and
runs it. Inputs are passed through environment variables, never
interpolated into the script.

## Configuration

Put a `.release-notes.json` next to your `.git` folder (or pass
`--config`). Every key is optional:

```json
{
  "sections": [
    { "type": "feat", "title": "Features" },
    { "type": ["fix", "perf"], "title": "Fixes and performance" },
    { "type": "docs", "title": "Documentation" },
    { "type": ["chore", "ci", "build"], "title": "Maintenance", "hidden": true }
  ],
  "bumps": { "docs": "patch", "perf": null },
  "breakingTitle": "BREAKING CHANGES",
  "tagPrefix": "v",
  "repoUrl": "https://github.com/acme/rocket",
  "host": "github",
  "preMajor": true,
  "includeMerges": false,
  "otherTitle": "Other changes",
  "showAuthors": false,
  "changelogHeader": "# Changelog"
}
```

| Key | Default | Description |
| --- | --- | --- |
| `sections` | Features, Bug Fixes, Performance, Reverts, Dependencies (shown); Documentation, Refactoring, Styles, Tests, Build System, Continuous Integration, Chores (hidden) | Order, titles and visibility. Replaces the default list. Breaking changes always show |
| `bumps` | `feat: minor`, `fix`/`perf`/`revert`/`deps`: patch | Merged with the defaults; `null` means "no release for this type" |
| `breakingTitle` | `BREAKING CHANGES` | Title of the breaking changes section |
| `tagPrefix` | `v` | Prefix of version tags |
| `repoUrl` | the `origin` remote | Repository web URL for links |
| `host` | detected | `github`, `gitlab` or `none` (self-hosted GitLab needs `"gitlab"` if its host name does not contain "gitlab") |
| `preMajor` | `true` | On `0.x`, breaking changes bump the minor version |
| `includeMerges` | `false` | Use the Conventional Commits header in merge commit bodies (for merge-commit workflows); reads `git log --first-parent` |
| `otherTitle` | `null` | Show commits that are not Conventional Commits under this title |
| `showAuthors` | `false` | Add `, by Author` to each entry |
| `changelogHeader` | `# Changelog` and a short intro | Text at the top of a new changelog |

Unknown keys are an error, so typos do not go unnoticed.

## Library API

```ts
import { generate, parseCommit, bumpVersion, prependToChangelog } from '@saizul/release-notes-gen';
import { readCommits, listVersionTags } from '@saizul/release-notes-gen/git';

const [latest] = listVersionTags();
const release = generate({
  commits: readCommits({ from: latest?.name }),
  currentVersion: latest?.version ?? '0.0.0',
  previousTag: latest?.name ?? null,
  config: { repoUrl: 'https://github.com/acme/rocket' },
});

release.version; // '1.3.0' or null
release.releaseType; // 'minor'
release.notes; // the Markdown section
```

Main entry (no Node built-ins, works in any runtime):

| Export | Description |
| --- | --- |
| `generate(options)` | The whole pipeline: commits in, `{ version, tag, previousVersion, previousTag, releaseType, notes, commits, included, grouped }` out |
| `parseCommit(raw)` / `parseCommits(list)` | Parse one message (string or `{ hash, message, parents, author, date }`) into a `Commit` |
| `findReferences(text)` | `#12`, `GH-12`, `owner/repo#12` and `!12` references with closing keywords |
| `releaseTypeFor(commits, config, major?)` | `major`, `minor`, `patch` or `null` |
| `prepareCommits(raw, config)` | `parseCommits` plus merge-body handling for `includeMerges` |
| `filterCommits(commits)` | Drop merges, fixups, revert pairs and duplicates |
| `groupCommits(commits, config)` | `{ breaking, groups }` in section order |
| `renderNotes(grouped, options)` | The Markdown section |
| `linkifyReferences(text, linker)` | Turn references into Markdown links, skipping code spans |
| `prependToChangelog(existing, section, version, header?)` | The updated changelog text |
| `parseSemver`, `formatSemver`, `compareSemver`, `bumpVersion`, `maxReleaseType` | Semantic Versioning 2.0.0 helpers |
| `parseRepoUrl(remote, host?)` / `createLinker(repo)` | Remote URL to web URL, and link builders for GitHub and GitLab |
| `parseCommitInput(text)` | Read the `--input` formats |
| `defaultConfig()`, `resolveConfig(partial)`, `DEFAULT_SECTIONS`, `DEFAULT_BUMPS`, `DEFAULT_CHANGELOG_HEADER` | Configuration |
| `ReleaseError`, `ConfigError`, `InputError` | Error classes |
| `VERSION` | The package version |

`@saizul/release-notes-gen/git` (Node only): `readCommits({ cwd, from, to, firstParent, paths })`,
`listVersionTags({ cwd, tagPrefix, mergedInto, includePrerelease })`,
`remoteUrl(cwd, remote?)`, `refExists(ref, cwd)`, `git(args, cwd)` and
`GitError`.

All types (`Commit`, `RawCommit`, `Config`, `Release`, `Reference`, ...)
are exported.

## Commit parsing details

The parser follows the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
specification and is lenient where real repositories are messy:

- **Header**: `type(scope)!: subject`. The type is case-insensitive and
  stored lower-cased; the scope may contain `,`, `/`, `@` and spaces; a
  missing space after the colon is accepted; an empty scope `()` is
  ignored.
- **Footers** are the trailing paragraphs that each start with
  `Token: value` or `Token #value`. Values can span several lines. A
  `Note: ...` paragraph followed by normal text stays in the body.
- **Breaking changes**: `!` in the header, a `BREAKING CHANGE:` or
  `BREAKING-CHANGE:` footer (any case), or a `BREAKING CHANGE:` line in the
  body. The note text is shown in the breaking section; with only `!` the
  subject is used. Commits that are not conventional never count as
  breaking.
- **Reverts**: `Revert "feat: x"` with `This reverts commit <sha>.` (git's
  default) and `revert: feat: x` with the hash in the body or a
  `Refs:`/`Reverts:` footer. If the reverted commit is in the same range,
  both disappear from the notes; otherwise the revert is listed under
  Reverts.
- **Merges**: `Merge pull request #12 from ...` (GitHub),
  `Merge branch 'x' into 'main'` with `See merge request group/project!42`
  (GitLab), `Merge branch ...`, `Merge remote-tracking branch ...`,
  Bitbucket and Azure DevOps styles, and any commit with two parents are
  skipped by default. With `includeMerges` the first conventional line of
  the body is used and the PR number is kept.
- **Pull requests**: a trailing `(#123)` (GitHub squash merges) or
  `See merge request ...!42` becomes the entry's PR link and is removed
  from the subject.
- **Issues**: references in the subject are linked in place; references
  with a closing keyword (`close`, `closes`, `closed`, `fix`, `fixes`,
  `fixed`, `resolve`, `resolves`, `resolved`) anywhere in the message are
  listed as `closes #12, #13`. Lists like `Fixes #1, #2 and #3` work.
  References inside URLs, words (`issue#1`) and code spans are ignored.
- **Skipped**: `fixup!`, `squash!` and `amend!` commits, empty messages,
  and duplicates (same type, scope and subject, e.g. cherry-picks).

The test suite has a [table of parser vectors](test/parse.test.ts);
adding a case there is the easiest way to report a parsing bug.

## Examples

- [`examples/library.mjs`](examples/library.mjs): `generate()` on an
  array of messages, no git needed.
- [`examples/commonjs.cjs`](examples/commonjs.cjs): the `require()` build.
- [`examples/commits.json`](examples/commits.json) and
  [`examples/release-notes.json`](examples/release-notes.json): an input
  file and a configuration file:

```console
$ npx release-notes-gen --input examples/commits.json --current 1.4.2 \
    --config examples/release-notes.json --repo-url https://github.com/acme/rocket
```

- [`examples/release.yml`](examples/release.yml): a complete release
  workflow using the Action.

## FAQ

**How is this different from semantic-release or release-please?** It
does one thing: compute the version and write the notes. It does not
publish packages, push tags or open pull requests, so it fits into any
release process (npm, PyPI, Docker, a WordPress zip, ...) and you stay in
control of the last step. It has no dependencies, so it installs in a
second.

**My notes are empty in GitHub Actions.** `actions/checkout` fetches one
commit without tags by default. Use `fetch-depth: 0`. The Action prints a
warning for shallow clones.

**We squash-merge pull requests.** That is the best case: the PR title
becomes the commit header and `(#123)` becomes the PR link. Make sure PR
titles follow Conventional Commits.

**We use merge commits.** By default merge commits are skipped and the
individual commits of each branch are used. If your branch commits are not
conventional but your PR titles are, use `--include-merges`.

**Can I use it in a monorepo?** Use `--path packages/foo` and a tag
prefix such as `--tag-prefix foo-v` per package.

**Does it change my git repository?** No. It only reads (`git log`,
`git tag`, `git remote`); `--write` changes only the changelog file.

**Are remote credentials safe?** Remote URLs like
`https://x-access-token:...@github.com/o/r.git` are reduced to
`https://github.com/o/r` before they are used for links.

## Roadmap

Ideas, several of them good first issues (see
[CONTRIBUTING.md](CONTRIBUTING.md#good-first-issues)):

- Bitbucket and Gitea/Forgejo link styles.
- A `--format` option for other output (plain text for Slack, JSON only
  for the notes).
- Read the configuration from a `release-notes` key in `package.json`.
- `--since-date` as an alternative to `--from`.
- Credit first-time contributors.
- Emoji or gitmoji prefixes in headers (`✨ feat: ...`).

## Contributing

Bug reports with real-world commit messages are especially valuable. See
[CONTRIBUTING.md](CONTRIBUTING.md) for setup, the check commands and a list
of beginner-friendly issues. Please follow the
[code of conduct](CODE_OF_CONDUCT.md), and report security problems
privately as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Saizul Amin
