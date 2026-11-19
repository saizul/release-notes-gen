import { DEFAULT_CHANGELOG_HEADER } from './config.js';

const RELEASE_HEADING = /^##(?!#)\s/;
const UNRELEASED = /^##\s+\[?unreleased\]?/i;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Inserts a release section into a changelog.
 *
 * - An empty or missing changelog gets `header` and the section.
 * - The section goes above the newest release, after an `## [Unreleased]`
 *   section if there is one, and after any intro text.
 * - If a section for the same version already exists it is replaced, so
 *   running the tool twice does not duplicate entries.
 * - Link definitions at the bottom (Keep a Changelog style) are untouched.
 */
export function prependToChangelog(
  existing: string | null | undefined,
  section: string,
  version: string,
  header: string = DEFAULT_CHANGELOG_HEADER,
): string {
  const block = section.trim();
  const text = (existing ?? '').replace(/\r\n?/g, '\n');
  if (text.trim() === '') return `${header.trim()}\n\n${block}\n`;

  const lines = text.split('\n');
  const sameVersion = new RegExp(`^##\\s+\\[?v?${escapeRegExp(version)}\\]?(?:[\\s(]|$)`);
  const isHeading = (line: string) => RELEASE_HEADING.test(line);

  let fence = false;
  const headings: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (!fence && isHeading(line)) headings.push(i);
  }
  const endOf = (start: number) => headings.find((h) => h > start) ?? trailingLinksStart(lines, start);

  const existingIndex = headings.find((h) => sameVersion.test(lines[h]!));
  if (existingIndex !== undefined) {
    const end = endOf(existingIndex);
    const replaced = [...lines.slice(0, existingIndex), ...block.split('\n'), '', ...lines.slice(end)];
    return `${replaced
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()}\n`;
  }

  let insertAt = headings[0];
  if (insertAt !== undefined && UNRELEASED.test(lines[insertAt]!)) insertAt = endOf(insertAt);
  if (insertAt === undefined) insertAt = trailingLinksStart(lines, 0);

  const before = lines.slice(0, insertAt).join('\n').trimEnd();
  const after = lines.slice(insertAt).join('\n').trim();
  return `${[before, block, after].filter((part) => part !== '').join('\n\n')}\n`;
}

/** The index where trailing `[label]: url` link definitions start (or the end). */
function trailingLinksStart(lines: string[], from: number): number {
  let i = lines.length;
  while (i > from && (lines[i - 1]!.trim() === '' || /^\[[^\]]+\]:\s*\S+/.test(lines[i - 1]!))) i--;
  // Only treat them as link definitions if there is at least one.
  const hasLinks = lines.slice(i).some((l) => /^\[[^\]]+\]:\s*\S+/.test(l));
  return hasLinks ? i : lines.length;
}
