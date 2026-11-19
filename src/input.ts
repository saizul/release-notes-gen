import type { RawCommit } from './types.js';

/** Thrown when commit input from a file or stdin cannot be read. */
export class InputError extends Error {
  override readonly name = 'InputError';
}

const GIT_LOG_COMMIT = /^commit ([0-9a-f]{7,40})\b/;
const ONELINE = /^([0-9a-f]{7,40}) (.+)$/;

/**
 * Reads commits from text in one of these formats (detected automatically):
 *
 * - JSON: an array of messages or `{ hash, message, parents?, author?, date? }`
 *   objects, or `{ "commits": [...] }`.
 * - The default `git log` output (`commit <hash>`, headers, indented message).
 * - Messages separated by NUL bytes, e.g. `git log --format=%B%x00`.
 * - One header per line, optionally starting with a hash
 *   (`git log --oneline`, `git log --format=%s`).
 */
export function parseCommitInput(text: string): RawCommit[] {
  const input = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const trimmed = input.trim();
  if (trimmed === '') return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return fromJson(trimmed);
  if (GIT_LOG_COMMIT.test(trimmed)) return fromGitLog(trimmed);
  if (input.includes('\u0000')) {
    return input
      .split('\u0000')
      .map((m) => m.trim())
      .filter((m) => m !== '')
      .map((message) => ({ message }));
  }
  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const m = ONELINE.exec(line);
      return m ? { hash: m[1]!, message: m[2]! } : { message: line };
    });
}

function fromJson(text: string): RawCommit[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new InputError(`The input looks like JSON but does not parse: ${(e as Error).message}`);
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && 'commits' in data) {
    data = (data as { commits: unknown }).commits;
  }
  if (!Array.isArray(data)) throw new InputError('JSON input must be an array of commits');
  return data.map((item, i) => {
    if (typeof item === 'string') return { message: item };
    if (!item || typeof item !== 'object') throw new InputError(`Commit ${i} must be a string or an object`);
    const o = item as Record<string, unknown>;
    const message = o.message ?? o.body ?? o.subject;
    if (typeof message !== 'string') throw new InputError(`Commit ${i} has no "message" string`);
    const commit: RawCommit = { message };
    const hash = o.hash ?? o.sha ?? o.id;
    if (typeof hash === 'string') commit.hash = hash;
    if (Array.isArray(o.parents)) {
      commit.parents = o.parents.map((p) =>
        typeof p === 'string' ? p : String((p as { sha?: unknown })?.sha ?? ''),
      );
    }
    if (typeof o.author === 'string') commit.author = o.author;
    if (typeof o.date === 'string') commit.date = o.date;
    return commit;
  });
}

function fromGitLog(text: string): RawCommit[] {
  const commits: RawCommit[] = [];
  let current: { hash: string; parents?: string[]; author?: string; date?: string; lines: string[] } | null =
    null;
  let inMessage = false;
  const flush = () => {
    if (current) {
      const commit: RawCommit = { hash: current.hash, message: current.lines.join('\n').trim() };
      if (current.parents) commit.parents = current.parents;
      if (current.author) commit.author = current.author;
      if (current.date) commit.date = current.date;
      commits.push(commit);
    }
  };
  for (const line of text.split('\n')) {
    const start = GIT_LOG_COMMIT.exec(line);
    if (start && !line.startsWith(' ')) {
      flush();
      current = { hash: start[1]!, lines: [] };
      inMessage = false;
      continue;
    }
    if (!current) continue;
    if (!inMessage) {
      if (line.trim() === '') {
        inMessage = true;
        continue;
      }
      const merge = /^Merge:\s+(.+)$/.exec(line);
      if (merge) current.parents = merge[1]!.trim().split(/\s+/);
      const author = /^Author:\s+(.+?)(?:\s+<[^>]*>)?$/.exec(line);
      if (author) current.author = author[1]!;
      const date = /^(?:Author)?Date:\s+(.+)$/.exec(line);
      if (date) current.date = date[1]!.trim();
      continue;
    }
    current.lines.push(line.startsWith('    ') ? line.slice(4) : line);
  }
  flush();
  return commits;
}
