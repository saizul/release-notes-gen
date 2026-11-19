import type { HostKind, Reference } from './types.js';

/** A repository's web location, detected from a remote URL. */
export interface RepoInfo {
  /** `github`, `gitlab`, or `none` when the forge is not recognised. */
  host: HostKind;
  /** E.g. `https://github.com/owner/repo`. Never contains credentials. */
  url: string;
  /** E.g. `https://github.com`. */
  origin: string;
  /** E.g. `owner/repo` or `group/subgroup/project`. */
  path: string;
}

/**
 * Turns a git remote (`git@github.com:o/r.git`, `https://user:token@...`,
 * `ssh://git@host:2222/group/project.git`) or a web URL into the
 * repository's web URL. Returns `null` for local paths and unknown forms.
 */
export function parseRepoUrl(remote: string, host: HostKind | null = null): RepoInfo | null {
  let text = remote.trim().replace(/^git\+/, '');
  if (text === '' || /^[./\\~]/.test(text) || /^[a-z]:[\\/]/i.test(text)) return null;

  let hostname: string;
  let path: string;
  let scheme = 'https:';
  const scp = /^(?:[\w.-]+@)?([\w.-]+):(?!\/\/)(?!\d+\/)(.+)$/.exec(text);
  if (scp && !/^[a-z]+:\/\//i.test(text)) {
    hostname = scp[1]!;
    path = scp[2]!;
  } else {
    if (!/^[a-z][a-z+.-]*:\/\//i.test(text)) text = `https://${text}`;
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      return null;
    }
    if (!['http:', 'https:', 'ssh:', 'git:'].includes(url.protocol)) return null;
    if (url.protocol === 'http:') scheme = 'http:';
    hostname = url.hostname;
    path = decodeURIComponent(url.pathname);
  }
  path = path
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/, '')
    .replace(/\/-\/.*$/, '');
  if (!hostname || hostname.length < 2 || !path.includes('/')) return null;

  const kind = host ?? (/github/i.test(hostname) ? 'github' : /gitlab/i.test(hostname) ? 'gitlab' : 'none');
  const origin = `${scheme}//${hostname}`;
  return { host: kind, url: `${origin}/${path}`, origin, path };
}

/** Builds web links for one repository. */
export interface Linker {
  commit(hash: string): string | null;
  /** A `#n` / `!n` reference, possibly to another repository. */
  reference(ref: Pick<Reference, 'prefix' | 'number' | 'repository'>): string | null;
  /** The pull request or merge request a commit came from. */
  pullRequest(number: number): string | null;
  compare(from: string, to: string): string | null;
  /** How pull or merge requests are written: `#` on GitHub, `!` on GitLab. */
  readonly prPrefix: '#' | '!';
}

const NO_LINKS: Linker = {
  commit: () => null,
  reference: () => null,
  pullRequest: () => null,
  compare: () => null,
  prPrefix: '#',
};

/** A `Linker` for GitHub or GitLab, or one that returns `null` for everything. */
export function createLinker(repo: RepoInfo | null): Linker {
  if (!repo || repo.host === 'none') return NO_LINKS;
  const enc = (s: string) => s.split('/').map(encodeURIComponent).join('/');
  if (repo.host === 'github') {
    return {
      commit: (hash) => `${repo.url}/commit/${hash}`,
      reference: ({ prefix, number, repository }) =>
        prefix === '!'
          ? null
          : `${repository ? `${repo.origin}/${enc(repository)}` : repo.url}/issues/${number}`,
      pullRequest: (number) => `${repo.url}/pull/${number}`,
      compare: (from, to) => `${repo.url}/compare/${enc(from)}...${enc(to)}`,
      prPrefix: '#',
    };
  }
  return {
    commit: (hash) => `${repo.url}/-/commit/${hash}`,
    reference: ({ prefix, number, repository }) =>
      `${repository ? `${repo.origin}/${enc(repository)}` : repo.url}/-/${prefix === '!' ? 'merge_requests' : 'issues'}/${number}`,
    pullRequest: (number) => `${repo.url}/-/merge_requests/${number}`,
    compare: (from, to) => `${repo.url}/-/compare/${enc(from)}...${enc(to)}`,
    prPrefix: '!',
  };
}
