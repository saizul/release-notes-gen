import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { HELP } from '../src/cli/args.js';
import * as git from '../src/git.js';
import * as esm from '../src/index.js';

const require = createRequire(import.meta.url);
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('package', () => {
  it('the CommonJS build exposes the same API', () => {
    const cjs = require('../cjs/index.js') as typeof esm;
    assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort());
    assert.equal(cjs.bumpVersion('1.2.3', 'minor'), '1.3.0');
    const cjsGit = require('../cjs/git.js') as typeof git;
    assert.deepEqual(Object.keys(cjsGit).sort(), Object.keys(git).sort());
  });

  it('the CommonJS folder is marked as commonjs', () => {
    assert.equal(JSON.parse(read('../cjs/package.json')).type, 'commonjs');
  });

  it('has no runtime dependencies and versions agree', () => {
    const pkg = JSON.parse(read('../../package.json'));
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.version, esm.VERSION);
    assert.equal(pkg.name, '@saizul/release-notes-gen');
    assert.equal(pkg.bin['release-notes-gen'], './dist/esm/cli.js');
    assert.equal(pkg.exports['./git'].import.default, './dist/esm/git.js');
  });

  it('the CLI entry starts with a shebang', () => {
    assert.ok(read('../esm/cli.js').startsWith('#!/usr/bin/env node'));
  });

  it('the main entry does not load Node built-ins (git lives in ./git)', () => {
    for (const file of [
      'index',
      'parse',
      'semver',
      'render',
      'changelog',
      'generate',
      'group',
      'links',
      'config',
      'input',
    ]) {
      assert.doesNotMatch(read(`../esm/${file}.js`), /from ['"]node:/, file);
    }
  });

  it('the README documents every CLI option', () => {
    const readme = read('../../README.md');
    const flags = [...new Set(HELP.slice(0, HELP.indexOf('Examples:')).match(/--[a-z-]+/g))];
    assert.ok(flags.length > 15);
    for (const flag of flags) assert.ok(readme.includes(`\`${flag}`), flag);
  });

  it('the action runs the built CLI with every input passed through', () => {
    const action = read('../../action.yml');
    assert.match(action, /using: composite/);
    assert.match(action, /dist\/esm\/cli\.js/);
    const inputsBlock = action.slice(action.indexOf('\ninputs:'), action.indexOf('\noutputs:'));
    const inputs = [...inputsBlock.matchAll(/^ {2}([a-z-]+):\n {4}description:/gm)].map((m) => m[1]!);
    assert.ok(inputs.length >= 8, inputs.join(','));
    for (const name of inputs) {
      const env = `INPUT_${name.toUpperCase().replace(/-/g, '_')}`;
      assert.ok(action.includes(`${env}: \${{ inputs.${name} }}`), env);
    }
  });
});
