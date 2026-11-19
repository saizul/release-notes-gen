// Run after `npm run build`: node examples/commonjs.cjs
const { bumpVersion, parseCommit } = require('../dist/cjs/index.js');

const commit = parseCommit('feat(api)!: rename run() to start()\n\nBREAKING CHANGE: run() is gone.');
console.log(commit.type, commit.scope, commit.breaking, commit.breakingNotes);
console.log(bumpVersion('1.9.3', 'major'));
console.log(bumpVersion('2.0.0-rc.1', 'patch', { prerelease: 'rc' }));
