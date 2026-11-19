import type { ReleaseType } from './types.js';

/** A parsed semantic version. */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  /** Pre-release identifiers, e.g. `['beta', 2]` for `-beta.2`. */
  prerelease: (string | number)[];
  /** Build metadata identifiers (ignored for ordering). */
  build: string[];
}

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/**
 * Parses `1.2.3`, `1.2.3-beta.1+build.5` and the same with a leading `v`
 * (or another `prefix`). Returns `null` for anything else.
 */
export function parseSemver(text: string, prefix = 'v'): SemVer | null {
  let input = text.trim();
  if (prefix && input.startsWith(prefix)) input = input.slice(prefix.length);
  else if (input.startsWith('v')) input = input.slice(1);
  const match = SEMVER.exec(input);
  if (!match) return null;
  const [, major, minor, patch, pre, build] = match;
  const nums = [Number(major), Number(minor), Number(patch)];
  if (!nums.every(Number.isSafeInteger)) return null;
  return {
    major: nums[0]!,
    minor: nums[1]!,
    patch: nums[2]!,
    prerelease: pre ? pre.split('.').map((id) => (/^\d+$/.test(id) ? Number(id) : id)) : [],
    build: build ? build.split('.') : [],
  };
}

/** Formats a version without a prefix: `1.2.3-beta.1+build.5`. */
export function formatSemver(v: SemVer): string {
  let out = `${v.major}.${v.minor}.${v.patch}`;
  if (v.prerelease.length > 0) out += `-${v.prerelease.join('.')}`;
  if (v.build.length > 0) out += `+${v.build.join('.')}`;
  return out;
}

function toSemver(v: string | SemVer): SemVer {
  if (typeof v !== 'string') return v;
  const parsed = parseSemver(v);
  if (!parsed) throw new TypeError(`Not a semantic version: "${v}"`);
  return parsed;
}

/** Semantic Versioning 2.0.0 precedence: negative, zero or positive. */
export function compareSemver(a: string | SemVer, b: string | SemVer): number {
  const x = toSemver(a);
  const y = toSemver(b);
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (x[key] !== y[key]) return x[key] - y[key];
  }
  if (x.prerelease.length === 0 || y.prerelease.length === 0) {
    return y.prerelease.length - x.prerelease.length;
  }
  const len = Math.max(x.prerelease.length, y.prerelease.length);
  for (let i = 0; i < len; i++) {
    const p = x.prerelease[i];
    const q = y.prerelease[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    if (typeof p === 'number' && typeof q === 'number') return p - q;
    if (typeof p === 'number') return -1;
    if (typeof q === 'number') return 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

const RANK: Record<ReleaseType, number> = { patch: 1, minor: 2, major: 3 };

/** The larger of two release types (`null` means no release). */
export function maxReleaseType(a: ReleaseType | null, b: ReleaseType | null): ReleaseType | null {
  if (a === null) return b;
  if (b === null) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

export interface BumpOptions {
  /**
   * Make a pre-release with this identifier, e.g. `beta` gives
   * `1.3.0-beta.0`, then `1.3.0-beta.1`. `false` or omitted makes a normal
   * release (and graduates a current pre-release).
   */
  prerelease?: string | false;
}

/**
 * The next version after `current` for a release of type `type`.
 *
 * A current pre-release already "contains" the bump it was made for:
 * `1.3.0-beta.2` plus a patch or minor change gives `1.3.0-beta.3` (or
 * `1.3.0` without `prerelease`), while a breaking change gives
 * `2.0.0-beta.0` (or `2.0.0`).
 */
export function bumpVersion(current: string | SemVer, type: ReleaseType, options: BumpOptions = {}): string {
  const v = toSemver(current);
  const pre = options.prerelease;
  const base = { major: v.major, minor: v.minor, patch: v.patch };
  const isPre = v.prerelease.length > 0;

  // The level the current pre-release is already a release candidate for.
  const covered: ReleaseType | null = !isPre
    ? null
    : v.patch === 0 && v.minor === 0
      ? 'major'
      : v.patch === 0
        ? 'minor'
        : 'patch';

  let next = base;
  if (!(covered && RANK[type] <= RANK[covered])) {
    if (type === 'major') next = { major: v.major + 1, minor: 0, patch: 0 };
    else if (type === 'minor') next = { major: v.major, minor: v.minor + 1, patch: 0 };
    else next = { major: v.major, minor: v.minor, patch: v.patch + 1 };
  }

  const core = `${next.major}.${next.minor}.${next.patch}`;
  if (!pre) return core;

  const sameBase = next.major === v.major && next.minor === v.minor && next.patch === v.patch;
  if (sameBase && isPre && v.prerelease[0] === pre) {
    const last = v.prerelease[v.prerelease.length - 1];
    const ids =
      typeof last === 'number' && v.prerelease.length > 1
        ? [...v.prerelease.slice(0, -1), last + 1]
        : [...v.prerelease, 0];
    return `${core}-${ids.join('.')}`;
  }
  return `${core}-${pre}.0`;
}
