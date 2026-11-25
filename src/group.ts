import type { Commit, Config } from './types.js';

/** A titled list of commits in the notes. */
export interface Group {
  title: string;
  commits: Commit[];
}

/** The commits of a release, sorted into the configured sections. */
export interface GroupedCommits {
  breaking: Commit[];
  groups: Group[];
}

const hashMatches = (a: string, b: string) =>
  a.length >= 7 && b.length >= 7 && (a.startsWith(b) || b.startsWith(a));

/**
 * Drops ignored commits (merges, fixups, empty messages), pairs of a commit
 * and its revert when both are in the range, and duplicate entries such as
 * cherry-picks with the same type, scope and subject.
 */
export function filterCommits(commits: Commit[]): Commit[] {
  const kept = commits.filter((c) => c.ignored === null);
  const dropped = new Set<Commit>();

  for (const revert of kept) {
    if (!revert.revert || dropped.has(revert)) continue;
    const target = kept.find(
      (c) =>
        c !== revert &&
        !dropped.has(c) &&
        (revert.revert!.hash && c.hash
          ? hashMatches(c.hash, revert.revert!.hash)
          : revert.revert!.header !== null && c.header === revert.revert!.header),
    );
    if (target) {
      dropped.add(revert);
      dropped.add(target);
    }
  }

  const seen = new Set<string>();
  return kept.filter((c) => {
    if (dropped.has(c)) return false;
    const key = `${c.type}\u0000${c.scope}\u0000${c.subject}\u0000${c.breaking}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Stable sort: unscoped entries first, then by scope. */
function byScope(a: Commit, b: Commit): number {
  if (a.scope === b.scope) return 0;
  if (a.scope === null) return -1;
  if (b.scope === null) return 1;
  return a.scope.localeCompare(b.scope, 'en');
}

/**
 * Sorts filtered commits into the breaking section and the configured sections.
 * Commits with a scope in `config.excludeScopes` only appear under breaking changes.
 */
export function groupCommits(commits: Commit[], config: Config): GroupedCommits {
  const all = filterCommits(commits);
  const breaking = all.filter((c) => c.breaking).sort(byScope);
  const excluded = new Set((config.excludeScopes ?? []).map((s) => s.toLowerCase()));
  const filtered =
    excluded.size === 0 ? all : all.filter((c) => c.scope === null || !excluded.has(c.scope.toLowerCase()));
  const groups: Group[] = [];
  const placed = new Set<Commit>();

  for (const section of config.sections) {
    const types = (Array.isArray(section.type) ? section.type : [section.type]).map((t) => t.toLowerCase());
    const members = filtered.filter(
      (c) => c.type !== null && c.conventional !== false && types.includes(c.type),
    );
    for (const c of members) placed.add(c);
    if (section.hidden || members.length === 0) continue;
    const existing = groups.find((g) => g.title === section.title);
    if (existing) existing.commits.push(...members);
    else groups.push({ title: section.title, commits: members });
  }
  // git's own `Revert "..."` commits are not conventional but have type revert.
  const revertSection = config.sections.find((s) =>
    (Array.isArray(s.type) ? s.type : [s.type]).map((t) => t.toLowerCase()).includes('revert'),
  );
  const gitReverts = filtered.filter((c) => !c.conventional && c.revert && !placed.has(c));
  if (revertSection && !revertSection.hidden && gitReverts.length > 0) {
    for (const c of gitReverts) placed.add(c);
    const existing = groups.find((g) => g.title === revertSection.title);
    if (existing) existing.commits.push(...gitReverts);
    else groups.push({ title: revertSection.title, commits: gitReverts });
  }

  if (config.otherTitle) {
    const other = filtered.filter((c) => !c.conventional && !placed.has(c));
    if (other.length > 0) groups.push({ title: config.otherTitle, commits: other });
  }
  for (const g of groups) g.commits.sort(byScope);
  return { breaking, groups };
}
