/** A commit as it comes from `git log`, a JSON file or stdin. */
export interface RawCommit {
  /** Full or abbreviated commit hash. Optional for messages from stdin. */
  hash?: string;
  /** The full commit message: header, body and footers. */
  message: string;
  /** Parent hashes. More than one parent marks a merge commit. */
  parents?: string[];
  author?: string;
  /** ISO 8601 author date. */
  date?: string;
}

/** A `Token: value` or `Token #value` trailer at the end of a message. */
export interface Footer {
  token: string;
  value: string;
}

/** An issue, pull request or merge request mentioned in a commit. */
export interface Reference {
  /** `#` for issues and GitHub PRs, `!` for GitLab merge requests. */
  prefix: '#' | '!';
  number: number;
  /** `owner/repo` (or `group/sub/project`) for cross-repository references. */
  repository: string | null;
  /** `closes`, `fixes` or `resolves` when the commit closes it, otherwise `null`. */
  action: 'closes' | 'fixes' | 'resolves' | null;
  /** The text as written, e.g. `#12` or `owner/repo#12`. */
  raw: string;
}

/** Why a commit is left out of the release notes. */
export type IgnoreReason = 'merge' | 'fixup' | 'empty';

/** A parsed commit. */
export interface Commit {
  hash: string;
  shortHash: string;
  /** The first line of the message. */
  header: string;
  /** Lower-cased Conventional Commits type, or `null` if the header is not conventional. */
  type: string | null;
  scope: string | null;
  /** The description after `type(scope): `, or the whole header for other commits. */
  subject: string;
  body: string;
  footers: Footer[];
  /** `true` for `type!:` headers and `BREAKING CHANGE:` footers. */
  breaking: boolean;
  /** Text of every breaking change note. */
  breakingNotes: string[];
  /** `true` if the header follows the Conventional Commits format. */
  conventional: boolean;
  /** Set for `revert:` commits and git's `Revert "..."` commits. */
  revert: { header: string | null; hash: string | null } | null;
  /** Set for merge commits. */
  merge: { pr: number | null; source: string | null } | null;
  /** The pull or merge request this commit came from, e.g. from a `(#123)` suffix. */
  pr: number | null;
  references: Reference[];
  /** Set when the commit is skipped in the notes. */
  ignored: IgnoreReason | null;
  author: string | null;
  date: string | null;
}

export type ReleaseType = 'major' | 'minor' | 'patch';

/** One group in the release notes. */
export interface SectionConfig {
  /** One type or several, e.g. `['build', 'ci']`. */
  type: string | string[];
  title: string;
  /** Hidden sections are left out of the notes (breaking changes still show). */
  hidden?: boolean;
}

/** Which forge to build links for. */
export type HostKind = 'github' | 'gitlab' | 'none';

export interface Config {
  /** Section order, titles and visibility. */
  sections: SectionConfig[];
  /** Title of the breaking changes section. */
  breakingTitle: string;
  /** Prefix of version tags. Default `v`. */
  tagPrefix: string;
  /** Web URL of the repository, used for links. Detected from the `origin` remote by the CLI. */
  repoUrl: string | null;
  /** Forge to build links for. Detected from `repoUrl` when `null`. */
  host: HostKind | null;
  /** Which version part each type bumps. Types not listed do not cause a release. */
  bumps: Record<string, ReleaseType | null>;
  /** While the major version is 0, breaking changes bump the minor version. Default `true`. */
  preMajor: boolean;
  /** Read Conventional Commits headers from merge commit bodies instead of skipping merges. */
  includeMerges: boolean;
  /** Put commits that are not Conventional Commits under this title (`null` hides them). */
  otherTitle: string | null;
  /**
   * Scopes whose commits are left out of the notes sections, e.g. `["deps-dev", "release"]`.
   * Matched case-insensitively. Breaking changes still show and every commit still counts
   * for the version bump.
   */
  excludeScopes: string[];
  /** Add `by @author`-style credit (`author` field) after each entry. */
  showAuthors: boolean;
  /** Text written at the top of a new changelog file. */
  changelogHeader: string;
}
