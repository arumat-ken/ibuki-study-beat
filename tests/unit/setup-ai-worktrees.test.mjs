import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SETUP = join(ROOT, 'scripts', 'setup-ai-worktrees.mjs');

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function makeRepo(t) {
  const repo = mkdtempSync(join(tmpdir(), 'ibuki-worktrees-'));
  git(repo, ['init']); git(repo, ['branch', '-M', 'main']);
  git(repo, ['config', 'user.name', 'Test User']);
  git(repo, ['config', 'user.email', 'test@example.invalid']);
  writeFileSync(join(repo, 'README.md'), '# fixture\n');
  git(repo, ['add', 'README.md']); git(repo, ['commit', '-m', 'fixture']);
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  return repo;
}
function setup(repo, codex, claude) {
  return JSON.parse(execFileSync(process.execPath, [
    SETUP, '--repo', repo, '--base', 'main', '--codex-dir', codex, '--claude-dir', claude, '--json'
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

test('worktree setupは共通Git管理領域を作り、再実行しても安全に検証だけ行う', t => {
  const repo = makeRepo(t);
  const codex = `${repo}-codex`;
  const claude = `${repo}-claude`;
  const first = setup(repo, codex, claude);
  assert.equal(first.codex.result, 'created');
  assert.equal(first.claude.result, 'created');
  assert.equal(git(codex, ['branch', '--show-current']), 'codex/workspace');
  assert.equal(git(claude, ['branch', '--show-current']), 'claude/workspace');
  const canonicalRepo = resolve(git(repo, ['rev-parse', '--show-toplevel']));
  const common = resolve(canonicalRepo, git(canonicalRepo, ['rev-parse', '--git-common-dir']));
  assert.equal(resolve(codex, git(codex, ['rev-parse', '--git-common-dir'])), common);
  assert.equal(resolve(claude, git(claude, ['rev-parse', '--git-common-dir'])), common);

  const second = setup(repo, codex, claude);
  assert.equal(second.codex.result, 'verified');
  assert.equal(second.claude.result, 'verified');
});
