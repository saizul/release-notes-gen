import type { Commit, Footer, RawCommit, Reference } from './types.js';

const HEADER = /^(?<type>[A-Za-z][\w-]*)(?:\((?<scope>[^()\n]*)\))?(?<bang>!)?:[ \t]*(?<subject>\S.*)$/;
const FOOTER_TOKEN = /^(?<token>BREAKING[ -]CHANGE|[A-Za-z][\w-]*)(?<sep>:[ \t]|[ \t]#)(?<value>.*)$/i;
const BREAKING_TOKEN = /^BREAKING[ -]CHANGE$/i;
const BODY_BREAKING = /^BREAKING[ -]CHANGES?:[ \t]*(?<text>.*)$/i;
const GIT_REVERT = /^Revert "(?<inner>.*)"$/;
const REVERTS_COMMIT = /\bThis reverts commit (?<hash>[0-9a-f]{7,40})\b/i;
const MERGE_PR = /^Merge pull request #(?<pr>\d+) from (?<source>\S+)/;
const MERGE_BRANCH = /^Merge (?:remote-tracking )?branch '(?<source>[^']+)'/;
const MERGE_GENERIC =
  /^(?:Merge (?:branch|tag|commit|remote-tracking branch|pull request|changes)\b|Merged in \S+|Merged PR \d+)/;
const GITLAB_MR = /\bSee merge request (?<repo>[\w./-]+)?!(?<mr>\d+)\b/;
const PR_SUFFIX = /\s*\((?:[\w.-]+\/[\w.-]+)?#(?<pr>\d+)\)$/;
const FIXUP = /^(?:fixup|squash|amend)! /;
const HASH_REF = /^[0-9a-f]{7,40}$/i;
const REFERENCE = /(?<=^|[\s(,[:])(?<repo>[\w.-]+(?:\/[\w.-]+)+)?(?<prefix>#|!|GH-)(?<num>\d+)\b(?![\w-])/g;
const ACTION_BEFORE = /\b(?<action>close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?\s*$/i;
const LIST_GLUE = /^\s*(?:,|and|&)?\s*(?:,|and|&)?\s*$/i;

const ACTIONS: Record<string, Reference['action']> = {
  close: 'closes',
  closes: 'closes',
  closed: 'closes',
  fix: 'fixes',
  fixes: 'fixes',
  fixed: 'fixes',
  resolve: 'resolves',
  resolves: 'resolves',
  resolved: 'resolves',
};

/** Parses one commit message. Accepts a `RawCommit` or just the message text. */
export function parseCommit(input: RawCommit | string): Commit {
  const raw: RawCommit = typeof input === 'string' ? { message: input } : input;
  const message = raw.message
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*\n/, '')
    .replace(/\s+$/, '');
  const lines = message.split('\n');
  const header = (lines[0] ?? '').trim();
  const rest = lines.slice(1);
  const hash = (raw.hash ?? '').trim();

  const commit: Commit = {
    hash,
    shortHash: hash.slice(0, 7),
    header,
    type: null,
    scope: null,
    subject: header,
    body: '',
    footers: [],
    breaking: false,
    breakingNotes: [],
    conventional: false,
    revert: null,
    merge: null,
    pr: null,
    references: [],
    ignored: null,
    author: raw.author ?? null,
    date: raw.date ?? null,
  };

  if (header === '') {
    commit.ignored = 'empty';
    return commit;
  }

  const { body, footers, footerText } = splitFooters(rest);
  commit.body = body;
  commit.footers = footers;

  const merge = parseMerge(header, message, (raw.parents?.length ?? 0) > 1);
  if (merge) {
    commit.merge = merge;
    commit.pr = merge.pr;
    commit.ignored = 'merge';
  } else if (FIXUP.test(header)) {
    commit.ignored = 'fixup';
  }

  applyHeader(commit, header);

  // Breaking changes from footers, then from body lines (some people write
  // "BREAKING CHANGE:" in the middle of the body).
  for (const footer of footers) {
    if (BREAKING_TOKEN.test(footer.token)) {
      commit.breaking = true;
      if (footer.value) commit.breakingNotes.push(footer.value);
    }
  }
  for (const note of bodyBreakingNotes(body)) {
    commit.breaking = true;
    commit.breakingNotes.push(note);
  }
  if (commit.breaking && commit.breakingNotes.length === 0) commit.breakingNotes.push(commit.subject);
  if (!commit.conventional && !commit.revert) {
    // Only conventional commits can be breaking; a stray "BREAKING CHANGE"
    // in a merge or a free-form commit should not force a major release.
    commit.breaking = false;
    commit.breakingNotes = [];
  }

  if (commit.revert && commit.revert.hash === null) {
    const hashFromBody = REVERTS_COMMIT.exec(message)?.groups?.hash;
    const refsFooter = footers.find((f) => /^(?:refs|reverts?)$/i.test(f.token) && HASH_REF.test(f.value));
    commit.revert.hash = hashFromBody ?? refsFooter?.value ?? null;
  }

  if (commit.pr === null) {
    const mr = GITLAB_MR.exec(message)?.groups?.mr;
    if (mr) commit.pr = Number(mr);
  }

  const prSuffix = commit.pr === null ? null : `#${commit.pr}`;
  commit.references = findReferences([commit.subject, body, footerText].join('\n')).filter(
    (ref) => !(ref.repository === null && `${ref.prefix}${ref.number}` === prSuffix && ref.action === null),
  );
  return commit;
}

/** Parses many commits; a convenience for `messages.map(parseCommit)`. */
export function parseCommits(inputs: Iterable<RawCommit | string>): Commit[] {
  return Array.from(inputs, (input) => parseCommit(input));
}

function applyHeader(commit: Commit, header: string): void {
  const gitRevert = GIT_REVERT.exec(header);
  if (gitRevert) {
    commit.type = 'revert';
    commit.subject = gitRevert.groups!.inner!;
    commit.revert = { header: gitRevert.groups!.inner!, hash: null };
    return;
  }
  // The header of a merge commit is "Merge ..."; with includeMerges the
  // generator re-parses the body, so stop here.
  if (commit.merge) return;

  const match = HEADER.exec(header);
  if (!match?.groups) return;
  const { type, scope, bang, subject } = match.groups;
  commit.conventional = true;
  commit.type = type!.toLowerCase();
  commit.scope = scope?.trim() ? scope.trim() : null;
  commit.breaking = bang === '!';

  let text = subject!.trim();
  const suffix = PR_SUFFIX.exec(text);
  if (suffix) {
    commit.pr = Number(suffix.groups!.pr);
    text = text.slice(0, suffix.index).trimEnd();
  }
  commit.subject = text;
  if (commit.type === 'revert') {
    const inner = GIT_REVERT.exec(text)?.groups?.inner ?? text;
    commit.revert = { header: inner, hash: null };
  }
}

function parseMerge(header: string, message: string, hasManyParents: boolean): Commit['merge'] {
  const pr = MERGE_PR.exec(header);
  if (pr) return { pr: Number(pr.groups!.pr), source: pr.groups!.source! };
  const branch = MERGE_BRANCH.exec(header);
  const mr = GITLAB_MR.exec(message)?.groups?.mr;
  if (branch) return { pr: mr ? Number(mr) : null, source: branch.groups!.source! };
  if (MERGE_GENERIC.test(header) || hasManyParents) return { pr: mr ? Number(mr) : null, source: null };
  return null;
}

/**
 * Splits the lines after the header into body and footers. The footer block
 * is the longest run of trailing paragraphs that each start with a
 * `Token: value` line, so a "Note: ..." paragraph in the middle of the body
 * stays in the body.
 */
function splitFooters(lines: string[]): { body: string; footers: Footer[]; footerText: string } {
  const paragraphs: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length > 0) paragraphs.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) paragraphs.push(current);

  let start = paragraphs.length;
  while (start > 0 && FOOTER_TOKEN.test(paragraphs[start - 1]![0]!)) start--;

  const body = paragraphs
    .slice(0, start)
    .map((p) => p.join('\n'))
    .join('\n\n');
  const footerLines = paragraphs.slice(start).flat();
  const footers: Footer[] = [];
  for (const line of footerLines) {
    const match = FOOTER_TOKEN.exec(line);
    if (match?.groups) {
      const sep = match.groups.sep!;
      const token = BREAKING_TOKEN.test(match.groups.token!) ? 'BREAKING CHANGE' : match.groups.token!;
      footers.push({
        token,
        value: (sep.trim() === '#' ? `#${match.groups.value}` : match.groups.value!).trim(),
      });
    } else if (footers.length > 0) {
      const last = footers[footers.length - 1]!;
      last.value = last.value ? `${last.value}\n${line.trim()}` : line.trim();
    }
  }
  return { body, footers, footerText: footerLines.join('\n') };
}

function bodyBreakingNotes(body: string): string[] {
  const notes: string[] = [];
  for (const paragraph of body.split('\n\n')) {
    const lines = paragraph.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const match = BODY_BREAKING.exec(lines[i]!.trim());
      if (match) {
        const text = [match.groups!.text!, ...lines.slice(i + 1).map((l) => l.trim())].join('\n').trim();
        if (text) notes.push(text);
        break;
      }
    }
  }
  return notes;
}

/**
 * Finds issue and pull request references such as `#12`, `GH-12`,
 * `owner/repo#12` and GitLab's `!12`, with the closing keyword if there is
 * one (`Fixes #1, #2 and #3` marks all three).
 */
export function findReferences(text: string): Reference[] {
  const refs: Reference[] = [];
  const seen = new Set<string>();
  let lastAction: Reference['action'] = null;
  let lastEnd = -1;
  for (const match of text.matchAll(REFERENCE)) {
    const index = match.index;
    const before = text.slice(Math.max(0, index - 40), index);
    const actionWord = ACTION_BEFORE.exec(before)?.groups?.action?.toLowerCase();
    let action: Reference['action'] = actionWord ? (ACTIONS[actionWord] ?? null) : null;
    if (!action && lastAction && lastEnd >= 0 && LIST_GLUE.test(text.slice(lastEnd, index)))
      action = lastAction;
    lastAction = action;
    lastEnd = index + match[0].length;

    const prefix = match.groups!.prefix === '!' ? '!' : '#';
    const repository = match.groups!.repo ?? null;
    const number = Number(match.groups!.num);
    const key = `${repository ?? ''}${prefix}${number}`;
    if (seen.has(key)) {
      if (action) {
        const existing = refs.find((r) => `${r.repository ?? ''}${r.prefix}${r.number}` === key);
        if (existing && !existing.action) existing.action = action;
      }
      continue;
    }
    seen.add(key);
    refs.push({ prefix, number, repository, action, raw: match[0] });
  }
  return refs;
}
