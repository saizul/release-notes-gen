import type { Config, ReleaseType, SectionConfig } from './types.js';

/** The default sections, in order. Hidden ones only show breaking changes. */
export const DEFAULT_SECTIONS: SectionConfig[] = [
  { type: 'feat', title: 'Features' },
  { type: 'fix', title: 'Bug Fixes' },
  { type: 'perf', title: 'Performance' },
  { type: 'revert', title: 'Reverts' },
  { type: 'deps', title: 'Dependencies' },
  { type: 'docs', title: 'Documentation', hidden: true },
  { type: 'refactor', title: 'Refactoring', hidden: true },
  { type: 'style', title: 'Styles', hidden: true },
  { type: 'test', title: 'Tests', hidden: true },
  { type: 'build', title: 'Build System', hidden: true },
  { type: 'ci', title: 'Continuous Integration', hidden: true },
  { type: 'chore', title: 'Chores', hidden: true },
];

/** Which version part each type bumps by default. */
export const DEFAULT_BUMPS: Record<string, ReleaseType | null> = {
  feat: 'minor',
  fix: 'patch',
  perf: 'patch',
  revert: 'patch',
  deps: 'patch',
};

export const DEFAULT_CHANGELOG_HEADER = `# Changelog

All notable changes to this project are documented in this file. This
project uses [Semantic Versioning](https://semver.org/) and
[Conventional Commits](https://www.conventionalcommits.org/).`;

/** The full default configuration. */
export function defaultConfig(): Config {
  return {
    sections: DEFAULT_SECTIONS.map((s) => ({ ...s })),
    breakingTitle: 'BREAKING CHANGES',
    tagPrefix: 'v',
    repoUrl: null,
    host: null,
    bumps: { ...DEFAULT_BUMPS },
    preMajor: true,
    includeMerges: false,
    otherTitle: null,
    excludeScopes: [],
    showAuthors: false,
    changelogHeader: DEFAULT_CHANGELOG_HEADER,
  };
}

/** Thrown for a configuration value with the wrong shape. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

const RELEASE_TYPES = new Set(['major', 'minor', 'patch']);
const HOSTS = new Set(['github', 'gitlab', 'none']);

/**
 * Merges a partial configuration (for example from `.release-notes.json`)
 * with the defaults and checks the types. `bumps` is merged key by key;
 * `sections` replaces the default list.
 */
export function resolveConfig(input: unknown = {}): Config {
  const config = defaultConfig();
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ConfigError('The configuration must be an object');
  }
  const o = input as Record<string, unknown>;
  const known = new Set(Object.keys(config));
  for (const key of Object.keys(o)) {
    if (key === '$schema') continue;
    if (!known.has(key)) throw new ConfigError(`Unknown configuration key "${key}"`);
  }

  if (o.sections !== undefined) {
    if (!Array.isArray(o.sections)) throw new ConfigError('"sections" must be an array');
    config.sections = o.sections.map((s, i) => {
      const where = `sections[${i}]`;
      if (s === null || typeof s !== 'object') throw new ConfigError(`${where} must be an object`);
      const { type, title, hidden } = s as Record<string, unknown>;
      const types = Array.isArray(type) ? type : [type];
      if (types.length === 0 || !types.every((t) => typeof t === 'string' && t !== '')) {
        throw new ConfigError(`${where}.type must be a type name or a list of them`);
      }
      if (typeof title !== 'string' || title === '') throw new ConfigError(`${where}.title must be a string`);
      if (hidden !== undefined && typeof hidden !== 'boolean')
        throw new ConfigError(`${where}.hidden must be true or false`);
      return { type: types.map((t) => (t as string).toLowerCase()), title, hidden: hidden === true };
    });
  }
  if (o.bumps !== undefined) {
    if (o.bumps === null || typeof o.bumps !== 'object' || Array.isArray(o.bumps)) {
      throw new ConfigError('"bumps" must be an object such as { "feat": "minor" }');
    }
    for (const [type, level] of Object.entries(o.bumps)) {
      if (level !== null && !RELEASE_TYPES.has(String(level))) {
        throw new ConfigError(`bumps.${type} must be "major", "minor", "patch" or null`);
      }
      config.bumps[type.toLowerCase()] = level as ReleaseType | null;
    }
  }
  for (const key of ['breakingTitle', 'tagPrefix', 'changelogHeader'] as const) {
    if (o[key] !== undefined) {
      if (typeof o[key] !== 'string') throw new ConfigError(`"${key}" must be a string`);
      config[key] = o[key];
    }
  }
  for (const key of ['repoUrl', 'otherTitle'] as const) {
    if (o[key] !== undefined) {
      if (o[key] !== null && typeof o[key] !== 'string')
        throw new ConfigError(`"${key}" must be a string or null`);
      config[key] = (o[key] as string | null) || null;
    }
  }
  for (const key of ['preMajor', 'includeMerges', 'showAuthors'] as const) {
    if (o[key] !== undefined) {
      if (typeof o[key] !== 'boolean') throw new ConfigError(`"${key}" must be true or false`);
      config[key] = o[key];
    }
  }
  if (o.excludeScopes !== undefined) {
    if (!Array.isArray(o.excludeScopes) || !o.excludeScopes.every((s) => typeof s === 'string' && s !== '')) {
      throw new ConfigError('"excludeScopes" must be a list of scope names');
    }
    config.excludeScopes = o.excludeScopes.map((s: string) => s.toLowerCase());
  }
  if (o.host !== undefined) {
    if (o.host !== null && !HOSTS.has(String(o.host))) {
      throw new ConfigError('"host" must be "github", "gitlab", "none" or null');
    }
    config.host = o.host as Config['host'];
  }
  return config;
}
