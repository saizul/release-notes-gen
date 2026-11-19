# Contributing

Thanks for helping improve release-notes-gen. Real-world commit messages
that parse wrongly, new forge link styles, documentation and fixes are all
welcome. If you are new to open source, start with one of the
[beginner issues](#good-first-issues) below; each is small and comes with
pointers to the files involved.

## Reporting a bug

Open an issue with:

- the commit message(s) that misbehave, exactly as in `git log --format=%B`
  (remove anything private)
- the command you ran and the output you got
- what you expected
- your release-notes-gen, Node and git versions

A parsing bug is easiest to fix as a new row in the `VECTORS` table in
`test/parse.test.ts`, so feel free to open a pull request with just the
failing vector.

## Development setup

You need Node 20 or newer and git.

```console
$ git clone https://github.com/saizul/release-notes-gen.git
$ cd release-notes-gen
$ npm ci
$ npm test              # builds ESM + CJS, compiles the tests and runs node:test
$ npm run lint          # biome lint + tsc --noEmit
$ npm run format        # biome format --write
$ npm run format:check  # what CI runs
```

Try the CLI on this repository or any other:

```console
$ node dist/esm/cli.js --cwd ../some-project
$ node dist/esm/cli.js --input examples/commits.json --current 1.4.2
```

## Guidelines

- **Zero runtime dependencies.** Development tools go in `devDependencies`.
- **Only `src/git.ts` and `src/cli/` may use Node built-ins.** The main
  entry must keep working in any runtime; a test checks the build.
- **git is called with argument arrays**, never through a shell.
- **Tests pin exact output.** Notes are compared as whole strings. Tests
  that need a repository create one with `TempRepo` in `test/helpers.ts`
  (fixed identity, fixed dates, no signing, no global config); they never
  use the network.
- **Lenient in, strict out.** Accept the commit messages people really
  write, but keep the generated Markdown predictable.
- Every change comes with a test and a line in the `Unreleased` section of
  `CHANGELOG.md`. New CLI options need a row in the README table (a test
  checks this).

## Project layout

```text
src/
  parse.ts       commit parser and findReferences()
  semver.ts      parse, compare and bump versions
  generate.ts    the pipeline: commits -> version -> notes
  group.ts       filtering (merges, reverts, duplicates) and sections
  render.ts      Markdown output and reference links
  links.ts       remote URL parsing, GitHub and GitLab link builders
  changelog.ts   prependToChangelog()
  config.ts      defaults and resolveConfig()
  input.ts       --input formats
  git.ts         git log / git tag helpers (Node only)
  cli/           argument parsing and the CLI
action.yml       the composite GitHub Action
test/            node:test suites; helpers.ts has TempRepo and cli()
examples/        runnable examples, an input file, a config and a workflow
```

## Good first issues

These are deliberately small. Each one lists where to start.

1. **Bitbucket links**: add `bitbucket` to `HostKind` in `src/types.ts`
   and a branch in `createLinker()` in `src/links.ts`
   (`/commits/<sha>`, `/pull-requests/<n>`, `/issues/<n>`,
   `/branches/compare/<to>%0D<from>`). Tests go in `test/links.test.ts`.
2. **Read config from `package.json`**: if there is no
   `.release-notes.json`, use the `"release-notes"` key of `package.json`.
   Change `loadConfig()` in `src/cli/run.ts` and add a CLI test.
3. **`--quiet`**: suppress the "Wrote ..." and "No release needed" messages
   on stderr. `src/cli/args.ts` and `src/cli/run.ts`.
4. **Gitmoji headers**: accept `✨ feat: add x` and `:sparkles: feat: add x`
   by stripping a leading emoji before matching the header in
   `src/parse.ts`. Add vectors to `test/parse.test.ts`.
5. **`--since <date>`**: start the range at a date instead of a ref
   (`git log --since`). `readCommits()` in `src/git.ts` and the CLI.
6. **Count in the "No release needed" message per type**, e.g. "3 docs,
   1 chore". `run()` in `src/cli/run.ts`.
7. **More parser vectors**: collect tricky messages from popular
   repositories (multi-paragraph breaking changes, unusual trailers) and add
   them to `VECTORS`, fixing the parser where needed.
8. **Docs: a GitLab CI example** next to `examples/release.yml`, using
   `--input` or the CLI directly in a `.gitlab-ci.yml` job.

## Pull requests

Keep them focused: one fix or feature per pull request, with a
Conventional Commits title (this project uses itself for its changelog).
Describe what changed and how you tested it; the template has a short
checklist. CI runs lint, format check and the tests on Node 20 and 22
on Linux, Node 22 on Windows and macOS, and the Action itself.
