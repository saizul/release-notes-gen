# Security policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Use GitHub's
private vulnerability reporting ("Report a vulnerability" under the
repository's **Security** tab). You will get an answer within a week.

## Scope

release-notes-gen reads commit messages, which anyone who can open a pull
request controls, and it often runs in CI with a write token nearby.
Reports in these areas are especially welcome:

- **Command injection.** git is always called with an argument list,
  never through a shell, and the GitHub Action passes inputs through
  environment variables. A way to run a command through a ref name, a tag,
  an input or a commit message is a serious bug.
- **Output injection.** A commit message that breaks out of the
  `--github-output` heredoc (to set other step outputs), or that injects
  links or HTML that the notes should not contain.
- **Credential leaks.** Remote URLs with tokens are reduced to the plain
  repository URL before they are used. If a token can end up in the notes,
  the changelog or the JSON output, please report it.
- **Denial of service.** A commit message that makes the parser take more
  than a fraction of a second.

## What release-notes-gen is not

It does not sanitize Markdown. Commit subjects are copied into the notes as
written, so a malicious commit can add Markdown to your changelog. Review
the generated notes before you publish them, as you would review the
commits themselves.
