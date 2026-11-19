import { findReferences } from './parse.js';
import type { Linker } from './links.js';
import type { GroupedCommits } from './group.js';
import type { Commit, Config } from './types.js';

export interface RenderOptions {
  /** The new version, without the tag prefix. */
  version: string;
  /** The new tag, e.g. `v1.3.0`. Used for the compare link. */
  tag: string;
  /** The previous tag, or `null` for the first release. */
  previousTag: string | null;
  /** `YYYY-MM-DD`, or `null` to leave the date out. */
  date: string | null;
  config: Config;
  linker: Linker;
}

const link = (text: string, url: string | null) => (url ? `[${text}](${url})` : text);

/** Replaces `#12`, `owner/repo#12` and `!12` with links, leaving code spans alone. */
export function linkifyReferences(text: string, linker: Linker): string {
  return text
    .split(/(`[^`]*`)/)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      let out = '';
      let last = 0;
      for (const ref of findReferences(part)) {
        // findReferences dedupes, so find every occurrence of this ref.
        let index = part.indexOf(ref.raw, last);
        while (index !== -1) {
          const before = index === 0 ? '' : part[index - 1]!;
          const after = part[index + ref.raw.length] ?? '';
          const url = linker.reference(ref);
          if (url && (before === '' || /[\s(,[:]/.test(before)) && !/[\w-]/.test(after)) {
            out += part.slice(last, index) + link(ref.raw, url);
            last = index + ref.raw.length;
          }
          index = part.indexOf(ref.raw, index + ref.raw.length);
        }
      }
      return out + part.slice(last);
    })
    .join('');
}

function suffixes(commit: Commit, linker: Linker, full: boolean, showAuthors: boolean): string {
  let out = '';
  if (commit.pr !== null)
    out += ` (${link(`${linker.prPrefix}${commit.pr}`, linker.pullRequest(commit.pr))})`;
  if (commit.shortHash) out += ` (${link(commit.shortHash, linker.commit(commit.hash))})`;
  const closes = full ? commit.references.filter((r) => r.action !== null) : [];
  if (closes.length > 0) {
    out += `, closes ${closes.map((r) => link(r.raw.replace(/^GH-/, '#'), linker.reference(r))).join(', ')}`;
  }
  if (showAuthors && commit.author) out += `, by ${commit.author}`;
  return out;
}

function bullet(text: string, scope: string | null): string {
  const [first = '', ...rest] = text.split('\n');
  const head = `- ${scope ? `**${scope}:** ` : ''}${first}`;
  return [head, ...rest.map((line) => (line.trim() === '' ? '' : `  ${line}`))].join('\n');
}

/**
 * Renders one changelog section in Markdown: a `## version` heading, the
 * breaking changes, then one `###` list per section.
 */
export function renderNotes(grouped: GroupedCommits, options: RenderOptions): string {
  const { linker, config } = options;
  const compare = options.previousTag ? linker.compare(options.previousTag, options.tag) : null;
  const date = options.date ? ` (${options.date})` : '';
  const lines: string[] = [`## ${link(options.version, compare)}${date}`];

  if (grouped.breaking.length > 0) {
    lines.push('', `### ${config.breakingTitle}`, '');
    for (const commit of grouped.breaking) {
      for (const note of commit.breakingNotes) {
        lines.push(
          bullet(linkifyReferences(note, linker), commit.scope) + suffixes(commit, linker, false, false),
        );
      }
    }
  }

  for (const group of grouped.groups) {
    lines.push('', `### ${group.title}`, '');
    for (const commit of group.commits) {
      lines.push(
        bullet(linkifyReferences(commit.subject, linker), commit.scope) +
          suffixes(commit, linker, true, config.showAuthors),
      );
    }
  }

  if (grouped.breaking.length === 0 && grouped.groups.length === 0) lines.push('', 'No notable changes.');
  return `${lines.join('\n')}\n`;
}
