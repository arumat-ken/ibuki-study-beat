#!/usr/bin/env node
/** Create (or verify) the two persistent local AI worktrees without resetting either. */
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

function fail(message) { throw new Error(message); }
function git(repo, args, allowFailure = false) {
  try {
    return execFileSync('git', ['-C', repo, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    if (allowFailure) return '';
    const stderr = error.stderr ? String(error.stderr).trim() : '';
    fail(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
}
function parseArgs(argv) {
  const options = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--json') { options.set('json', true); continue; }
    if (!token.startsWith('--')) fail(`unknown argument: ${token}`);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) fail(`${token} needs a value`);
    options.set(token.slice(2), value); i += 1;
  }
  return options;
}
function option(options, name, fallback = '') { return options.get(name) || fallback; }
function resolveCommon(repo) { return resolve(repo, git(repo, ['rev-parse', '--git-common-dir'])); }
function canonical(path) { return existsSync(path) ? realpathSync(path) : resolve(path); }
function worktrees(repo) {
  const records = [];
  let current = null;
  for (const line of git(repo, ['worktree', 'list', '--porcelain']).split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) records.push(current);
      current = { path: line.slice('worktree '.length), branch: '' };
    } else if (current && line.startsWith('branch ')) current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
  }
  if (current) records.push(current);
  return records;
}
function hasBranch(repo, branch) {
  try {
    execFileSync('git', ['-C', repo, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}
function ensureWorktree(repo, target, branch, base) {
  const current = worktrees(repo).find(entry => canonical(entry.path) === canonical(target));
  if (current) {
    if (current.branch !== branch) fail(`${target} already belongs to branch ${current.branch || '(detached)'}, expected ${branch}`);
    return 'verified';
  }
  if (existsSync(target)) fail(`${target} exists but is not a registered Git worktree; refusing to replace it`);
  const args = ['worktree', 'add'];
  if (hasBranch(repo, branch)) args.push(target, branch);
  else args.push('-b', branch, target, base);
  git(repo, args);
  return 'created';
}
function main() {
  const options = parseArgs(process.argv.slice(2));
  const requested = resolve(option(options, 'repo', process.cwd()));
  const repo = resolve(git(requested, ['rev-parse', '--show-toplevel']));
  const base = option(options, 'base', 'main');
  git(repo, ['rev-parse', '--verify', `${base}^{commit}`]);
  const prefix = basename(repo);
  const parent = dirname(repo);
  const codexDir = resolve(option(options, 'codex-dir', `${parent}/${prefix}-codex`));
  const claudeDir = resolve(option(options, 'claude-dir', `${parent}/${prefix}-claude`));
  if (codexDir === claudeDir || codexDir === repo || claudeDir === repo) fail('worktree paths must be distinct from each other and the source checkout');

  const result = {
    repo,
    base,
    commonDir: resolveCommon(repo),
    codex: { path: codexDir, branch: option(options, 'codex-branch', 'codex/workspace') },
    claude: { path: claudeDir, branch: option(options, 'claude-branch', 'claude/workspace') }
  };
  result.codex.result = ensureWorktree(repo, result.codex.path, result.codex.branch, base);
  result.claude.result = ensureWorktree(repo, result.claude.path, result.claude.branch, base);
  const codexCommon = resolveCommon(result.codex.path);
  const claudeCommon = resolveCommon(result.claude.path);
  if (codexCommon !== result.commonDir || claudeCommon !== result.commonDir) fail('created worktrees do not share the Git common directory');
  if (options.get('json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Codex: ${result.codex.result} ${result.codex.path} (${result.codex.branch})`);
    console.log(`Claude: ${result.claude.result} ${result.claude.path} (${result.claude.branch})`);
    console.log(`Shared Git management: ${result.commonDir}`);
  }
}

try { main(); }
catch (error) { console.error(`setup-ai-worktrees: ${error.message}`); process.exitCode = 1; }
