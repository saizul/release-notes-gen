// Run after `npm run build`: node examples/library.mjs
import { generate } from '../dist/esm/index.js';

const release = generate({
  currentVersion: '1.4.2',
  previousTag: 'v1.4.2',
  date: '2026-11-19',
  config: { repoUrl: 'https://github.com/acme/rocket' },
  commits: [
    { hash: '9fceb02d0ae598e95dc970b74767f19372d61af8', message: 'feat(engine): add a second stage (#41)' },
    { hash: 'e83c5163316f89bfbde7d9ab23ca2e25604af290', message: 'fix: wobble on launch\n\nFixes #38' },
    { hash: '2d3acf90f35989df8f262dc50beadc4ee3ae1560', message: 'docs: explain the countdown' },
  ],
});

console.log(`${release.previousVersion} -> ${release.version} (${release.releaseType})\n`);
console.log(release.notes);
