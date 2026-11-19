import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../src/cli/run.js';

/** Runs the CLI in-process and captures its output. */
export async function cli(args: string[], options: { cwd?: string; stdin?: string } = {}) {
  let stdout = '';
  let stderr = '';
  const code = await run(args, {
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    cwd: options.cwd ?? process.cwd(),
    readStdin: async () => options.stdin ?? '',
    now: () => new Date('2026-11-19T12:00:00Z'),
  });
  return { code, stdout, stderr };
}

/** A throwaway git repository with a fixed identity and no signing. */
export class TempRepo {
  readonly dir: string;
  private tick = 0;

  constructor() {
    this.dir = mkdtempSync(join(tmpdir(), 'release-notes-gen-'));
    this.git('init', '-q');
    this.git('checkout', '-q', '-b', 'main');
  }

  git(...args: string[]): string {
    return this.gitInput(undefined, ...args);
  }

  gitInput(input: string | undefined, ...args: string[]): string {
    const date = `2026-01-01T00:00:${String(this.tick).padStart(2, '0')}Z`;
    return execFileSync(
      'git',
      [
        '-c',
        'user.name=Test User',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'tag.gpgsign=false',
        '-c',
        'core.autocrlf=false',
        '-c',
        'init.defaultBranch=main',
        ...args,
      ],
      {
        cwd: this.dir,
        encoding: 'utf8',
        input,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: join(this.dir, '.no-global-gitconfig'),
          GIT_AUTHOR_DATE: date,
          GIT_COMMITTER_DATE: date,
        },
      },
    );
  }

  /** Makes a commit that changes a file, with the message given exactly. */
  commit(message: string, file = 'file.txt'): string {
    this.tick++;
    writeFileSync(join(this.dir, file), `change ${this.tick}\n`);
    this.git('add', '--', file);
    this.gitInput(message, 'commit', '-q', '--cleanup=verbatim', '-F', '-');
    return this.git('rev-parse', 'HEAD').trim();
  }

  tag(name: string): void {
    this.git('tag', name);
  }

  write(file: string, content: string): void {
    writeFileSync(join(this.dir, file), content);
  }

  remove(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}
