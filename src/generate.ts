import { resolveConfig } from './config.js';
import { type GroupedCommits, filterCommits, groupCommits } from './group.js';
import { createLinker, parseRepoUrl } from './links.js';
import { parseCommit } from './parse.js';
import { renderNotes } from './render.js';
import { bumpVersion, formatSemver, maxReleaseType, parseSemver } from './semver.js';
import type { Commit, Config, RawCommit, ReleaseType } from './types.js';

export interface GenerateOptions {
  /** Commits in the release, newest first (the order of `git log`). */
  commits: Iterable<RawCommit | string>;
  /** The version being released from, e.g. the latest tag. Default `0.0.0`. */
  currentVersion?: string | null;
  /** The tag the range starts at, for the compare link. */
  previousTag?: string | null;
  /** Force `major`, `minor` or `patch`, or an exact version such as `2.0.0`. */
  releaseAs?: string | null;
  /** Make a pre-release with this identifier (`beta`, `rc`, ...). */
  prerelease?: string | false | null;
  /** `YYYY-MM-DD` or a `Date` for the heading. Default today (UTC); `null` leaves it out. */
  date?: string | Date | null;
  /** Configuration; missing keys use the defaults. */
  config?: Partial<Config>;
}

export interface Release {
  /** The next version, or `null` when no commit calls for a release. */
  version: string | null;
  previousVersion: string;
  /** The next tag, e.g. `v1.3.0`, or `null`. */
  tag: string | null;
  previousTag: string | null;
  releaseType: ReleaseType | null;
  /** The Markdown section, or an empty string when there is no release. */
  notes: string;
  /** Every parsed commit, including skipped ones (see `ignored`). */
  commits: Commit[];
  /** The commits that count for this release after filtering. */
  included: Commit[];
  grouped: GroupedCommits;
}

/** Thrown for invalid versions and options. */
export class ReleaseError extends Error {
  override readonly name = 'ReleaseError';
}

/**
 * The release type the commits call for: `major` for breaking changes,
 * otherwise the largest entry of `config.bumps` (`feat` is `minor`, `fix`
 * and `perf` are `patch` by default), or `null`. With `preMajor` and a
 * `0.x` version, a breaking change is `minor`.
 */
export function releaseTypeFor(commits: Commit[], config: Config, currentMajor = 1): ReleaseType | null {
  let type: ReleaseType | null = null;
  for (const commit of filterCommits(commits)) {
    if (commit.breaking) {
      type = maxReleaseType(type, config.preMajor && currentMajor === 0 ? 'minor' : 'major');
      continue;
    }
    const key = commit.type ?? '';
    const bump = Object.hasOwn(config.bumps, key) ? config.bumps[key]! : null;
    type = maxReleaseType(type, bump);
  }
  return type;
}

/** Parses commits and, with `includeMerges`, reads the header from merge commit bodies. */
export function prepareCommits(inputs: Iterable<RawCommit | string>, config: Config): Commit[] {
  const out: Commit[] = [];
  for (const input of inputs) {
    const commit = parseCommit(input);
    if (config.includeMerges && commit.merge) {
      const raw: RawCommit = typeof input === 'string' ? { message: input } : input;
      const lines = raw.message.replace(/\r\n?/g, '\n').split('\n');
      const start = lines.findIndex((line, i) => i > 0 && parseCommit(line).conventional);
      if (start > 0) {
        const inner = parseCommit({ ...raw, parents: [], message: lines.slice(start).join('\n') });
        if (inner.pr === null) inner.pr = commit.merge.pr;
        out.push(inner);
        continue;
      }
    }
    out.push(commit);
  }
  return out;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date: string | Date | null | undefined): string | null {
  if (date === null) return null;
  if (date === undefined) return today();
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) throw new ReleaseError('Invalid date');
    return date.toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new ReleaseError(`The date must look like 2026-11-19, got "${date}"`);
  return date;
}

/**
 * The whole pipeline without git: parse commits, decide the next version
 * and render the Markdown section.
 */
export function generate(options: GenerateOptions): Release {
  const config = resolveConfig(options.config ?? {});
  const prefix = config.tagPrefix;
  const currentText = options.currentVersion ?? '0.0.0';
  const current = parseSemver(currentText, prefix);
  if (!current) throw new ReleaseError(`The current version "${currentText}" is not a semantic version`);
  const previousVersion = formatSemver({ ...current, build: [] });
  const prerelease = options.prerelease || false;
  if (prerelease && !/^[0-9A-Za-z-]+$/.test(prerelease)) {
    throw new ReleaseError(
      `The pre-release identifier "${prerelease}" may only contain letters, digits and "-"`,
    );
  }

  const commits = prepareCommits(options.commits, config);
  const grouped = groupCommits(commits, config);
  const included = filterCommits(commits);

  let releaseType: ReleaseType | null;
  let version: string | null;
  const releaseAs = options.releaseAs?.trim() || null;
  if (releaseAs && ['major', 'minor', 'patch'].includes(releaseAs)) {
    releaseType = releaseAs as ReleaseType;
    version = bumpVersion(current, releaseType, { prerelease });
  } else if (releaseAs) {
    const exact = parseSemver(releaseAs, prefix);
    if (!exact)
      throw new ReleaseError(`--release-as must be major, minor, patch or a version, got "${releaseAs}"`);
    version = formatSemver(exact);
    releaseType = exact.major !== current.major ? 'major' : exact.minor !== current.minor ? 'minor' : 'patch';
  } else {
    releaseType = releaseTypeFor(commits, config, current.major);
    version = releaseType ? bumpVersion(current, releaseType, { prerelease }) : null;
  }

  if (version === null) {
    return {
      version: null,
      previousVersion,
      tag: null,
      previousTag: options.previousTag ?? null,
      releaseType: null,
      notes: '',
      commits,
      included,
      grouped,
    };
  }

  const tag = `${prefix}${version}`;
  const repo = config.repoUrl ? parseRepoUrl(config.repoUrl, config.host) : null;
  const linker = createLinker(config.host === 'none' ? null : repo);
  const notes = renderNotes(grouped, {
    version,
    tag,
    previousTag: options.previousTag ?? null,
    date: formatDate(options.date),
    config,
    linker,
  });
  return {
    version,
    previousVersion,
    tag,
    previousTag: options.previousTag ?? null,
    releaseType,
    notes,
    commits,
    included,
    grouped,
  };
}
