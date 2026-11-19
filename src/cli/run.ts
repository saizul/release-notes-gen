import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { prependToChangelog } from '../changelog.js';
import { ConfigError, resolveConfig } from '../config.js';
import { type Release, generate } from '../generate.js';
import { listVersionTags, readCommits, refExists, remoteUrl } from '../git.js';
import { parseCommitInput } from '../input.js';
import { parseSemver } from '../semver.js';
import type { Config, RawCommit } from '../types.js';
import { VERSION } from '../version.js';
import { type CliOptions, HELP, UsageError, parseArgs } from './args.js';

export interface CliIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  /** Working directory. Default `process.cwd()`. */
  cwd?: string;
  /** Reads all of stdin (only called for `--input -`). */
  readStdin?: () => Promise<string>;
  /** Clock, for the default date. */
  now?: () => Date;
}

const DEFAULT_CONFIG_FILE = '.release-notes.json';

function readJson(path: string, what: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    throw new UsageError(`Cannot read ${what} ${path}: ${(e as Error).message}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new UsageError(`${what} ${path} is not valid JSON: ${(e as Error).message}`);
  }
}

function loadConfig(o: CliOptions, cwd: string): Config {
  let fileConfig: unknown = {};
  if (o.config) fileConfig = readJson(resolve(cwd, o.config), 'config file');
  else if (existsSync(join(cwd, DEFAULT_CONFIG_FILE)))
    fileConfig = readJson(join(cwd, DEFAULT_CONFIG_FILE), 'config file');
  const config = resolveConfig(fileConfig);
  if (o.tagPrefix !== undefined) config.tagPrefix = o.tagPrefix;
  if (o.repoUrl !== undefined) config.repoUrl = o.repoUrl;
  if (o.host !== undefined) config.host = o.host as Config['host'];
  if (o.includeMerges) config.includeMerges = true;
  if (o.showAuthors) config.showAuthors = true;
  return config;
}

function packageVersion(cwd: string): string | null {
  const path = join(cwd, 'package.json');
  if (!existsSync(path)) return null;
  try {
    const version = (JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }).version;
    return typeof version === 'string' && parseSemver(version, '') ? version : null;
  } catch {
    return null;
  }
}

interface Plan {
  commits: RawCommit[];
  currentVersion: string;
  previousTag: string | null;
  releaseAs: string | null;
}

function planFromGit(o: CliOptions, cwd: string, config: Config): Plan {
  const to = o.to ?? 'HEAD';
  const prefix = config.tagPrefix;
  if (o.to && !refExists(o.to, cwd)) throw new UsageError(`--to: unknown git ref "${o.to}"`);
  if (o.from && !refExists(o.from, cwd)) throw new UsageError(`--from: unknown git ref "${o.from}"`);

  let tags: ReturnType<typeof listVersionTags> = [];
  if (refExists(to, cwd)) tags = listVersionTags({ cwd, tagPrefix: prefix, mergedInto: to });

  // When --to is itself a version tag, we are (re)generating that release.
  let releaseAs: string | null = o.releaseAs ?? null;
  let candidates = tags;
  if (o.to && !releaseAs) {
    const own = tags.find((t) => t.name === o.to);
    if (own) {
      releaseAs = own.version;
      candidates = tags.filter((t) => t !== own);
    }
  }

  let from = o.from ?? null;
  if (from === null) {
    const pool = o.prerelease
      ? candidates
      : candidates.filter((t) => parseSemver(t.version, '')!.prerelease.length === 0);
    from = pool[0]?.name ?? null;
  }

  let current = o.current ?? null;
  if (current === null) {
    const fromVersion =
      from?.startsWith(prefix) && parseSemver(from.slice(prefix.length), '')
        ? from.slice(prefix.length)
        : null;
    // An explicit --from that is a version tag is the version we bump from.
    // Otherwise use the newest reachable tag, which may be a pre-release
    // newer than the latest stable tag (so 1.3.0-rc.2 graduates to 1.3.0).
    current =
      (o.from ? fromVersion : null) ??
      candidates[0]?.version ??
      fromVersion ??
      packageVersion(cwd) ??
      '0.0.0';
  }

  const commits = readCommits({ cwd, from, to, firstParent: config.includeMerges, paths: o.paths });
  return { commits, currentVersion: current, previousTag: from, releaseAs };
}

function writeGithubOutput(path: string, release: Release): void {
  const delimiter = `ghadelimiter_${randomUUID()}`;
  const lines = [
    `released=${release.version ? 'true' : 'false'}`,
    `version=${release.version ?? ''}`,
    `tag=${release.tag ?? ''}`,
    `previous-version=${release.previousVersion}`,
    `previous-tag=${release.previousTag ?? ''}`,
    `release-type=${release.releaseType ?? ''}`,
    `notes<<${delimiter}`,
    release.notes.trimEnd(),
    delimiter,
  ];
  appendFileSync(path, `${lines.join('\n')}\n`);
}

function toJson(release: Release) {
  return {
    version: release.version,
    tag: release.tag,
    previousVersion: release.previousVersion,
    previousTag: release.previousTag,
    releaseType: release.releaseType,
    notes: release.notes,
    commits: release.included.map((c) => ({
      hash: c.hash,
      type: c.type,
      scope: c.scope,
      subject: c.subject,
      breaking: c.breaking,
      breakingNotes: c.breakingNotes,
      pr: c.pr,
      references: c.references,
    })),
    skipped: release.commits.filter((c) => c.ignored !== null).length,
  };
}

/** Runs the CLI. Resolves to the exit code: 0 success, 1 failure, 2 usage error. */
export async function run(argv: string[], io: CliIO): Promise<number> {
  try {
    const o = parseArgs(argv);
    if (o.help) {
      io.stdout(HELP);
      return 0;
    }
    if (o.version) {
      io.stdout(`${VERSION}\n`);
      return 0;
    }
    const baseCwd = io.cwd ?? process.cwd();
    const cwd = o.cwd ? resolve(baseCwd, o.cwd) : baseCwd;
    const config = loadConfig(o, cwd);

    let plan: Plan;
    if (o.input !== undefined) {
      let text: string;
      if (o.input === '-') {
        if (!io.readStdin) throw new UsageError('Reading from stdin is not available');
        text = await io.readStdin();
      } else {
        const path = isAbsolute(o.input) ? o.input : resolve(cwd, o.input);
        try {
          text = readFileSync(path, 'utf8');
        } catch (e) {
          throw new UsageError(`Cannot read --input ${o.input}: ${(e as Error).message}`);
        }
      }
      plan = {
        commits: parseCommitInput(text),
        currentVersion: o.current ?? (o.from ? o.from : null) ?? packageVersion(cwd) ?? '0.0.0',
        previousTag: o.from ?? null,
        releaseAs: o.releaseAs ?? null,
      };
      if (!parseSemver(plan.currentVersion, config.tagPrefix)) {
        throw new UsageError(`Cannot tell the current version from "${plan.currentVersion}"; pass --current`);
      }
    } else {
      plan = planFromGit(o, cwd, config);
    }

    if (config.repoUrl === null && config.host !== 'none') {
      try {
        config.repoUrl = remoteUrl(cwd);
      } catch {
        // not a git repository: no links
      }
    }

    let date: string | null | Date = o.noDate ? null : (o.date ?? (io.now ? io.now() : new Date()));
    if (typeof date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new UsageError(`--date must look like 2026-11-19, got "${date}"`);
    }
    if (date instanceof Date) date = date.toISOString().slice(0, 10);

    const release = generate({
      commits: plan.commits,
      currentVersion: plan.currentVersion,
      previousTag: plan.previousTag,
      releaseAs: plan.releaseAs,
      prerelease: o.prerelease ?? false,
      date,
      config,
    });

    if (o.githubOutput) writeGithubOutput(resolve(cwd, o.githubOutput), release);

    if (o.json) io.stdout(`${JSON.stringify(toJson(release), null, 2)}\n`);
    else if (o.versionOnly) {
      if (release.version) io.stdout(`${release.version}\n`);
    } else if (release.version) io.stdout(release.notes);

    if (!release.version) {
      const since = plan.previousTag ? ` since ${plan.previousTag}` : '';
      const n = release.included.length;
      io.stderr(
        `No release needed: ${n === 0 ? 'there are no commits' : `none of the ${n} commit${n === 1 ? '' : 's'}`}${since} ${n === 0 ? 'to release' : 'is a feature, fix or breaking change'}.\n`,
      );
      return 0;
    }

    if (o.write) {
      const path = resolve(cwd, o.changelog ?? 'CHANGELOG.md');
      const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
      writeFileSync(
        path,
        prependToChangelog(existing, release.notes, release.version, config.changelogHeader),
      );
      io.stderr(`Wrote ${release.version} to ${o.changelog ?? 'CHANGELOG.md'}\n`);
    }
    return 0;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    io.stderr(`release-notes-gen: ${message}\n`);
    return e instanceof UsageError || e instanceof ConfigError ? 2 : 1;
  }
}
