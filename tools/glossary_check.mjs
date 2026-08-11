/*
 * 用語集の書き漏らし検出
 *
 *   node tools/glossary_check.mjs [ファイルまたはフォルダ ...]
 *   node tools/glossary_check.mjs --diff <base>     # base との差分だけを見る
 *
 * 指定した文書に出てくるカタカナ語・英略語・記号のうち、docs/GLOSSARY.md に
 * 説明が無いものを一覧にする。
 *
 * このスクリプトが分かるのは「説明が無い」ことだけで、説明そのものは書けない。
 * 文章を書くのは Claude か Codex の仕事で、ここは忘れたことを見えるようにする。
 *
 * 終了コード: 未登録が無ければ 0、あれば 1（--warn-only を付けると常に 0）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const GLOSSARY = join(ROOT, 'docs/GLOSSARY.md');
const IGNORE = join(ROOT, 'tools/glossary_ignore.json');

const argv = process.argv.slice(2);
const warnOnly = argv.includes('--warn-only');
const markdown = argv.includes('--markdown');
const diffIdx = argv.indexOf('--diff');
const diffBase = diffIdx >= 0 ? argv[diffIdx + 1] : null;
const targets = argv.filter((a, i) =>
  !a.startsWith('--') && !(diffIdx >= 0 && i === diffIdx + 1));

/* ------------------------------------------------------------ 用語集を読む */

/** 見出しから、その項目が説明している語をすべて取り出す。
 *  「Pull Request / PR（プルリクエスト）」→ Pull Request, PR, プルリクエスト */
function headingAliases(heading) {
  const out = [];
  const cleaned = heading.replace(/`/g, '').trim();
  // 丸括弧の中身は読み仮名や別名
  const paren = cleaned.match(/[（(]([^）)]+)[）)]/g) || [];
  paren.forEach((p) => {
    p.replace(/[（()）]/g, '').split(/[・/、,]/).forEach((s) => {
      if (s.trim()) out.push(s.trim());
    });
  });
  const outside = cleaned.replace(/[（(][^）)]*[）)]/g, '');
  outside.split(/[/、,]/).forEach((s) => {
    const t = s.trim();
    if (t) out.push(t);
  });
  return out;
}

function loadGlossary() {
  const md = readFileSync(GLOSSARY, 'utf8');
  const terms = new Set();
  md.split('\n').forEach((line) => {
    const m = line.match(/^#{2,3}\s+(.*)$/);
    if (m) headingAliases(m[1]).forEach((t) => terms.add(t.toLowerCase()));
  });
  // 本文中で太字にした別名も登録済みとみなす（例: **キャッシュ**）
  (md.match(/\*\*([^*\n]{2,20})\*\*/g) || []).forEach((b) => {
    const t = b.replace(/\*\*/g, '').trim();
    if (/^[ァ-ヶー]+$/.test(t)) terms.add(t.toLowerCase());
  });
  return terms;
}

function loadIgnore() {
  const j = JSON.parse(readFileSync(IGNORE, 'utf8'));
  const s = new Set();
  ['common', 'appTerms', 'abbrevOk'].forEach((k) =>
    (j[k] || []).forEach((t) => s.add(t.toLowerCase())));
  return { words: s, paths: j.excludePaths || [] };
}

/* -------------------------------------------------------- 対象ファイル収集 */

function walk(p, acc) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const name of readdirSync(p)) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      walk(join(p, name), acc);
    }
  } else if (['.md', '.txt'].includes(extname(p))) {
    acc.push(p);
  }
  return acc;
}

function fromDiff(base) {
  const out = execFileSync('git', ['diff', '--name-only', base + '...HEAD'],
    { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n')
    .filter((f) => f && ['.md', '.txt'].includes(extname(f)))
    .map((f) => join(ROOT, f))
    .filter((f) => { try { return statSync(f).isFile(); } catch { return false; } });
}

/* 既定は「今回のブランチで新しく書いた文書だけ」を見る。
 * 過去の文書をすべて総当たりすると、一般語が大量に出て信号が埋もれるため。
 * 全体を見たいときはフォルダ名を明示して渡す。 */
function collect() {
  if (diffBase) return fromDiff(diffBase);

  if (targets.length === 0) {
    for (const base of ['origin/main', 'main']) {
      try {
        const files = fromDiff(base);
        console.log('(基準: ' + base + ' との差分)');
        return files;
      } catch { /* そのrefが無ければ次を試す */ }
    }
    console.log('(mainが見つからないため README.md のみ検査)');
    return [join(ROOT, 'README.md')];
  }

  const acc = [];
  for (const t of targets) {
    const p = t.startsWith('/') ? t : join(ROOT, t);
    try { walk(p, acc); } catch { /* 指定が無ければ飛ばす */ }
  }
  return acc;
}

/* ------------------------------------------------------------ 候補を拾う */

/** 本文から用語の候補を拾う。
 *  - 3文字以上のカタカナ語（長音・中黒を含む）
 *  - 2文字以上の英大文字略語
 *  - APP-430 のような課題番号の接頭辞 */
function candidates(text) {
  // コードブロック・インラインコード・URL は対象外
  const body = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^#{1,6}\s.*$/gm, (h) => h);   // 見出しは残す

  const found = new Map();
  const add = (word, line) => {
    const k = word.toLowerCase();
    if (!found.has(k)) found.set(k, { word, lines: new Set() });
    found.get(k).lines.add(line);
  };

  body.split('\n').forEach((line, i) => {
    (line.match(/[ァ-ヶー]{3,}/g) || []).forEach((w) => {
      // 「〜する」などの動詞化語尾を落とす
      add(w.replace(/(スル|シタ)$/, ''), i + 1);
    });
    (line.match(/\b[A-Z][A-Za-z]*[A-Z][A-Za-z]*\b|\b[A-Z]{2,}\b/g) || []).forEach((w) => add(w, i + 1));
  });
  return found;
}

/* ------------------------------------------------------------------ 実行 */

const glossary = loadGlossary();
const { words: ignore, paths: excludePaths } = loadIgnore();
const files = collect().filter((f) => {
  const rel = relative(ROOT, f);
  return !excludePaths.some((p) => rel.startsWith(p) || rel === p);
});

/** 用語集に既にあるか。部分一致も見る（「プロンプト」は「ネガティブプロンプト」を含む） */
function known(word) {
  const k = word.toLowerCase();
  if (glossary.has(k) || ignore.has(k)) return true;
  for (const t of glossary) {
    if (t.includes(k) || k.includes(t)) return true;
  }
  for (const t of ignore) {
    if (k.includes(t)) return true;
  }
  return false;
}

const missing = new Map();
for (const f of files) {
  if (f === GLOSSARY) continue;   // 用語集そのものは対象外
  const rel = relative(ROOT, f);
  let text;
  try { text = readFileSync(f, 'utf8'); } catch { continue; }
  for (const [, info] of candidates(text)) {
    if (known(info.word)) continue;
    if (!missing.has(info.word)) missing.set(info.word, []);
    missing.get(info.word).push(rel + ':' + [...info.lines][0]);
  }
}

const rows = [...missing.entries()].sort((a, b) => b[1].length - a[1].length);

if (rows.length === 0) {
  console.log('用語集に未登録の語は見つかりませんでした（対象 ' + files.length + ' ファイル）。');
  process.exit(0);
}

if (markdown) {
  console.log('### 用語集に未登録の語（' + rows.length + '件）\n');
  console.log('この用語集は `docs/GLOSSARY.md` です。説明を書くのはClaudeかCodexです。\n');
  console.log('| 語 | 出現数 | 最初に出てくる場所 |');
  console.log('|---|---|---|');
  rows.forEach(([w, at]) => {
    console.log('| ' + w + ' | ' + at.length + ' | `' + at[0] + '` |');
  });
} else {
  console.log('用語集に未登録の語: ' + rows.length + '件（対象 ' + files.length + ' ファイル）\n');
  rows.forEach(([w, at]) => {
    console.log('  ' + w.padEnd(24) + at.length + '回  ' + at[0]);
  });
  console.log('\ndocs/GLOSSARY.md へ追記するか、一般語なら tools/glossary_ignore.json に足してください。');
}

process.exit(warnOnly ? 0 : 1);
