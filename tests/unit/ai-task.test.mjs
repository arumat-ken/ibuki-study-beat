import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CLI = join(ROOT, 'scripts', 'ai-task.mjs');
const SETUP = join(ROOT, 'scripts', 'setup-ai-worktrees.mjs');

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function run(repo, args) {
  return execFileSync(process.execPath, [CLI, ...args, '--repo', repo], {
    encoding: 'utf8', cwd: repo, stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}
function fails(repo, args) {
  try { run(repo, args); assert.fail(`expected ${args.join(' ')} to fail`); }
  catch (error) { return String(error.stderr); }
}
function makeRepo(t) {
  const repo = mkdtempSync(join(tmpdir(), 'ibuki-ai-task-'));
  git(repo, ['init']); git(repo, ['branch', '-M', 'main']);
  git(repo, ['config', 'user.name', 'Test User']);
  git(repo, ['config', 'user.email', 'test@example.invalid']);
  writeFileSync(join(repo, 'README.md'), '# fixture\n');
  git(repo, ['add', 'README.md']); git(repo, ['commit', '-m', 'fixture']);
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  return repo;
}
function commitAll(repo, message) {
  git(repo, ['add', '.']); git(repo, ['commit', '-m', message]);
}
function setupWorktrees(repo, root) {
  const codex = join(root, `${basename(repo)}-codex`);
  const claude = join(root, `${basename(repo)}-claude`);
  execFileSync(process.execPath, [SETUP, '--repo', repo, '--base', 'main', '--codex-dir', codex, '--claude-dir', claude], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
  return { codex, claude };
}

test('台帳はbacklog起点で、保護された初期タスクを勝手にready化できない', t => {
  const repo = makeRepo(t);
  run(repo, ['init']);
  assert.match(run(repo, ['list']), /OPS-001\tbacklog/);
  assert.match(fails(repo, ['ready', 'APP-410', '--actor', 'parent']), /requires parent confirmation/);
  assert.match(fails(repo, ['ready', 'APP-420', '--actor', 'parent']), /waits for APP-410/);
  run(repo, ['new', 'TST-001', '--actor', 'parent', '--title', '共有ロック試験']);
  run(repo, ['ready', 'TST-001', '--actor', 'parent']);
  const text = readFileSync(join(repo, 'docs/exchange/tasks/TST-001.md'), 'utf8');
  assert.match(text, /state: ready/);
  assert.match(readFileSync(join(repo, 'docs/exchange/TASK_BOARD.md'), 'utf8'), /\| TST-001 \|/);
});

test('別worktreeでも同じWIPロック、checkpoint、handoff、監査、親recoverを共有する', t => {
  const repo = makeRepo(t);
  run(repo, ['init']);
  for (const id of ['TST-001', 'TST-002', 'TST-003']) {
    run(repo, ['new', id, '--actor', 'parent', '--title', `${id} 試験`]);
    run(repo, ['ready', id, '--actor', 'parent']);
  }
  commitAll(repo, 'seed task ledger');
  const { codex, claude } = setupWorktrees(repo, dirname(repo));

  run(codex, ['claim', 'TST-001', '--actor', 'codex']);
  assert.match(fails(codex, ['claim', 'TST-002', '--actor', 'codex']), /WIP limit 1/);
  assert.match(fails(claude, ['claim', 'TST-001', '--actor', 'claude']), /already locked/);

  run(codex, [
    'checkpoint', 'TST-001', '--actor', 'codex', '--completed', 'ロック共有を確認',
    '--remaining', 'Claudeレビュー', '--next', 'node scripts/ai-task.mjs handoff TST-001 --actor codex --to claude',
    '--files', 'docs/exchange/tasks/TST-001.md', '--tests', 'node --test fixture'
  ]);
  run(codex, ['snapshot', '--message', 'test: checkpoint snapshot']);
  run(codex, ['handoff', 'TST-001', '--actor', 'codex', '--to', 'claude']);
  run(codex, ['snapshot', '--message', 'test: handoff snapshot']);
  assert.match(run(codex, ['show', 'TST-001']), /state: review/);
  const common = resolve(codex, git(codex, ['rev-parse', '--git-common-dir']));
  assert.equal(existsSync(join(common, 'ai-handoff/locks/actor-codex.json')), false, 'handoff releases Codex WIP lock');

  git(claude, ['merge', '--no-edit', 'codex/workspace']);
  run(claude, ['claim', 'TST-001', '--actor', 'claude']);
  run(claude, ['block', 'TST-001', '--actor', 'claude', '--reason', 'review fixture']);
  run(claude, ['recover', 'TST-001', '--actor', 'parent']);
  assert.match(run(claude, ['show', 'TST-001']), /state: ready/);

  run(codex, ['claim', 'TST-003', '--actor', 'codex']);
  const staleAt = new Date(Date.now() - (5 * 60 * 60 * 1000)).toISOString();
  const staleFile = join(codex, 'docs/exchange/tasks/TST-003.md');
  writeFileSync(staleFile, readFileSync(staleFile, 'utf8')
    .replace(/^claimedAt: .*$/m, `claimedAt: ${staleAt}`)
    .replace(/^updatedAt: .*$/m, `updatedAt: ${staleAt}`));
  const audit = JSON.parse(run(codex, ['audit', '--json']));
  assert.ok(audit.warnings.some(message => message.includes('TST-003')), '4時間超の無checkpointを警告');
  run(codex, ['recover', 'TST-003', '--actor', 'parent']);

  writeFileSync(join(common, 'ai-handoff/locks/task-TST-002.json'), JSON.stringify({ id: 'TST-002', actor: 'codex' }));
  run(codex, ['unlock', 'TST-002', '--actor', 'parent', '--reason', 'fixture orphan', '--force']);
  assert.equal(existsSync(join(common, 'ai-handoff/locks/task-TST-002.json')), false);
  const finalAudit = JSON.parse(run(codex, ['audit', '--json']));
  assert.equal(finalAudit.errors.length, 0);
});
