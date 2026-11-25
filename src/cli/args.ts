/** Thrown for a bad command line. The CLI exits with code 2. */
export class UsageError extends Error {
  override readonly name = 'UsageError';
}

export interface CliOptions {
  from?: string;
  to?: string;
  cwd?: string;
  input?: string;
  current?: string;
  releaseAs?: string;
  prerelease?: string;
  tagPrefix?: string;
  repoUrl?: string;
  host?: string;
  date?: string;
  noDate: boolean;
  config?: string;
  changelog?: string;
  githubOutput?: string;
  paths: string[];
  excludeScopes: string[];
  write: boolean;
  json: boolean;
  versionOnly: boolean;
  includeMerges: boolean;
  showAuthors: boolean;
  help: boolean;
  version: boolean;
}

const VALUE_FLAGS: Record<string, keyof CliOptions> = {
  '--from': 'from',
  '--to': 'to',
  '--cwd': 'cwd',
  '--input': 'input',
  '--current': 'current',
  '--release-as': 'releaseAs',
  '--tag-prefix': 'tagPrefix',
  '--repo-url': 'repoUrl',
  '--host': 'host',
  '--date': 'date',
  '--config': 'config',
  '--changelog': 'changelog',
  '--github-output': 'githubOutput',
};

const BOOL_FLAGS: Record<string, keyof CliOptions> = {
  '--write': 'write',
  '-w': 'write',
  '--json': 'json',
  '--version-only': 'versionOnly',
  '--include-merges': 'includeMerges',
  '--show-authors': 'showAuthors',
  '--no-date': 'noDate',
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
};

export function parseArgs(argv: string[]): CliOptions {
  const o: CliOptions = {
    paths: [],
    excludeScopes: [],
    noDate: false,
    write: false,
    json: false,
    versionOnly: false,
    includeMerges: false,
    showAuthors: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') {
      o.paths.push(...argv.slice(i + 1));
      break;
    }
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = eq > 0 ? arg.slice(0, eq) : arg;
    const inline = eq > 0 ? arg.slice(eq + 1) : undefined;

    if (name === '--prerelease' || name === '--preid') {
      const next = argv[i + 1];
      if (inline !== undefined) o.prerelease = inline || 'rc';
      else if (next !== undefined && !next.startsWith('-')) {
        o.prerelease = next;
        i++;
      } else o.prerelease = 'rc';
      continue;
    }
    if (name === '--path') {
      const value = inline ?? argv[++i];
      if (value === undefined || value === '') throw new UsageError('--path needs a value');
      o.paths.push(value);
      continue;
    }
    if (name === '--exclude-scope') {
      const value = inline ?? argv[++i];
      if (value === undefined || value === '' || (inline === undefined && value.startsWith('-'))) {
        throw new UsageError('--exclude-scope needs a value');
      }
      o.excludeScopes.push(
        ...value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
      continue;
    }
    const valueKey = VALUE_FLAGS[name];
    if (valueKey) {
      const value = inline ?? argv[++i];
      if (value === undefined || (inline === undefined && value.startsWith('--'))) {
        throw new UsageError(`${name} needs a value`);
      }
      (o as unknown as Record<string, unknown>)[valueKey] = value;
      continue;
    }
    const boolKey = BOOL_FLAGS[name];
    if (boolKey && inline === undefined) {
      (o as unknown as Record<string, unknown>)[boolKey] = true;
      continue;
    }
    throw new UsageError(`Unknown option "${arg}". Run release-notes-gen --help for the list.`);
  }
  if (o.host !== undefined && !['github', 'gitlab', 'none'].includes(o.host)) {
    throw new UsageError('--host must be github, gitlab or none');
  }
  if (o.json && o.versionOnly) throw new UsageError('--json and --version-only cannot be used together');
  return o;
}

export const HELP = `Usage: release-notes-gen [options] [-- <path>...]

Turns Conventional Commits into the next semantic version and a Markdown
changelog section. Reads commits from git (since the latest version tag by
default) or from a file or stdin.

Range and version:
  --from <ref>           Start after this ref (default: the latest version tag)
  --to <ref>             End at this ref (default: HEAD)
  --current <version>    The version to bump from (default: from the tags,
                         then package.json, then 0.0.0)
  --release-as <x>       Force major, minor, patch or an exact version
  --prerelease [id]      Make a pre-release such as 1.3.0-rc.0 (id default: rc)
  --tag-prefix <prefix>  Prefix of version tags (default: v)
  --path <path>          Only commits touching this path (repeatable)

Input:
  --input <file|->       Read commits from a file or stdin (-) instead of git:
                         JSON, git log output, NUL-separated messages or one
                         header per line
  --cwd <dir>            Run in this directory (default: current directory)

Output:
  --write, -w            Prepend the notes to the changelog file
  --changelog <file>     Changelog path (default: CHANGELOG.md)
  --json                 Print the release as JSON
  --version-only         Print only the next version
  --github-output <file> Append version, tag, notes, ... as GitHub Actions outputs
  --date <YYYY-MM-DD>    Date for the heading (default: today, UTC)
  --no-date              Leave the date out of the heading

Links and grouping:
  --repo-url <url>       Repository URL for links (default: the origin remote)
  --host <name>          github, gitlab or none (default: detected)
  --include-merges       Read headers from merge commit bodies (first parent only)
  --show-authors         Credit authors after each entry
  --exclude-scope <s>    Leave commits with this scope out of the notes
                         (repeatable or comma-separated; breaking changes
                         still show)
  --config <file>        Configuration file (default: .release-notes.json if present)

  -h, --help             Show this help
  -v, --version          Show the version

Examples:
  release-notes-gen                               # preview the next release
  release-notes-gen --from v1.2.0 --write         # update CHANGELOG.md
  release-notes-gen --prerelease beta --json
  git log --oneline v1.2.0..HEAD | release-notes-gen --input - --current 1.2.0
`;
