# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-19

### Added

- Conventional Commits parser: types, scopes, `!`, multi-line footers,
  `BREAKING CHANGE` in footers and body, git and conventional reverts,
  GitHub/GitLab/Bitbucket/Azure DevOps merge commits, `fixup!` and
  `squash!` commits, `(#123)` squash-merge suffixes, issue references with
  closing keywords, and CRLF messages.
- Next version from the commits, with `preMajor` handling for `0.x`,
  pre-releases (`--prerelease`), graduation from pre-releases and
  `--release-as`.
- Markdown release notes grouped into configurable sections, with
  commit, pull request, merge request, issue and compare links for GitHub
  and GitLab.
- `CHANGELOG.md` updates that keep the intro, an `Unreleased` section and
  link definitions, and replace a section that already exists.
- The `release-notes-gen` CLI: git ranges, `--path`, `--input` from a file
  or stdin (JSON, `git log` output, NUL-separated or one line per commit),
  `--json`, `--version-only`, `--github-output` and `.release-notes.json`.
- A composite GitHub Action with `version`, `tag`, `notes` and more as
  outputs.
- Library API with ESM and CommonJS builds and type declarations; git
  helpers in `@saizul/release-notes-gen/git`. No runtime dependencies.

[Unreleased]: https://github.com/saizul/release-notes-gen/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/saizul/release-notes-gen/releases/tag/v0.1.0
