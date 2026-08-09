#!/usr/bin/env node
/**
 * Shared, Git-backed task ledger for the local Codex + Claude workflow.
 * The tracked Markdown files are the audit trail. Small lock files live in
 * Git's common directory, so linked worktrees on this Mac see WIP immediately.
 */
import { execFileSync } from 'node:child_process';
import {
  closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, statSync, unlinkSync, writeFileSync
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

const ACTIVE_STATES = new Set(['claimed', 'in_progress']);
const ACTORS = new Set(['codex', 'claude']);
const STALE_MS = 4 * 60 * 60 * 1000;
const META_KEYS = [
  'id', 'title', 'state', 'owner', 'handoffTo', 'dependsOn', 'readyGuard',
  'readyConfirmation', 'createdAt', 'updatedAt', 'claimedAt',
  'lastCheckpointAt', 'lastBranch', 'lastCommit', 'blockedAt'
];
const INITIAL_TASKS = [
  {
    id: 'OPS-001',
    title: 'CodexとClaudeのローカル自律引き渡し経路',
    purpose: '別worktree間で同じ担当ロックを共有し、WIP上限1、チェックポイント、引き渡し、監査、異常回復、setupの作成と再実行を確認する。'
  },
  {
    id: 'APP-410',
    title: 'ver.4.1.0 ポイント・装備・ショップ',
    purpose: 'Claudeの既存作業・コミットを照合するまでbacklogを維持する。',
    readyGuard: 'Claudeの既存作業とコミットを親が照合済みであること'
  },
  {
    id: 'APP-420',
    title: 'ver.4.2.0 金融ラボ・GT・PayPay交換申請',
    purpose: 'APP-410の完了後までbacklogを維持する。',
    dependsOn: 'APP-410'
  }
];

function fail(message) { throw new Error(message); }
function isoNow() { return new Date().toISOString(); }
function oneLine(value) { return String(value || '').replace(/[\r\n]+/g, ' ').trim(); }
function commandOutput(repo, args, options = {}) {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    if (options.allowFailure) return '';
    const stderr = error.stderr ? String(error.stderr).trim() : '';
    fail(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
}
function parseArgs(argv) {
  const positionals = [];
  const options = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) { positionals.push(token); continue; }
    const key = token.slice(2);
    if (key === 'json' || key === 'force' || key === 'strict') { options.set(key, true); continue; }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) fail(`${token} needs a value`);
    options.set(key, value); i += 1;
  }
  return { positionals, options };
}
function option(parsed, name, fallback = '') { return parsed.options.get(name) || fallback; }
function requireOption(parsed, name) {
  const value = option(parsed, name);
  if (!value) fail(`--${name} is required`);
  return value;
}
function gitSucceeds(repo, args) {
  try {
    execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}
function resolveRepo(parsed) {
  const requested = resolve(option(parsed, 'repo', process.cwd()));
  return resolve(commandOutput(requested, ['rev-parse', '--show-toplevel']));
}
function taskPaths(repo) {
  const exchange = join(repo, 'docs', 'exchange');
  const commonRaw = commandOutput(repo, ['rev-parse', '--git-common-dir']);
  const common = resolve(repo, commonRaw);
  return {
    exchange,
    tasks: join(exchange, 'tasks'),
    board: join(exchange, 'TASK_BOARD.md'),
    runtime: join(common, 'ai-handoff'),
    locks: join(common, 'ai-handoff', 'locks')
  };
}
function taskPath(repo, id) {
  if (!/^[A-Z][A-Z0-9]*-[0-9]{3,}$/.test(id || '')) fail(`invalid task ID: ${id || '(empty)'}`);
  return join(taskPaths(repo).tasks, `${id}.md`);
}
function parseTaskFile(file) {
  if (!existsSync(file)) fail(`task not found: ${basename(file, '.md')}`);
  const text = readFileSync(file, 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) fail(`invalid task frontmatter: ${file}`);
  const meta = {};
  for (const line of match[1].split('\n')) {
    const index = line.indexOf(':');
    if (index <= 0) fail(`invalid frontmatter line in ${file}: ${line}`);
    meta[line.slice(0, index)] = line.slice(index + 1).trim();
  }
  if (!meta.state && meta.status) meta.state = meta.status; // v1 bootstrap migration
  if (!meta.id || !meta.title || !meta.state) fail(`missing required task metadata: ${file}`);
  return { file, meta, body: match[2] };
}
function serializeTask(task) {
  const meta = { ...task.meta };
  delete meta.status;
  const ordered = [
    ...META_KEYS.filter(key => Object.hasOwn(meta, key)),
    ...Object.keys(meta).filter(key => !META_KEYS.includes(key)).sort()
  ];
  const lines = ordered.map(key => {
    const value = oneLine(meta[key]);
    return value ? `${key}: ${value}` : `${key}:`;
  });
  return `---\n${lines.join('\n')}\n---\n${task.body.replace(/^\n+/, '')}`;
}
function saveTask(task) { writeFileSync(task.file, serializeTask(task)); }
function readTask(repo, id) { return parseTaskFile(taskPath(repo, id)); }
function allTasks(repo) {
  const dir = taskPaths(repo).tasks;
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => parseTaskFile(join(dir, entry.name)))
    .sort((a, b) => a.meta.id.localeCompare(b.meta.id));
}
function appendSection(task, heading, markdown) {
  const marker = `## ${heading}\n`;
  const position = task.body.indexOf(marker);
  if (position === -1) {
    task.body = `${task.body.trimEnd()}\n\n${marker}\n${markdown.trim()}\n`;
    return;
  }
  const nextHeading = task.body.indexOf('\n## ', position + marker.length);
  const insertAt = nextHeading === -1 ? task.body.length : nextHeading;
  task.body = `${task.body.slice(0, insertAt).trimEnd()}\n${markdown.trim()}\n${task.body.slice(insertAt)}`;
}
function history(task, actor, action, detail = '') {
  appendSection(task, 'History', `- ${isoNow()} | ${actor} | ${action}${detail ? ` | ${oneLine(detail)}` : ''}`);
}
function checkpointMarkdown(data) {
  return `### ${data.at}\n\n` +
    `- 完了内容: ${oneLine(data.completed)}\n` +
    `- 残作業: ${oneLine(data.remaining)}\n` +
    `- 次の正確な操作: ${oneLine(data.next)}\n` +
    `- 変更ファイル: ${oneLine(data.files)}\n` +
    `- テスト結果: ${oneLine(data.tests)}\n` +
    `- ブランチ: ${oneLine(data.branch)}\n` +
    `- コミット: ${oneLine(data.commit)}`;
}
function addCheckpoint(task, data) {
  const marker = '<!-- checkpoints -->';
  const entry = `${checkpointMarkdown(data)}\n\n`;
  if (task.body.includes(marker)) task.body = task.body.replace(marker, `${entry}${marker}`);
  else appendSection(task, 'Checkpoints', entry);
}
function renderBoard(repo) {
  const rows = allTasks(repo).map(({ meta }) =>
    `| ${meta.id} | ${meta.title} | ${meta.state} | ${meta.owner || '—'} | ${meta.handoffTo || '—'} | ${meta.updatedAt || '—'} |`);
  const content = '# AI Task Board\n\n' +
    '> 状態は `scripts/ai-task.mjs` で更新し、節目ごとに `snapshot` してGitに残す。' +
    ' ロックの強制解除は親だけが行える。\n\n' +
    `最終更新: ${isoNow()}\n\n` +
    `| ID | Task | State | Owner | Handoff to | Updated |\n` +
    `| --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\n` +
    `## 運用ルール\n\n` +
    '- 基本遷移: `backlog → ready → claimed → in_progress → review → done`。\n' +
    `- Codex / Claude はそれぞれ同時に1件のみ（WIP上限1）。\n` +
    '- `APP-410` はClaudeの既存作業・コミットの親確認後、`APP-420` はAPP-410完了後にのみready化できる。\n';
  writeFileSync(taskPaths(repo).board, content);
}
function lockPaths(repo, actor, id) {
  const locks = taskPaths(repo).locks;
  return { actor: join(locks, `actor-${actor}.json`), task: join(locks, `task-${id}.json`) };
}
function readLock(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch { return { malformed: true, file }; }
}
function createLock(file, payload) {
  mkdirSync(dirname(file), { recursive: true });
  let fd;
  try {
    fd = openSync(file, 'wx');
    writeFileSync(fd, `${JSON.stringify(payload)}\n`);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
function removeIfMatching(file, id, actor) {
  const lock = readLock(file);
  if (lock && lock.id === id && (!actor || lock.actor === actor)) unlinkSync(file);
}
function assertActor(actor, { parentAllowed = false } = {}) {
  if (ACTORS.has(actor)) return actor;
  if (parentAllowed && actor === 'parent') return actor;
  fail(`--actor must be ${parentAllowed ? 'parent, codex, or claude' : 'codex or claude'}`);
}
function assertLockOwner(repo, task, actor) {
  if (task.meta.owner !== actor || !ACTIVE_STATES.has(task.meta.state)) {
    fail(`${task.meta.id} is not actively held by ${actor}`);
  }
  const locks = lockPaths(repo, actor, task.meta.id);
  const actorLock = readLock(locks.actor);
  const taskLock = readLock(locks.task);
  if (!actorLock || actorLock.id !== task.meta.id || !taskLock || taskLock.actor !== actor) {
    fail(`${task.meta.id} has no valid shared lock for ${actor}; ask parent to inspect audit/recover`);
  }
}
function releaseLocks(repo, task, actor) {
  const locks = lockPaths(repo, actor, task.meta.id);
  removeIfMatching(locks.actor, task.meta.id, actor);
  removeIfMatching(locks.task, task.meta.id, actor);
}
function taskAge(task) {
  const source = task.meta.lastCheckpointAt || task.meta.claimedAt || task.meta.updatedAt;
  const parsed = Date.parse(source || '');
  return Number.isNaN(parsed) ? Infinity : Math.max(0, Date.now() - parsed);
}
function formatAge(ms) { return Number.isFinite(ms) ? `${Math.floor(ms / 60000)}分` : '不明'; }
function requireCleanHandoff(repo, task) {
  const dirty = commandOutput(repo, ['status', '--porcelain']);
  if (dirty) fail('handoff/done requires a clean worktree; commit or stash the remaining changes first');
  const head = commandOutput(repo, ['rev-parse', 'HEAD']);
  const checkpointCommit = task.meta.lastCommit;
  if (!checkpointCommit) fail('a checkpoint with a commit is required before handoff/done');
  if (!gitSucceeds(repo, ['merge-base', '--is-ancestor', checkpointCommit, head])) {
    fail(`checkpoint commit ${checkpointCommit} is not an ancestor of HEAD`);
  }
  const changed = commandOutput(repo, ['diff', '--name-only', `${checkpointCommit}..${head}`])
    .split('\n').filter(Boolean);
  const isLedger = file => file === 'docs/exchange/TASK_BOARD.md' || file.startsWith('docs/exchange/tasks/');
  if (changed.some(file => !isLedger(file))) {
    fail('changes after the checkpoint commit are not limited to the task ledger; checkpoint again after committing them');
  }
}
function initialTaskFile(task) {
  const time = isoNow();
  const meta = {
    id: task.id, title: task.title, state: 'backlog', owner: '', handoffTo: '',
    dependsOn: task.dependsOn || '', readyGuard: task.readyGuard || '',
    readyConfirmation: '', createdAt: time, updatedAt: time, claimedAt: '',
    lastCheckpointAt: '', lastBranch: '', lastCommit: '', blockedAt: ''
  };
  return serializeTask({
    meta,
    body: `# ${task.id}: ${task.title}\n\n## Purpose\n\n${task.purpose}\n\n## Checkpoints\n\n<!-- checkpoints -->\n\n## History\n\n- ${time} | parent | created in backlog\n`
  });
}
function migrateBootstrapLocks(repo) {
  const paths = taskPaths(repo);
  if (!existsSync(paths.locks)) return;
  for (const entry of readdirSync(paths.locks)) {
    if (!entry.endsWith('.lock')) continue;
    const target = join(paths.locks, `${entry.slice(0, -'.lock'.length)}.json`);
    if (!existsSync(target)) renameSync(join(paths.locks, entry), target);
  }
}
function commandInit(repo) {
  const paths = taskPaths(repo);
  mkdirSync(paths.tasks, { recursive: true });
  for (const task of INITIAL_TASKS) {
    const file = taskPath(repo, task.id);
    if (!existsSync(file)) writeFileSync(file, initialTaskFile(task));
    else {
      const existing = parseTaskFile(file);
      for (const key of META_KEYS) if (!Object.hasOwn(existing.meta, key)) existing.meta[key] = '';
      if (task.dependsOn) existing.meta.dependsOn = task.dependsOn;
      if (task.readyGuard) existing.meta.readyGuard = task.readyGuard;
      if (task.id === 'OPS-001' && existing.meta.state === 'claimed' && !existing.body.includes('| codex | claimed')) {
        appendSection(existing, 'History', `- ${existing.meta.claimedAt} | codex | claimed | bootstrap claim before full OPS-001 implementation`);
      }
      saveTask(existing); // migrate the short bootstrap frontmatter safely
    }
  }
  migrateBootstrapLocks(repo);
  renderBoard(repo);
  console.log(`initialized ${paths.exchange}`);
}
function commandList(repo, parsed) {
  const tasks = allTasks(repo).map(({ meta }) => meta);
  if (parsed.options.get('json')) console.log(JSON.stringify(tasks, null, 2));
  else for (const task of tasks) console.log(`${task.id}\t${task.state}\t${task.owner || '-'}\t${task.title}`);
}
function commandShow(repo, id) { process.stdout.write(readFileSync(taskPath(repo, id), 'utf8')); }
function commandNew(repo, id, parsed) {
  assertActor(requireOption(parsed, 'actor'), { parentAllowed: true });
  if (option(parsed, 'actor') !== 'parent') fail('only parent may create a task');
  const title = option(parsed, 'title', parsed.positionals[2] || '');
  if (!title) fail('new needs --title "..."');
  const file = taskPath(repo, id);
  if (existsSync(file)) fail(`${id} already exists`);
  const task = { id, title, purpose: option(parsed, 'purpose', '親の依頼を台帳へ記録。ready化前に条件を確認する。') };
  writeFileSync(file, initialTaskFile(task)); renderBoard(repo);
  console.log(`${id} created in backlog`);
}
function commandReady(repo, id, parsed) {
  if (requireOption(parsed, 'actor') !== 'parent') fail('only parent may move a task to ready');
  const task = readTask(repo, id);
  if (task.meta.state !== 'backlog') fail(`${id} must be backlog before ready`);
  if (task.meta.dependsOn) {
    const dependency = readTask(repo, task.meta.dependsOn);
    if (dependency.meta.state !== 'done') fail(`${id} waits for ${task.meta.dependsOn} to be done`);
  }
  if (task.meta.readyGuard) {
    const confirmation = option(parsed, 'confirm');
    if (!confirmation) fail(`${id} requires parent confirmation: ${task.meta.readyGuard}; provide --confirm "evidence"`);
    task.meta.readyConfirmation = confirmation;
  }
  task.meta.state = 'ready'; task.meta.updatedAt = isoNow();
  history(task, 'parent', 'moved to ready', task.meta.readyConfirmation);
  saveTask(task); renderBoard(repo); console.log(`${id} ready`);
}
function commandClaim(repo, id, parsed) {
  const actor = assertActor(requireOption(parsed, 'actor'));
  const task = readTask(repo, id);
  const allowedReview = task.meta.state === 'review' && task.meta.handoffTo === actor;
  if (task.meta.state !== 'ready' && !allowedReview) {
    fail(`${id} must be ready${task.meta.handoffTo ? ` or handed off to ${actor}` : ''} before claim`);
  }
  const locks = lockPaths(repo, actor, id);
  if (readLock(locks.actor)) fail(`${actor} already has an active task (WIP limit 1); parent must recover/unlock stale locks`);
  if (readLock(locks.task)) fail(`${id} is already locked by another worktree`);
  const claimedAt = isoNow();
  let actorCreated = false;
  try {
    createLock(locks.actor, { id, actor, claimedAt }); actorCreated = true;
    createLock(locks.task, { id, actor, claimedAt });
  } catch (error) {
    if (actorCreated) removeIfMatching(locks.actor, id, actor);
    fail(`could not claim ${id}: ${error.message}`);
  }
  task.meta.state = 'claimed'; task.meta.owner = actor; task.meta.handoffTo = '';
  task.meta.claimedAt = claimedAt; task.meta.updatedAt = claimedAt; task.meta.blockedAt = '';
  history(task, actor, 'claimed'); saveTask(task); renderBoard(repo);
  console.log(`${id} claimed by ${actor}`);
}
function commandCheckpoint(repo, id, parsed) {
  const actor = assertActor(requireOption(parsed, 'actor'));
  const task = readTask(repo, id); assertLockOwner(repo, task, actor);
  const data = {
    at: isoNow(), completed: requireOption(parsed, 'completed'), remaining: requireOption(parsed, 'remaining'),
    next: requireOption(parsed, 'next'), files: requireOption(parsed, 'files'), tests: requireOption(parsed, 'tests'),
    branch: option(parsed, 'branch', commandOutput(repo, ['branch', '--show-current'])),
    commit: option(parsed, 'commit', commandOutput(repo, ['rev-parse', 'HEAD']))
  };
  if (!data.branch || !data.commit) fail('checkpoint needs a branch and commit');
  addCheckpoint(task, data);
  task.meta.state = 'in_progress'; task.meta.lastCheckpointAt = data.at;
  task.meta.lastBranch = data.branch; task.meta.lastCommit = data.commit; task.meta.updatedAt = data.at;
  history(task, actor, 'checkpoint', `commit ${data.commit}`);
  saveTask(task); renderBoard(repo); console.log(`${id} checkpointed`);
}
function commandHandoff(repo, id, parsed) {
  const actor = assertActor(requireOption(parsed, 'actor'));
  const to = assertActor(requireOption(parsed, 'to'));
  if (actor === to) fail('handoff recipient must be the other AI');
  const task = readTask(repo, id); assertLockOwner(repo, task, actor); requireCleanHandoff(repo, task);
  releaseLocks(repo, task, actor);
  task.meta.state = 'review'; task.meta.owner = ''; task.meta.handoffTo = to; task.meta.updatedAt = isoNow();
  history(task, actor, 'handoff requested', `to ${to}; commit ${task.meta.lastCommit}`);
  saveTask(task); renderBoard(repo); console.log(`${id} handed off to ${to} for review`);
}
function commandBlock(repo, id, parsed) {
  const actor = assertActor(requireOption(parsed, 'actor'));
  const reason = requireOption(parsed, 'reason');
  const task = readTask(repo, id); assertLockOwner(repo, task, actor);
  if (!task.meta.lastCheckpointAt) fail('block requires a checkpoint first');
  releaseLocks(repo, task, actor);
  task.meta.state = 'blocked'; task.meta.blockedAt = isoNow(); task.meta.updatedAt = task.meta.blockedAt;
  history(task, actor, 'blocked', reason); saveTask(task); renderBoard(repo);
  console.log(`${id} blocked`);
}
function commandDone(repo, id, parsed) {
  const actor = assertActor(requireOption(parsed, 'actor'), { parentAllowed: true });
  const task = readTask(repo, id);
  if (task.meta.state !== 'review') fail(`${id} must be in review before done`);
  if (actor !== 'parent' && task.meta.handoffTo !== actor) fail(`${actor} is not the assigned reviewer for ${id}`);
  requireCleanHandoff(repo, task);
  task.meta.state = 'done'; task.meta.owner = ''; task.meta.handoffTo = ''; task.meta.updatedAt = isoNow();
  history(task, actor, 'marked done'); saveTask(task); renderBoard(repo); console.log(`${id} done`);
}
function commandRecover(repo, id, parsed) {
  if (requireOption(parsed, 'actor') !== 'parent') fail('only parent may recover a task');
  const task = readTask(repo, id);
  if (!ACTIVE_STATES.has(task.meta.state) && task.meta.state !== 'blocked') fail(`${id} is not active or blocked`);
  const age = taskAge(task);
  if (task.meta.state !== 'blocked' && age < STALE_MS && !parsed.options.get('force')) {
    fail(`${id} has a checkpoint only ${formatAge(age)} old; recover requires 4 hours or --force`);
  }
  if (task.meta.owner) releaseLocks(repo, task, task.meta.owner);
  task.meta.state = 'ready'; task.meta.owner = ''; task.meta.handoffTo = ''; task.meta.updatedAt = isoNow(); task.meta.blockedAt = '';
  history(task, 'parent', 'recovered to ready', `last checkpoint age ${formatAge(age)}`);
  saveTask(task); renderBoard(repo); console.log(`${id} recovered to ready`);
}
function commandUnlock(repo, id, parsed) {
  if (requireOption(parsed, 'actor') !== 'parent') fail('only parent may unlock');
  const reason = requireOption(parsed, 'reason');
  const task = readTask(repo, id);
  if (ACTIVE_STATES.has(task.meta.state)) fail(`${id} is active; use recover instead of unlock`);
  const lockDir = taskPaths(repo).locks;
  if (!existsSync(lockDir)) { console.log(`${id} has no locks`); return; }
  let removed = 0;
  for (const entry of readdirSync(lockDir)) {
    if (!entry.endsWith('.json')) continue;
    const file = join(lockDir, entry);
    const lock = readLock(file);
    if (!lock || lock.id !== id) continue;
    const age = Date.now() - statSync(file).mtimeMs;
    if (age < STALE_MS && !parsed.options.get('force')) {
      fail(`${id} has a fresh lock (${formatAge(age)}); unlock requires --force`);
    }
    unlinkSync(file); removed += 1;
  }
  history(task, 'parent', 'unlocked stale/orphan lock', `${removed} locks; ${reason}`);
  task.meta.updatedAt = isoNow(); saveTask(task); renderBoard(repo);
  console.log(`${id}: ${removed} lock(s) removed`);
}
function commandAudit(repo, parsed) {
  const warnings = [];
  const errors = [];
  const tasks = allTasks(repo);
  const owners = new Map();
  const knownIds = new Set(tasks.map(task => task.meta.id));
  for (const task of tasks) {
    const { meta } = task;
    if (!ACTIVE_STATES.has(meta.state)) continue;
    if (!ACTORS.has(meta.owner)) { errors.push(`${meta.id}: active task has no valid owner`); continue; }
    owners.set(meta.owner, (owners.get(meta.owner) || 0) + 1);
    const locks = lockPaths(repo, meta.owner, meta.id);
    const actorLock = readLock(locks.actor);
    const taskLock = readLock(locks.task);
    if (!actorLock || actorLock.id !== meta.id || !taskLock || taskLock.actor !== meta.owner) {
      errors.push(`${meta.id}: task ledger and shared lock disagree`);
    }
    const age = taskAge(task);
    if (age >= STALE_MS) warnings.push(`${meta.id}: no checkpoint for ${formatAge(age)} (parent may recover; no automatic takeover)`);
  }
  for (const [actor, count] of owners) if (count > 1) errors.push(`${actor}: ${count} active ledger tasks (WIP limit 1)`);
  const lockDir = taskPaths(repo).locks;
  if (existsSync(lockDir)) {
    for (const entry of readdirSync(lockDir)) {
      if (!entry.endsWith('.json')) continue;
      const file = join(lockDir, entry); const lock = readLock(file);
      if (!lock || lock.malformed) { errors.push(`${entry}: malformed shared lock`); continue; }
      if (!knownIds.has(lock.id)) warnings.push(`${entry}: orphan lock for unknown ${lock.id}`);
    }
  }
  const result = { ok: errors.length === 0, warnings, errors, checkedAt: isoNow(), staleAfterHours: 4 };
  if (parsed.options.get('json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`AUDIT ${result.ok ? 'OK' : 'ERROR'} — ${tasks.length} tasks checked`);
    for (const warning of warnings) console.log(`WARN  ${warning}`);
    for (const error of errors) console.log(`ERROR ${error}`);
    console.log('No automatic recovery was performed.');
  }
  if (!result.ok && parsed.options.get('strict')) process.exitCode = 1;
}
function commandSnapshot(repo, parsed) {
  const allowed = new Set(['docs/exchange/TASK_BOARD.md']);
  const staged = commandOutput(repo, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  const isAllowed = file => allowed.has(file) || file.startsWith('docs/exchange/tasks/');
  if (staged.some(file => !isAllowed(file))) fail('snapshot refuses to commit unrelated staged files');
  commandOutput(repo, ['add', '--', 'docs/exchange/TASK_BOARD.md', 'docs/exchange/tasks']);
  const changed = commandOutput(repo, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  if (!changed.length) { console.log('no ledger changes to snapshot'); return; }
  const message = option(parsed, 'message', 'chore(handoff): snapshot task ledger');
  commandOutput(repo, ['commit', '-m', message]);
  console.log(`snapshot ${commandOutput(repo, ['rev-parse', '--short', 'HEAD'])}`);
}
function usage() {
  console.error(`Usage: node scripts/ai-task.mjs <command> [TASK-ID] [options]

Commands: init, list, show, new, ready, claim, checkpoint, handoff, block, done, recover, unlock, audit, snapshot`);
}
function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const [command, id] = parsed.positionals;
  const repo = resolveRepo(parsed);
  const needsId = new Set(['show', 'new', 'ready', 'claim', 'checkpoint', 'handoff', 'block', 'done', 'recover', 'unlock']);
  if (needsId.has(command) && !id) fail(`${command} needs a task ID`);
  switch (command) {
    case 'init': return commandInit(repo);
    case 'list': return commandList(repo, parsed);
    case 'show': return commandShow(repo, id);
    case 'new': return commandNew(repo, id, parsed);
    case 'ready': return commandReady(repo, id, parsed);
    case 'claim': return commandClaim(repo, id, parsed);
    case 'checkpoint': return commandCheckpoint(repo, id, parsed);
    case 'handoff': return commandHandoff(repo, id, parsed);
    case 'block': return commandBlock(repo, id, parsed);
    case 'done': return commandDone(repo, id, parsed);
    case 'recover': return commandRecover(repo, id, parsed);
    case 'unlock': return commandUnlock(repo, id, parsed);
    case 'audit': return commandAudit(repo, parsed);
    case 'snapshot': return commandSnapshot(repo, parsed);
    default: usage(); process.exitCode = 1;
  }
}

try { main(); }
catch (error) { console.error(`ai-task: ${error.message}`); process.exitCode = 1; }
