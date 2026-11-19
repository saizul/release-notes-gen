import { execFileSync } from 'node:child_process';
import { compareSemver, parseSemver } from './semver.js';
import type { RawCommit } from './types.js';

/** Thrown when a git command fails, with git's own message. */
export class GitError extends Error {
  override readonly name = 'GitError';
}

/** Runs git and returns stdout. */
export function git(args: string[], cwd = process.cwd()): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
    });
  } catch (e) {
    const err = e as { stderr?: string | Buffer; code?: string; message: string };
    if (err.code === 'ENOENT') throw new GitError('git is not installed or not on PATH');
    const stderr = String(err.stderr ?? '').trim();
    throw new GitError(stderr || err.message);
  }
}

export interface TagInfo {
  name: string;
  version: string;
}

export interface TagOptions {
  cwd?: string;
  /** Prefix of version tags. Default `v`. */
  tagPrefix?: string;
  /** Only tags reachable from this ref. Default `HEAD`. */
  mergedInto?: string;
  /** Include pre-release tags such as `v1.3.0-rc.1`. Default `true`. */
  includePrerelease?: boolean;
}

/** Version tags, newest version first. Tags that are not semantic versions are skipped. */
export function listVersionTags(options: TagOptions = {}): TagInfo[] {
  const prefix = options.tagPrefix ?? 'v';
  const args = ['tag', '--list'];
  if (options.mergedInto !== '') args.push('--merged', options.mergedInto ?? 'HEAD');
  const out = git(args, options.cwd);
  const tags: TagInfo[] = [];
  for (const name of out.split('\n').map((t) => t.trim())) {
    if (name === '' || !name.startsWith(prefix)) continue;
    const v = parseSemver(name.slice(prefix.length), '');
    if (!v || v.build.length > 0) continue;
    if (options.includePrerelease === false && v.prerelease.length > 0) continue;
    tags.push({ name, version: name.slice(prefix.length) });
  }
  return tags.sort((a, b) => compareSemver(b.version, a.version));
}

export interface ReadCommitsOptions {
  cwd?: string;
  /** Exclusive start, e.g. the previous tag. Omit for the whole history. */
  from?: string | null;
  /** Inclusive end. Default `HEAD`. */
  to?: string;
  /** Follow only the first parent of merges (`git log --first-parent`). */
  firstParent?: boolean;
  /** Only commits that touch these paths (for monorepos). */
  paths?: string[];
}

const FIELD = '\u001f';
const RECORD = '\u001e';

/** Reads commits from `git log`, newest first. */
export function readCommits(options: ReadCommitsOptions = {}): RawCommit[] {
  const to = options.to ?? 'HEAD';
  const range = options.from ? `${options.from}..${to}` : to;
  const args = ['log', `--format=%H${FIELD}%P${FIELD}%an${FIELD}%aI${FIELD}%B${RECORD}`];
  if (options.firstParent) args.push('--first-parent');
  args.push(range);
  if (options.paths && options.paths.length > 0) args.push('--', ...options.paths);
  // A repository without commits has no HEAD yet: nothing to read.
  if (!options.from && to === 'HEAD' && !refExists('HEAD', options.cwd)) return [];
  const out = git(args, options.cwd);
  const commits: RawCommit[] = [];
  for (const record of out.split(RECORD)) {
    const trimmed = record.replace(/^\n+/, '');
    if (trimmed === '') continue;
    const [hash = '', parents = '', author = '', date = '', ...message] = trimmed.split(FIELD);
    commits.push({
      hash,
      parents: parents.split(' ').filter(Boolean),
      author,
      date,
      message: message.join(FIELD),
    });
  }
  return commits;
}

/** The URL of a remote, or `null` if there is none. */
export function remoteUrl(cwd?: string, remote = 'origin'): string | null {
  try {
    return git(['remote', 'get-url', remote], cwd).trim() || null;
  } catch {
    return null;
  }
}

/** `true` if `ref` names a commit in the repository. */
export function refExists(ref: string, cwd?: string): boolean {
  try {
    git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
}
