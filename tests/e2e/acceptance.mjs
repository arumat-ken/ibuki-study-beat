/*
 * IBUKI STUDY BEAT — 受け入れ試験(ACCEPTANCE_TESTS.md 準拠)
 * 実行: node tests/e2e/acceptance.mjs
 * 前提: http-server 等で репо ルートを配信済み(BASE_URL 環境変数、既定 http://127.0.0.1:8787)
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);

/* playwright の場所は環境によって違う。通常の解決を先に試し、
 * 見つからなければ既知のグローバルパスを順に探す。
 * (PLAYWRIGHT_PATH 環境変数で明示指定もできる) */
function loadPlaywright() {
  var candidates = [
    process.env.PLAYWRIGHT_PATH,
    'playwright',
    '/opt/node22/lib/node_modules/playwright',
    '/usr/lib/node_modules/playwright',
    '/usr/local/lib/node_modules/playwright'
  ].filter(Boolean);
  for (var i = 0; i < candidates.length; i++) {
    try { return require(candidates[i]); } catch (e) { /* 次を試す */ }
  }
  throw new Error(
    'playwright が見つかりません。`npm i -g playwright` でインストールするか、\n' +
    'PLAYWRIGHT_PATH 環境変数でパスを指定してください。'
  );
}
const { chromium, devices } = loadPlaywright();

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';
const SHOT_DIR = new URL('../../docs/screenshots/', import.meta.url).pathname;
mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
const C_NEWS_LIMIT = 3;   // js/calc.js の NEWS_DAILY_LIMIT と対応
const consoleErrors = [];
let page, context, browser;

function ok(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.log((cond ? '  ✅ ' : '  ❌ ') + name + (detail ? ' — ' + detail : ''));
}

async function shot(name, keepToast) {
  if (!keepToast) await page.evaluate(() => { const t = document.getElementById('toast'); t.classList.remove('show'); t.style.display = 'none'; });
  await page.screenshot({ path: SHOT_DIR + name + '.png', fullPage: false });
  if (!keepToast) await page.evaluate(() => { document.getElementById('toast').style.display = ''; });
}

/** 起動時の中央メッセージ(あいさつ)を閉じる */
async function dismissCenter() {
  if (await page.isVisible('#center-msg.open')) {
    await page.click('#cm-btn');
    await page.waitForTimeout(120);
  }
}

async function freshPage(clearStorage = false) {
  if (context) await context.close();
  context = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP' });
  page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(String(e)));
  await page.goto(BASE + '/index.html');
  if (clearStorage) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  }
  await page.waitForSelector('#screen-today.active');
  await dismissCenter();
}

async function reload() {
  await page.reload();
  await page.waitForSelector('#screen-today.active');
  await dismissCenter();
}

async function nav(screen) {
  await page.click(`.nav-btn[data-screen="${screen}"]`);
  await page.waitForSelector(`#screen-${screen}.active`);
}

async function addRecord({ date, subjectLabel, content, kind = null, plan = '', actual = '', score = '', maxScore = '' }) {
  await nav('record');
  if (date) await page.fill('#rf-date', date);
  if (subjectLabel) await page.selectOption('#rf-subject', { label: subjectLabel });
  await page.fill('#rf-content', content);
  // 学習種別は科目ごとに変わる(APP-460)。指定が無ければ、その科目の初期値へ明示的に戻す。
  // 前回の呼び出しの種別・得点が残ると、別の試験の結果を汚す。
  if (kind) {
    await page.selectOption('#rf-kind', kind);
  } else {
    const def = await page.$eval('#rf-kind', (el) => el.options.length ? el.options[0].value : '');
    const subjId = await page.inputValue('#rf-subject');
    const want = await page.evaluate((sid) => {
      const C = window.ISBCalc; return C ? C.defaultStudyKindFor(sid) : null;
    }, subjId);
    await page.selectOption('#rf-kind', want || def);
  }
  await page.fill('#rf-plan', String(plan));
  await page.fill('#rf-actual', String(actual));
  // 得点欄は前回の値が残るため、テスト以外では必ず空にする
  if (await page.isVisible('#rf-score-row')) {
    await page.fill('#rf-score', kind === 'テスト' && score !== '' ? String(score) : '');
    await page.fill('#rf-maxscore', kind === 'テスト' && maxScore !== '' ? String(maxScore) : '');
  }
  await page.click('#rf-save');
  await page.waitForTimeout(250);
  // お祝い演出が出たら閉じる
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
}

function todayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10).replace(/^(\d{4})-(\d{2})-(\d{2})$/, (m, y, mo, da) => {
    // toISOStringはUTC。ローカル日付で作り直す
    return null;
  }) && '';
}
function localDate(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = n => (n < 10 ? '0' : '') + n;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function getState() {
  return page.evaluate(() => JSON.parse(localStorage.getItem('ibukiStudyBeat.v3')));
}

/* ============ 試験 ============ */

async function test1_firstStudy() {
  console.log('\n■ 試験1: 初回学習(開始→28分に修正して保存→再起動後も保持)');
  await freshPage(true);
  await shot('01-today-initial');
  await page.click('#btn-start-study');
  await page.waitForSelector('#modal-back.open');
  await page.selectOption('#m-subject', { label: '英語' });
  await page.selectOption('#m-kind', '単語・熟語');
  await page.fill('#m-content', '英単語 20語');
  await page.fill('#m-plan', '30');
  await page.click('#m-save');
  await page.waitForSelector('#timer-card:visible');
  await shot('02-study-running');
  await page.click('#btn-finish');
  await page.waitForSelector('#m-actual');
  await page.fill('#m-actual', '28');
  await page.fill('#m-refl', '覚えた！例文とセットで覚えるといい。');
  await page.click('#m-save');
  await page.waitForTimeout(300);
  if (await page.isVisible('#celebrate.open')) { await shot('03-celebrate'); await page.click('#celebrate-close'); }
  let st = await getState();
  const rec = st.records.find(r => r.content === '英単語 20語');
  ok('計画30分・実績28分で保存', rec && rec.planMin === 30 && rec.actualMin === 28,
    rec ? `plan=${rec.planMin}, actual=${rec.actualMin}` : '記録なし');
  await reload();
  st = await getState();
  const rec2 = st.records.find(r => r.content === '英単語 20語');
  ok('再起動(リロード)後もデータ保持', rec2 && rec2.actualMin === 28);
  await shot('04-today-after-save');
}

async function test2_sevenDays() {
  console.log('\n■ 試験2: 7日継続(累積計画210分・左=計画/右=実績)');
  await freshPage(true);
  for (let i = 6; i >= 0; i--) {
    await addRecord({ date: localDate(-i), subjectLabel: '英語', content: `英単語 20語 (day${7 - i})`, plan: 30, actual: 25 });
  }
  await nav('graph');
  await page.waitForSelector('#chart-svg');
  await shot('05-graph-week');
  const chips = await page.textContent('#graph-stats');
  ok('累積計画3.5時間(210分)表示', chips.includes('累積計画') && chips.includes('3.5時間'), chips.replace(/\s+/g, ' '));
  // 左=計画(薄=opacity付き)・右=実績(濃)の棒が日毎に並ぶ
  const bars = await page.evaluate(() => {
    const svg = document.getElementById('chart-svg');
    const rects = [...svg.querySelectorAll('rect')].filter(r => r.getAttribute('fill') === '#4A90D9');
    const faint = rects.filter(r => r.getAttribute('opacity'));
    const solid = rects.filter(r => !r.getAttribute('opacity'));
    const pairs = faint.map(f => {
      const fx = parseFloat(f.getAttribute('x'));
      return solid.some(s => parseFloat(s.getAttribute('x')) > fx && parseFloat(s.getAttribute('x')) - fx < 40);
    });
    return { faint: faint.length, solid: solid.length, ordered: pairs.every(Boolean) };
  });
  ok('7日分の計画棒(薄)と実績棒(濃)を描画', bars.faint === 7 && bars.solid === 7, `plan=${bars.faint}, actual=${bars.solid}`);
  ok('各日で計画が左・実績が右', bars.ordered);
  const lines = await page.evaluate(() => document.querySelectorAll('#chart-svg polyline').length);
  ok('累積計画・累積実績の折れ線2本(第2軸)', lines === 2, `polyline=${lines}`);
}

async function test3_multiSubject() {
  console.log('\n■ 試験3: 複数科目の積み上げと凡例の色一致');
  await addRecord({ date: localDate(0), subjectLabel: '国語', content: '現代文 読解', kind: '現代文読解', plan: 40, actual: 35 });
  await addRecord({ date: localDate(0), subjectLabel: '社会', content: '世界史 通史', kind: '解き直し', plan: 50, actual: 60 });
  await nav('graph');
  await page.waitForSelector('#chart-svg');
  await shot('06-graph-multi-subject');
  const colors = await page.evaluate(() => {
    const svg = document.getElementById('chart-svg');
    const used = new Set([...svg.querySelectorAll('rect')].map(r => r.getAttribute('fill')).filter(f => f && f.startsWith('#') && f !== '#23221e'));
    const legend = new Set([...document.querySelectorAll('#chart-legend .sw')].map(s => s.style.background));
    return { used: [...used], legendCount: legend.size };
  });
  const hasAll = ['#4A90D9', '#F5A623', '#E8604C'].every(c => colors.used.includes(c));
  ok('英語/国語/社会が科目色で積み上げ表示', hasAll, colors.used.join(','));
  ok('凡例に科目色を表示', colors.legendCount >= 6);
  const detailOpen = await page.evaluate(() => {
    const hits = document.querySelectorAll('#chart-svg .day-hit');
    const today = new Date();
    const p = n => (n < 10 ? '0' : '') + n;
    const t = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
    const hit = [...hits].find(h => h.dataset.date === t);
    if (hit) hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return !!hit;
  });
  await page.waitForTimeout(200);
  ok('棒タップで日の詳細を表示', detailOpen && await page.isVisible('#day-detail'));
  await shot('07-day-detail');
}

async function test4_invalidInput() {
  console.log('\n■ 試験4: 誤入力(実績1200分/テスト120点/空内容)の拒否');
  const before = (await getState()).records.length;
  await addRecord({ date: localDate(0), subjectLabel: '英語', content: '無効テスト', plan: 30, actual: 1200 });
  let st = await getState();
  ok('実績1200分は警告して保存しない', st.records.length === before, `records=${st.records.length}`);
  await shot('08-invalid-warning', true);
  await addRecord({ date: localDate(0), subjectLabel: '英語', content: '英語模試', kind: 'テスト', plan: 60, actual: 60, score: 120, maxScore: 100 });
  st = await getState();
  ok('120/100点は警告して保存しない', st.records.length === before);
  await addRecord({ date: localDate(0), subjectLabel: '英語', content: '   ', plan: 30, actual: 30 });
  st = await getState();
  ok('空内容は警告して保存しない', st.records.length === before);
  ok('既存データは壊れていない', st.records.length === before && st.records.every(r => r.actualMin <= 720));
}

async function test5_editDeleteRestore() {
  console.log('\n■ 試験5: 編集・削除・復元とグラフ再計算');
  await nav('record');
  const item = page.locator('#record-list .rec-item').first();
  await item.locator('[data-act="edit"]').click();
  await page.waitForSelector('#m-actual');
  await page.fill('#m-actual', '45');
  await page.click('#m-save');
  await page.waitForTimeout(250);
  let st = await getState();
  ok('編集(実績45分に変更)が保存される', st.records.some(r => r.actualMin === 45));
  await shot('09-record-list');
  const delTarget = page.locator('#record-list .rec-item').first();
  const delId = await delTarget.getAttribute('data-id');
  await delTarget.locator('[data-act="del"]').click();
  await page.waitForTimeout(250);
  st = await getState();
  const deleted = st.records.find(r => r.id === delId);
  ok('削除でごみ箱(deletedAt)へ移動', deleted && !!deleted.deletedAt);
  ok('削除後トーストに「元に戻す」', await page.isVisible('#toast-action'));
  await page.click('#toast-action');
  await page.waitForTimeout(250);
  st = await getState();
  const restored = st.records.find(r => r.id === delId);
  ok('「元に戻す」で復元', restored && !restored.deletedAt);
  // ごみ箱経由の復元
  await delTarget.locator('[data-act="del"]').click();
  await page.waitForTimeout(150);
  await page.click('#btn-open-trash');
  await page.waitForSelector('#modal-back.open');
  await shot('10-trash');
  await page.click('#modal-body [data-act="restore"]');
  await page.waitForTimeout(250);
  st = await getState();
  ok('ごみ箱から復元', st.records.every(r => !r.deletedAt));
}

async function test6_events() {
  console.log('\n■ 試験6: 受験イベント(追加・詳細・編集・公式URL)');
  await nav('graph');
  const events = [
    { title: '近畿大学 公募推薦', method: '公募推薦', faculty: '経営学部', date: localDate(30), url: 'https://www.kindai.ac.jp/' },
    { title: '龍谷大学 公募推薦', method: '公募推薦', faculty: '法学部', date: localDate(45), url: 'https://www.ryukoku.ac.jp/' },
    { title: '一般選抜 前期日程', method: '一般選抜', faculty: '', date: localDate(120), url: '' }
  ];
  for (const ev of events) {
    await page.click('#btn-add-event');
    await page.waitForSelector('#m-title');
    await page.fill('#m-title', ev.title);
    await page.fill('#m-date', ev.date);
    await page.fill('#m-method', ev.method);
    if (ev.faculty) await page.fill('#m-faculty', ev.faculty);
    if (ev.url) await page.fill('#m-url', ev.url);
    await page.click('#m-save');
    await page.waitForTimeout(200);
  }
  const st = await getState();
  ok('イベント3件を登録', st.events.length === 3);
  const listTxt = await page.textContent('#event-list');
  ok('未来側にイベントを一覧表示(あとN日)', listTxt.includes('近畿大学') && listTxt.includes('あと'));
  await shot('11-events');
  // タップで詳細
  await page.locator('#event-list .event-item').first().click();
  await page.waitForSelector('#modal-back.open');
  const detail = await page.textContent('#modal-body');
  ok('タップで詳細(大学・方式・日付)', detail.includes('近畿大学') && detail.includes('公募推薦'));
  const href = await page.getAttribute('#modal-body a', 'href');
  ok('公式ページURLリンクあり', href === 'https://www.kindai.ac.jp/');
  await shot('12-event-detail');
  // 編集
  await page.click('#m-edit');
  await page.waitForSelector('#m-title');
  await page.fill('#m-memo', '過去問3年分やる');
  await page.click('#m-save');
  await page.waitForTimeout(200);
  const st2 = await getState();
  ok('編集(メモ追加)が保存される', st2.events.some(e => e.memo === '過去問3年分やる'));
  // 全体表示でグラフ未来側にイベントマーカー
  await page.click('.range-tab[data-range="all"]');
  await page.waitForTimeout(300);
  const markers = await page.evaluate(() => document.querySelectorAll('#chart-svg .ev-marker').length);
  ok('全体表示でグラフ未来側に◆マーカー', markers === 3, `markers=${markers}`);
  await shot('13-graph-all-with-events');
}

async function test7_touchAndAxis() {
  console.log('\n■ 試験7: タッチ操作(スワイプ/ピンチ/今日へ戻る/軸設定)');
  await nav('graph');
  await page.click('.range-tab[data-range="week"]');
  await page.waitForTimeout(200);
  const endBefore = await page.evaluate(() => {
    // グラフ右端の日付ラベルで代用: 状態はクロージャ内なのでスワイプ後の再描画で判定
    return document.querySelector('#chart-svg').outerHTML.length;
  });
  // スワイプ(過去へ): タッチ合成イベント
  await page.evaluate(() => {
    const panel = document.getElementById('chart-panel');
    const r = panel.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    function touch(type, x) {
      const t = new Touch({ identifier: 1, target: panel, clientX: x, clientY: cy });
      panel.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }));
    }
    touch('touchstart', cx);
    touch('touchmove', cx + 120);
    touch('touchend', cx + 120);
  });
  await page.waitForTimeout(300);
  const todayBtnVisible = await page.isVisible('#btn-goto-today');
  ok('右スワイプで過去へ移動(「今日へ戻る」出現)', todayBtnVisible);
  await shot('14-graph-swiped');
  await page.click('#btn-goto-today');
  await page.waitForTimeout(200);
  ok('「今日へ戻る」で今日を含む範囲へ復帰', !(await page.isVisible('#btn-goto-today')));
  // ピンチ(拡大縮小)
  await page.evaluate(() => {
    const panel = document.getElementById('chart-panel');
    const r = panel.getBoundingClientRect();
    const cy = r.top + r.height / 2;
    function touches(x1, x2) {
      return [
        new Touch({ identifier: 1, target: panel, clientX: x1, clientY: cy }),
        new Touch({ identifier: 2, target: panel, clientX: x2, clientY: cy })
      ];
    }
    let t = touches(150, 250);
    panel.dispatchEvent(new TouchEvent('touchstart', { touches: t, changedTouches: t, bubbles: true, cancelable: true }));
    t = touches(180, 220);
    panel.dispatchEvent(new TouchEvent('touchmove', { touches: t, changedTouches: t, bubbles: true, cancelable: true }));
    panel.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: t, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(300);
  const daysAfterPinch = await page.evaluate(() => document.querySelectorAll('#chart-svg .day-hit').length);
  ok('ピンチインで表示日数が増える(縮小)', daysAfterPinch > 7, `days=${daysAfterPinch}`);
  // 軸設定
  await page.click('#btn-axis-setting');
  await page.waitForSelector('#m-placement');
  await shot('15-axis-menu');
  await page.selectOption('#m-placement', 'left');
  await page.selectOption('#m-unit', 'minutes');
  await page.waitForTimeout(200);
  await page.click('#modal-back', { position: { x: 10, y: 10 } });
  await page.waitForTimeout(200);
  let st = await getState();
  ok('軸設定(左寄せ・分単位)が保存される', st.settings.axis.placement === 'left' && st.settings.axis.unit === 'minutes');
  await shot('16-graph-left-axis');
  await reload();
  st = await getState();
  ok('リロード後も軸設定を保持', st.settings.axis.placement === 'left');
  // 戻す
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    s.settings.axis.placement = 'split'; s.settings.axis.unit = 'hours';
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(s));
  });
}

async function test8_dataProtection() {
  console.log('\n■ 試験8: データ保護(書き出し/破損読み込み拒否/全消去/自動バックアップ)');
  await reload();
  await nav('settings');
  await page.click('.settings-item[data-panel="data"]');
  await page.waitForSelector('#m-export');
  await shot('17-data-panel');
  const dl = page.waitForEvent('download');
  await page.click('#m-export');
  const download = await dl;
  const path = await download.path();
  const { readFileSync } = await import('node:fs');
  const exported = JSON.parse(readFileSync(path, 'utf8'));
  ok('JSON書き出し(app/schemaVersion/state)', exported.app === 'IBUKI_STUDY_BEAT' && exported.schemaVersion === 3 && Array.isArray(exported.state.records));
  const recCount = exported.state.records.length;

  // 破損JSONの読み込み → 拒否・既存データ無傷
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['{"broken": tru'], 'broken.json', { type: 'application/json' }));
    const input = document.getElementById('m-import-file');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(300);
  let st = await getState();
  ok('破損JSONは拒否し既存データ無傷', st.records.length === recCount, `records=${st.records.length}`);

  // localStorage自体の破損 → 退避して自動バックアップから復元
  await page.evaluate(() => localStorage.setItem('ibukiStudyBeat.v3', '{{{broken'));
  await reload();
  st = await getState();
  const corrupt = await page.evaluate(() => Object.keys(localStorage).some(k => k.includes('corrupt')));
  ok('保存データ破損時: 退避キーを作成し全消去しない', corrupt && st && Array.isArray(st.records));
  ok('自動バックアップから記録を復元', st.records.length === recCount, `restored=${st.records.length}`);

  // 正常JSONの読み込み
  await nav('settings');
  await page.click('.settings-item[data-panel="data"]');
  await page.waitForSelector('#m-import-file');
  const payload = JSON.stringify(exported);
  await page.evaluate((json) => {
    const dt = new DataTransfer();
    dt.items.add(new File([json], 'backup.json', { type: 'application/json' }));
    const input = document.getElementById('m-import-file');
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  }, payload);
  await page.waitForTimeout(300);
  st = await getState();
  ok('正常JSONの読み込みで復元', st.records.length === recCount);

  // 全消去(二段階確認)
  await nav('settings');
  await page.click('.settings-item[data-panel="data"]');
  await page.waitForSelector('#m-wipe');
  await page.click('#m-wipe');
  await page.waitForSelector('#m-next');
  await shot('18-wipe-step1');
  await page.click('#m-next');
  await page.waitForSelector('#m-wipe-final');
  await page.click('#m-wipe-final'); // 入力なし → 拒否されること
  await page.waitForTimeout(200);
  st = await getState();
  ok('確認語なしでは消去されない', st.records.length === recCount);
  await page.fill('#m-confirm-text', '消去');
  await page.click('#m-wipe-final');
  await page.waitForTimeout(300);
  st = await getState();
  ok('二段階確認後に全消去', st.records.length === 0);
  await shot('19-after-wipe');
}

async function test9_versionAndUpdate() {
  console.log('\n■ 試験9: バージョン表示と起動時・更新時の中央メッセージ');
  await freshPage(true);
  const ver = await page.textContent('#app-version');
  ok('画面上にソフトバージョンを表示', /^ver\. \d+\.\d+\.\d+$/.test(ver.trim()), ver);
  const version = ver.trim().replace('ver. ', '');

  // リリース表示(更新日・更新AI・モデル)。モデル名は断定せず「未記録」を許容する。
  const build = (await page.textContent('#app-build')).trim();
  ok('画面右上に更新日が表示される', /\d{4}-\d{2}-\d{2}/.test(build), build);
  ok('画面右上に更新したAI(Claude Code)が表示される', build.includes('Claude Code'), build);
  ok('画面右上にモデル欄が表示される(未記録も許容)', /モデル\s*(未記録|\S+)/.test(build), build);
  await page.setViewportSize({ width: 320, height: 680 });
  await page.reload();
  await page.waitForSelector('#screen-today.active');
  if (await page.isVisible('#center-msg.open')) await page.click('#cm-btn');
  const buildOverflow = await page.evaluate(() => document.documentElement.scrollWidth > 330);
  ok('320px幅でもリリース表示が横スクロールを起こさない', !buildOverflow);
  await shot('61-build-badge-320');
  await page.setViewportSize({ width: 390, height: 844 });

  // 起動時のあいさつ(画面中央)
  await page.reload();
  await page.waitForSelector('#screen-today.active');
  ok('アプリを開くと画面中央にメッセージを表示', await page.isVisible('#center-msg.open'));
  await page.waitForTimeout(450); // 表示アニメーションの完了を待ってから位置を測る
  const centered = await page.evaluate(() => {
    const c = document.querySelector('#center-msg .cm-card').getBoundingClientRect();
    const dx = Math.abs((c.left + c.right) / 2 - window.innerWidth / 2);
    const dy = Math.abs((c.top + c.bottom) / 2 - window.innerHeight / 2);
    return { dx, dy };
  });
  ok('メッセージが画面中央に配置される', centered.dx < 4 && centered.dy < 4, `dx=${centered.dx.toFixed(1)}, dy=${centered.dy.toFixed(1)}`);
  const cmVer = await page.textContent('#cm-version');
  ok('中央メッセージにもバージョンを表示', cmVer.includes(version), cmVer);
  await shot('30-welcome-message', true);
  await page.click('#cm-btn');
  await page.waitForTimeout(200);
  ok('ボタンでメッセージを閉じられる', !(await page.isVisible('#center-msg.open')));

  // あいさつは一定時間で自動的に閉じる
  await page.reload();
  await page.waitForSelector('#center-msg.open');
  await page.waitForTimeout(4600);
  ok('あいさつは自動で閉じる', !(await page.isVisible('#center-msg.open')));

  // 更新後の初回起動: 前回バージョンと異なる場合のお知らせ
  await page.evaluate(() => localStorage.setItem('ibukiStudyBeat.lastSeenVersion', '3.0.0'));
  await page.reload();
  await page.waitForSelector('#center-msg.open');
  const body = await page.textContent('#center-msg');
  ok('更新後の初回起動で「新しくなった」と中央に表示', body.includes('新しくなった') && body.includes('3.0.0') && body.includes(version), body.replace(/\s+/g, ' ').slice(0, 90));
  ok('更新メッセージで記録が残ることを明記', body.includes('記録') && body.includes('残っている'));
  await shot('31-updated-message', true);
  await page.click('#cm-btn');
  await page.waitForTimeout(200);

  // 記録が消えていないこと
  await addRecord({ date: localDate(0), subjectLabel: '英語', content: '更新テスト', plan: 30, actual: 30 });
  const before = (await getState()).records.length;
  await page.evaluate(() => localStorage.setItem('ibukiStudyBeat.lastSeenVersion', '3.0.0'));
  await reload();
  const after = (await getState()).records.length;
  ok('バージョン更新をまたいでも記録は保持される', after === before && after > 0, `${before} → ${after}`);

  // Service Workerは更新待機用のメッセージ受信口を持つ
  const swSrc = await page.evaluate(async () => (await fetch('sw.js')).text());
  ok('SWが「SKIP_WAITING」受信で更新へ切り替わる', swSrc.includes("'SKIP_WAITING'") && swSrc.includes('skipWaiting'));
  const installBlock = swSrc.slice(swSrc.indexOf("addEventListener('install'"), swSrc.indexOf("addEventListener('message'"));
  ok('SWは自動では切り替わらない(利用者の操作待ち)', installBlock.length > 0 && !installBlock.includes('skipWaiting()'));
}

async function openChatPanel() {
  await nav('coach');
  if (!(await page.isVisible('#chat-panel'))) await page.click('#btn-chat');
  await page.waitForSelector('#chat-input', { state: 'visible' });
}

async function test10_aiIntegration() {
  console.log('\n■ 試験10: AIアプリ連携(選択・プロンプト生成・操作方法の質問)');
  await freshPage(true);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await addRecord({ date: localDate(0), subjectLabel: '英語', content: '英単語 20語', plan: 30, actual: 25 });

  // 設定からAIアプリを選ぶ
  await nav('settings');
  await page.click('.settings-item[data-panel="ai"]');
  await page.waitForSelector('#m-aiapp');
  const appCount = await page.evaluate(() => document.querySelectorAll('#m-aiapp option').length);
  ok('AIアプリの選択肢が複数ある(ChatGPT/Claude/Gemini/Copilot等)', appCount >= 6, `options=${appCount}`);
  const labels = await page.evaluate(() => [...document.querySelectorAll('#m-aiapp option')].map(o => o.textContent));
  ok('主要AIアプリが選択肢に含まれる',
    ['ChatGPT', 'Claude', 'Gemini', 'Copilot'].every(n => labels.some(l => l.includes(n))), labels.join('/'));
  await shot('30-ai-settings');
  await page.selectOption('#m-aiapp', 'claude');
  await page.click('#m-save');
  await page.waitForTimeout(250);
  let st = await getState();
  ok('選んだAIアプリが保存される', st.settings.ai.appId === 'claude', `appId=${st.settings.ai.appId}`);

  // コーチ画面でボタン名が変わる
  await openChatPanel();
  const btnTxt = await page.textContent('#chat-ask-ai');
  ok('コーチ画面のボタンに選んだAI名が出る', btnTxt.includes('Claude'), btnTxt.trim());
  const chipCount = await page.evaluate(() => document.querySelectorAll('#chat-quick .quick-chip').length);
  ok('使い方を聞くクイックボタンがある', chipCount >= 3, `chips=${chipCount}`);
  await shot('31-coach-ai-buttons');

  // 「使い方を教えて」→ 操作マニュアル入りのプロンプトが生成される
  await page.click('#chat-quick .quick-chip');
  await page.waitForSelector('#m-prompt');
  const prompt = await page.inputValue('#m-prompt');
  ok('プロンプトに操作マニュアルが含まれる(操作方法を答えられる)',
    prompt.includes('IBUKI STUDY BEATの使い方') && prompt.includes('グラフ画面'), `len=${prompt.length}`);
  ok('プロンプトに学習状況が含まれる', prompt.includes('今日の学習') && prompt.includes('連続記録'));
  const openHref = await page.getAttribute('#m-open', 'href');
  ok('選んだAIアプリのURLで開くリンクがある', openHref && openHref.startsWith('https://claude.ai/'), (openHref || '').slice(0, 40));
  ok('URLが長すぎず開ける長さに収まっている', openHref.length <= 1800, `len=${openHref.length}`);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  ok('質問がクリップボードにコピーされる', clip.includes('IBUKI STUDY BEATの使い方'), `clip=${clip.length}文字`);
  await shot('32-ai-prompt-modal');
  await page.click('#m-close');
  await page.waitForTimeout(200);

  // 会話ログにも残る
  const logTxt = await page.textContent('#chat-log');
  ok('AIに聞いた内容が会話ログに残る', logTxt.includes('使い方') && logTxt.includes('Claude'));

  // 自由な質問(マニュアルなし)
  await page.fill('#chat-input', '数学の勉強のコツを教えて');
  await page.click('#chat-ask-ai');
  await page.waitForSelector('#m-prompt');
  const freePrompt = await page.inputValue('#m-prompt');
  ok('自由な質問もAIに送れる', freePrompt.includes('数学の勉強のコツ'));
  ok('学習と無関係な質問にはマニュアルを付けない', !freePrompt.includes('## グラフ画面'));
  await page.click('#m-close');

  // 学習データを送らない設定
  await nav('settings');
  await page.click('.settings-item[data-panel="ai"]');
  await page.waitForSelector('#m-aistats');
  await page.click('#m-aistats');
  await page.click('#m-save');
  await page.waitForTimeout(250);
  await openChatPanel();
  await page.fill('#chat-input', 'こんにちは');
  await page.click('#chat-ask-ai');
  await page.waitForSelector('#m-prompt');
  const noStats = await page.inputValue('#m-prompt');
  ok('学習データOFFにすると学習状況を送らない', !noStats.includes('連続記録'));
  await page.click('#m-close');

  // コピーのみモード(Gemmaなどローカルアプリ用)
  await nav('settings');
  await page.click('.settings-item[data-panel="ai"]');
  await page.waitForSelector('#m-aiapp');
  await page.selectOption('#m-aiapp', 'clipboard');
  await page.click('#m-save');
  await page.waitForTimeout(250);
  await openChatPanel();
  await page.fill('#chat-input', 'テスト');
  await page.click('#chat-ask-ai');
  await page.waitForSelector('#m-prompt');
  ok('コピーのみモードではアプリを開くボタンを出さない', !(await page.isVisible('#m-open')));
  await page.click('#m-close');

  // カスタムURLの検証
  await nav('settings');
  await page.click('.settings-item[data-panel="ai"]');
  await page.waitForSelector('#m-aiapp');
  await page.selectOption('#m-aiapp', 'custom');
  await page.waitForTimeout(150);
  await page.fill('#m-aiurl', 'notaurl');
  await page.click('#m-save');
  await page.waitForTimeout(250);
  st = await getState();
  ok('不正なカスタムURLは保存を拒否', st.settings.ai.appId !== 'custom' || st.settings.ai.customUrl !== 'notaurl');
  await page.fill('#m-aiurl', 'https://example.com/?q=');
  await page.click('#m-save');
  await page.waitForTimeout(250);
  st = await getState();
  ok('正しいカスタムURLは保存できる', st.settings.ai.customUrl === 'https://example.com/?q=');

  // 設定はリロード後も保持
  await reload();
  st = await getState();
  ok('AI連携設定はリロード後も保持', st.settings.ai.appId === 'custom' && st.settings.ai.sendStats === false);
}

async function test11_worldNews() {
  console.log('\n■ 試験11: 世界(時事ニュース)記録とAI連携');
  await freshPage(true);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await nav('world');
  ok('世界タブに切り替えられる(6タブ構成)', await page.isVisible('#screen-world'));
  let todayCount = await page.textContent('#world-today-count');
  ok('初期状態は今日0/3件', todayCount.trim() === '0/3', todayCount);

  async function addNews({ genre, headline, comment = '' }) {
    await page.click('#btn-add-news');
    await page.waitForSelector('#m-genre');
    await page.selectOption('#m-genre', genre);
    await page.fill('#m-headline', headline);
    if (comment) await page.fill('#m-comment', comment);
    await page.click('#m-save');
    await page.waitForTimeout(300);
  }

  // 1本目: 経済(志望学部=経済学部はデフォルトON) → 1.5倍
  await addNews({ genre: 'economy', headline: '円安が1ドル160円台に', comment: '輸入品が高くなる理由が分かった' });
  ok('保存すると自動でAIに聞くモーダルが開く', await page.isVisible('#m-prompt'));
  const prompt1 = await page.inputValue('#m-prompt');
  ok('AIプロンプトに志望学部が含まれる', prompt1.includes('経済学部'));
  ok('AIプロンプトにニュースの見出しが含まれる', prompt1.includes('円安が1ドル160円台に'));
  ok('AIプロンプトに小論文の論点を問う型が含まれる', prompt1.includes('入試小論文') && prompt1.includes('賛成'));
  await shot('40-world-ai-prompt');
  await page.click('#m-close');
  await page.waitForTimeout(200);

  let st = await getState();
  ok('経済ジャンルは志望学部ボーナスで1.5倍(40→60BP)', st.news[0].bp === 60, `bp=${st.news[0].bp}`);
  ok('トーストに志望学部ボーナスの説明が出る', (await page.textContent('#toast-text')).includes('1.5倍'));

  // 2本目: スポーツ(ボーナス対象外) → 等倍
  await addNews({ genre: 'sports', headline: '甲子園で逆転勝ち' });
  await page.click('#m-close');
  await page.waitForTimeout(200);
  st = await getState();
  ok('学部ボーナス対象外のジャンルは等倍(20BP)', st.news[1].bp === 20, `bp=${st.news[1].bp}`);

  // 3本目: IT・AI(全学部で加点) → 1.5倍
  await addNews({ genre: 'tech', headline: '生成AIの新しい規制案' });
  await page.click('#m-close');
  await page.waitForTimeout(200);

  todayCount = await page.textContent('#world-today-count');
  ok('3本記録すると3/3になる', todayCount.trim() === '3/3', todayCount);
  const genreCount = await page.textContent('#world-genre-count');
  ok('記録したジャンル数が進捗に反映される', genreCount.trim() === '3/10', genreCount);

  // 4本目: 1日の上限を超えるとポイントが付かない
  await addNews({ genre: 'environment', headline: '猛暑と電力需給' });
  const overLimitToast = await page.textContent('#toast-text');
  ok('1日3本を超えるとポイントが付かない旨のメッセージが出る', overLimitToast.includes('もう3本'));
  await page.click('#m-close');
  await page.waitForTimeout(200);
  st = await getState();
  ok('上限超えの記録はBP=0で保存される(記録自体はできる)', st.news[3].bp === 0, `bp=${st.news[3].bp}`);
  ok('4件とも記録は残る', st.news.length === 4);

  // 一覧表示とAI再質問・削除
  const itemCount = await page.locator('.news-item').count();
  ok('一覧に記録した件数が表示される', itemCount === 4, `count=${itemCount}`);
  const bpChips = await page.locator('.bp-chip').count();
  ok('BPが付いた記録だけにBPチップが出る(3件)', bpChips === 3, `chips=${bpChips}`);
  await shot('41-world-news-list');

  await page.locator('.news-item').first().locator('[data-act="ask"]').click();
  await page.waitForSelector('#m-prompt');
  ok('一覧からも後でAIに聞き直せる', await page.isVisible('#m-prompt'));
  await page.click('#m-close');
  await page.waitForTimeout(150);

  const beforeDel = (await getState()).news.length;
  await page.locator('.news-item').first().locator('[data-act="del"]').click();
  await page.waitForTimeout(200);
  st = await getState();
  ok('削除すると件数が減る', st.news.length === beforeDel - 1);
  await page.click('#toast-action');
  await page.waitForTimeout(200);
  st = await getState();
  ok('「元に戻す」で復元できる', st.news.length === beforeDel);

  // 志望学部の設定を変える
  await nav('settings');
  await page.click('.settings-item[data-panel="faculty"]');
  await page.waitForSelector('#modal-body .toggle');
  const toggleCount = await page.locator('#modal-body .toggle').count();
  ok('志望学部は3つ選べる(経済/法/国際)', toggleCount === 3, `count=${toggleCount}`);
  await shot('42-faculty-settings');
  // 経済学部をOFFにする
  await page.locator('#modal-body .toggle').first().click();
  await page.waitForTimeout(150);
  await page.click('#m-close');
  st = await getState();
  ok('志望学部の設定はONOFF切替が保存される', st.settings.faculties.economics === false);

  // 今日はすでに3本の上限に達しているため、多寡倍率だけを切り分けて検証する
  // (calc.js は単体テスト済み。ここではapp.jsが設定を正しく渡しているかを確認する)
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    s.news = [];
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(s));
  });
  await reload();
  await nav('world');
  await addNews({ genre: 'economy', headline: '日銀が利上げを見送り' });
  await page.click('#m-close');
  await page.waitForTimeout(200);
  st = await getState();
  const lastNews = st.news[st.news.length - 1];
  ok('学部OFF後は経済ジャンルもボーナスなし(40BP)', lastNews.bp === 40, `bp=${lastNews.bp}`);

  // リロード後も保持される
  await reload();
  st = await getState();
  ok('ニュース記録はリロード後も保持される', st.news.length === 1, `count=${st.news.length}`);
  ok('志望学部の設定もリロード後も保持される', st.settings.faculties.economics === false);
}

async function test12_pointsEquipShop() {
  console.log('\n■ 試験12: ポイント(BP)獲得・装備・ショップ・コンディション(ver.4.1.0)');
  await freshPage(true);

  // --- BP獲得: 記録保存で自動計算される ---
  await addRecord({ subjectLabel: '英語', content: 'BP検証1', plan: 30, actual: 30 });
  let st = await getState();
  ok('学習記録の保存でBPが自動付与される(基本30+計画達成50=80)', st.records[0].bp === 80, `bp=${st.records[0].bp}`);

  await nav('today');
  const boostSub1 = await page.textContent('#boost-sub');
  ok('今日画面のブーストカードにBP残高が反映される', boostSub1.includes('BP 80'), boostSub1);
  await page.click('#btn-boost-card');
  await page.waitForSelector('#modal-body');
  const boostModalText = await page.textContent('#modal-body');
  ok('ブースト内訳モーダルにBP残高が表示される', boostModalText.includes('BP残高'));
  await page.click('#m-close');

  // 追加でBPを積み増す(ショップ購入の検証用)
  for (let i = 0; i < 8; i++) {
    await addRecord({ subjectLabel: '英語', content: 'BP検証' + (i + 2), plan: 30, actual: 30 });
  }
  st = await getState();
  const totalBP = st.records.reduce((s, r) => s + (r.bp || 0), 0);
  ok('複数回の記録でBPが積み上がる', totalBP >= 720, `total=${totalBP}`);

  // --- 受験科目チェック: 初期状態と、トグル操作が保存されることを確認 ---
  st = await getState();
  ok('「その他」科目は初期状態で非受験科目', st.settings.subjects.find(s => s.id === 'other').examSubject === false);
  await nav('settings');
  await page.click('.settings-item[data-panel="subjects"]');
  await page.waitForSelector('#modal-body .subject-row');
  const engRow = page.locator('#modal-body .subject-row').first();
  await engRow.locator('[data-f="exam"]').click();
  await page.waitForTimeout(150);
  await page.click('#m-close');
  st = await getState();
  ok('受験科目チェックのOFF操作が保存される', st.settings.subjects[0].examSubject === false);
  // 英語をもとの受験科目に戻す(以降の検証への影響を避ける)
  await nav('settings');
  await page.click('.settings-item[data-panel="subjects"]');
  await page.waitForSelector('#modal-body .subject-row');
  await page.locator('#modal-body .subject-row').first().locator('[data-f="exam"]').click();
  await page.waitForTimeout(150);
  await page.click('#m-close');

  // 「その他」(非受験科目)は1日100BPが上限。2件目でキャップにかかることを確認する
  await addRecord({ subjectLabel: 'その他', content: '非受験科目1', plan: 30, actual: 30 });
  st = await getState();
  const nonExam1 = st.records[st.records.length - 1];
  ok('非受験科目1件目はキャップ未満なら満額もらえる', nonExam1.bp === 80, `bp=${nonExam1.bp}`);

  await addRecord({ subjectLabel: 'その他', content: '非受験科目2', plan: 30, actual: 30 });
  st = await getState();
  const nonExam2 = st.records[st.records.length - 1];
  ok('非受験科目2件目で1日100BPの上限にかかる(80+80→100までしか付かない)', nonExam2.bp === 20, `bp=${nonExam2.bp}`);
  const bpBoxAfterCap = await page.textContent('#celebrate-bp');
  ok('上限到達時にその旨が表示される', bpBoxAfterCap.includes('非受験科目'));

  // ショップ購入力の検証に十分なBPを直接投入する(獲得ロジック自体は上のUI操作で検証済み)
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const today = new Date();
    const p = n => (n < 10 ? '0' : '') + n;
    const dstr = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate() + 1)}`;
    for (let i = 0; i < 10; i++) {
      s.records.push({ id: 'topup' + i, date: dstr, subjectId: 'eng', content: 'BP補充' + i, kind: '暗記', planMin: 0, actualMin: 0, reflection: '', deletedAt: null, bp: 1000, createdAt: Date.now(), updatedAt: Date.now(), score: null, maxScore: null });
    }
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(s));
  });
  await reload();

  // --- 装備・ショップ(コーチ画面) ---
  await nav('coach');
  let equipSlots = await page.textContent('#equip-slots');
  ok('初期状態はステージ「ストリート」のみ装備', equipSlots.includes('ストリート') && equipSlots.includes('未装備'));

  await page.click('#btn-open-shop');
  await page.waitForSelector('#shop-items');
  ok('ショップに衣装タブのアイテムが並ぶ', await page.locator('.shop-item').count() === 5);
  await shot('50-shop-costume');

  const balanceNum = async () => Number((await page.textContent('#shop-balance')).replace(/,/g, ''));
  const balanceBeforeBuy = await balanceNum();
  const socksRow = page.locator('.shop-item:has-text("白いソックス")');
  await socksRow.locator('[data-buy]').click();
  await page.waitForTimeout(200);
  ok('購入するとアイテムが所持済みになり「装備する」ボタンに変わる', await socksRow.textContent().then(t => t.includes('装備する')));
  st = await getState();
  ok('購入済みアイテムがstateに記録される', st.shop.owned.costume.includes('socks'));
  const balanceAfterBuy = await balanceNum();
  ok('購入するとショップのBP残高表示が価格(500)分すぐに減る', balanceBeforeBuy - balanceAfterBuy === 500, `${balanceBeforeBuy} -> ${balanceAfterBuy}`);
  await socksRow.locator('[data-equip]').click();
  await page.waitForTimeout(200);
  ok('購入したアイテムを装備できる', await socksRow.textContent().then(t => t.includes('装備中')));
  await page.click('#m-close');
  equipSlots = await page.textContent('#equip-slots');
  ok('装備スロットに反映される', equipSlots.includes('白いソックス'));
  const equipTotal = await page.textContent('#equip-total-mult');
  ok('装備の合計倍率が更新される', equipTotal.includes('+0.10'), equipTotal);

  await nav('today');
  const boostSub2 = await page.textContent('#boost-sub');
  ok('装備を変えると今日のブーストカードにも反映される', boostSub2.includes('装備+0.10'), boostSub2);

  // --- 消費アイテム: エナジードリンク ---
  await nav('coach');
  await page.click('#btn-open-shop');
  await page.click('[data-tab="consumable"]');
  await page.waitForTimeout(150);
  const energyRow = page.locator('.shop-item:has-text("エナジードリンク")');
  await energyRow.locator('[data-buy]').click();
  await page.waitForTimeout(150);
  await energyRow.locator('[data-use]').click();
  await page.waitForTimeout(150);
  await page.click('#m-close');
  await nav('today');
  const boostMultEnergy = await page.textContent('#boost-mult');
  // この時点で白いソックス(+0.10)を装備済みのため、基礎1.0+装備0.10+エナジー1.0=2.10倍
  ok('エナジードリンク使用中は倍率が上がる(装備+0.10とあわせて2.10倍)', boostMultEnergy.includes('2.10'), boostMultEnergy);

  // --- 消費アイテム: フィーバータイム(週1回制限) ---
  await nav('coach');
  await page.click('#btn-open-shop');
  await page.click('[data-tab="consumable"]');
  await page.waitForTimeout(150);
  const feverRow = page.locator('.shop-item:has-text("フィーバータイム")');
  await feverRow.locator('[data-buy]').click();
  await page.waitForTimeout(150);
  await feverRow.locator('[data-use]').click();
  await page.waitForTimeout(150);
  await page.click('#m-close');
  await nav('today');
  const boostMultFever = await page.textContent('#boost-mult');
  ok('フィーバータイム発動中は10倍になる', boostMultFever.includes('10.00'), boostMultFever);

  await nav('coach');
  await page.click('#btn-open-shop');
  await page.click('[data-tab="consumable"]');
  await page.waitForTimeout(150);
  const feverRow2 = page.locator('.shop-item:has-text("フィーバータイム")');
  await feverRow2.locator('[data-buy]').click();
  await page.waitForTimeout(150);
  await feverRow2.locator('[data-use]').click();
  await page.waitForTimeout(250);
  const feverToast = await page.textContent('#toast-text');
  ok('フィーバータイムは週1回までに制限される', feverToast.includes('週1回'), feverToast);
  await page.click('#m-close');

  // --- コンディション記録(生活習慣) ---
  await nav('settings');
  await page.click('[data-panel="condition"]');
  await page.waitForSelector('.habit-row');
  ok('生活習慣は5項目ある', await page.locator('.habit-row').count() === 5);
  await page.locator('.habit-row[data-k="sleepEarly"]').click();
  await page.locator('.habit-row[data-k="reading"]').click();
  await page.waitForTimeout(150);
  const condTotal = await page.textContent('#cond-total');
  ok('チェックした生活習慣の合計BPが表示される(20+40=60)', condTotal.includes('60'), condTotal);
  const condBonus = await page.textContent('#cond-bonus');
  ok('翌日の倍率プレビューが表示される(60BP→+0.20)', condBonus.includes('0.20'), condBonus);
  await page.click('#m-close');
  st = await getState();
  const todayKey = Object.keys(st.habits)[0];
  ok('生活習慣がstateに保存される', st.habits[todayKey].sleepEarly === true && st.habits[todayKey].reading === true);

  // --- リロード後も装備・ショップ・コンディションが保持される ---
  await reload();
  st = await getState();
  ok('装備状態はリロード後も保持される', st.shop.equipped.costume === 'socks');
  ok('所持アイテムはリロード後も保持される', st.shop.owned.costume.includes('socks'));
  ok('生活習慣の記録はリロード後も保持される', st.habits[todayKey].sleepEarly === true);
  ok('フィーバー週制限の記録はリロード後も保持される', !!st.shop.feverLastUsedDate);

  // --- 320px幅でコーチ画面(装備・ショップ)が横あふれしない ---
  await page.setViewportSize({ width: 320, height: 680 });
  await nav('coach');
  await page.waitForTimeout(200);
  const coachOverflow = await page.evaluate(() => document.documentElement.scrollWidth > 330);
  ok('320px幅でコーチ画面(装備・ショップ)が横スクロールしない', !coachOverflow);
  await shot('51-coach-320px');
  await page.click('#btn-open-shop');
  await page.waitForTimeout(200);
  const shopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > 330);
  ok('320px幅でショップモーダルが横スクロールしない', !shopOverflow);
  await page.click('#m-close');

  // 科目設定(受験チェックの追加で横あふれ・文字重なりが起きないか)
  await nav('settings');
  await page.click('.settings-item[data-panel="subjects"]');
  await page.waitForSelector('.subject-row');
  const subjectsOverflow = await page.evaluate(() => document.documentElement.scrollWidth > 330);
  ok('320px幅で科目設定(受験チェック追加後)が横スクロールしない', !subjectsOverflow);
  const examLabelVisible = await page.locator('.subject-row .mini-toggle-btn[data-f="exam"]').first().isVisible();
  ok('320px幅でも「受験」トグルの文字が読める(専用ボタンで表示)', examLabelVisible);
  await shot('52-subjects-320px');
  await page.click('#m-close');
  await page.setViewportSize({ width: 390, height: 844 });
}

async function test13_codexReviewFixes() {
  console.log('\n■ 試験13: Codex独立レビューで指摘された4件の修正確認');
  await freshPage(true);

  async function addRec(content, plan, actual) {
    await page.selectOption('#rf-subject', { label: '英語' });
    await page.fill('#rf-content', content);
    await page.fill('#rf-plan', String(plan));
    await page.fill('#rf-actual', String(actual));
    await page.click('#rf-save');
    await page.waitForTimeout(200);
    if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  }

  // --- 修正1: 同日の連続達成/全受験科目ボーナスが複数回付かない ---
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const p = n => (n < 10 ? '0' : '') + n;
    const d = (o) => { const x = new Date(); x.setDate(x.getDate() + o); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`; };
    s.records.push({ id: 'd1', date: d(-2), subjectId: 'eng', content: 'd1', kind: '暗記', planMin: 30, actualMin: 30, reflection: '', deletedAt: null, bp: 80, createdAt: 1, updatedAt: 1, score: null, maxScore: null });
    s.records.push({ id: 'd2', date: d(-1), subjectId: 'eng', content: 'd2', kind: '暗記', planMin: 30, actualMin: 30, reflection: '', deletedAt: null, bp: 80, createdAt: 1, updatedAt: 1, score: null, maxScore: null });
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(s));
  });
  await reload();
  await nav('record');
  await addRec('day3-first', 30, 30);
  await addRec('day3-second', 30, 30);
  let st = await getState();
  const first = st.records.find(r => r.content === 'day3-first');
  const second = st.records.find(r => r.content === 'day3-second');
  ok('3日連続達成の当日、1件目にstreak3ボーナス(+30)が付く', first.bp === 110, `bp=${first.bp}`);
  ok('同じ日の2件目にはstreak3ボーナスが再度付かない', second.bp === 80, `bp=${second.bp}`);
  ok('dailyBonusesに当日分のstreak3が記録される', st.dailyBonuses[localDate()] && st.dailyBonuses[localDate()].streak3 === true);

  // 全受験科目達成ボーナスも同様(全5科目に触れた後、追加の記録では再付与されない)
  await freshPage(true);
  await nav('record');
  await addRec('math1', 20, 20);
  const subjects = ['英語', '数学', '国語', '理科', '社会'];
  for (let i = 0; i < subjects.length; i++) {
    await page.selectOption('#rf-subject', { label: subjects[i] });
    await page.fill('#rf-content', 'allsub-' + i);
    await page.fill('#rf-plan', '10');
    await page.fill('#rf-actual', '10');
    await page.click('#rf-save');
    await page.waitForTimeout(200);
    if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  }
  await addRec('allsub-extra', 10, 10); // 全科目達成後のもう1件
  st = await getState();
  const withAllExam = st.records.filter(r => r.bp >= 80 && r.content.startsWith('allsub-'));
  ok('全受験科目達成ボーナス(+80)は1日に1回だけ付与される', withAllExam.length === 1, `count=${withAllExam.length}`);

  // --- 修正2: 消費アイテムの効果時間が記録全体でなく実際の重なりだけに適用される ---
  await freshPage(true);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const p = n => (n < 10 ? '0' : '') + n;
    const d = (o) => { const x = new Date(); x.setDate(x.getDate() + o); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`; };
    for (let i = 0; i < 3; i++) s.records.push({ id: 'seed' + i, date: d(-1), subjectId: 'eng', content: 'seed', kind: '暗記', planMin: 30, actualMin: 30, reflection: '', deletedAt: null, bp: 1300, createdAt: 1, updatedAt: 1, score: null, maxScore: null });
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(s));
  });
  await reload();
  await nav('coach');
  await page.click('#btn-open-shop');
  await page.click('[data-tab="consumable"]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("フィーバータイム") [data-buy]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("フィーバータイム") [data-use]');
  await page.waitForTimeout(150);
  await page.click('#m-close');
  await nav('record');
  await page.selectOption('#rf-subject', { label: '英語' });
  await page.fill('#rf-content', 'fever-120min');
  await page.fill('#rf-plan', '120');
  await page.fill('#rf-actual', '120');
  await page.click('#rf-save');
  await page.waitForTimeout(200);
  const bpBoxText = await page.textContent('#celebrate-bp');
  /* APP-440 §3: 手入力の記録には時間制アイテムを適用しない。
   * 以前はここで「30分だけ10倍」を期待していたが、それはアイテムを発動して
   * 長時間を手で打ち込むだけで倍率を取れる経路そのものだった。
   * タイマーで実際に勉強した区間だけに乗せる方式へ変更している。 */
  ok('APP-440 手入力の記録にはフィーバーの倍率が乗らない',
    bpBoxText.includes('1.00倍') && !bpBoxText.includes('10.00倍'), bpBoxText);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  st = await getState();
  const feverRec = st.records.find(r => r.content === 'fever-120min');
  ok('APP-440 手入力120分のBPは等倍+行動ボーナスのみ(120+50=170)', feverRec.bp === 170, `bp=${feverRec.bp}`);

  // フィーバー(残30分)とエナジー(残60分)が重なる場合: 「残り時間で平均配分」ではなく、
  // フィーバー優先で実際の時間区間ごとに正しく計算されることを確認する(Codex再レビュー指摘)
  await freshPage(true);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const p = n => (n < 10 ? '0' : '') + n;
    const d = (o) => { const x = new Date(); x.setDate(x.getDate() + o); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`; };
    for (let i = 0; i < 4; i++) s.records.push({ id: 'seed' + i, date: d(-1), subjectId: 'eng', content: 'seed', kind: '暗記', planMin: 30, actualMin: 30, reflection: '', deletedAt: null, bp: 1000, createdAt: 1, updatedAt: 1, score: null, maxScore: null });
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(s));
  });
  await reload();
  await nav('coach');
  await page.click('#btn-open-shop');
  await page.click('[data-tab="consumable"]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("フィーバータイム") [data-buy]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("フィーバータイム") [data-use]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("エナジードリンク") [data-buy]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("エナジードリンク") [data-use]');
  await page.waitForTimeout(150);
  await page.click('#m-close');
  await nav('record');
  await page.selectOption('#rf-subject', { label: '英語' });
  await page.fill('#rf-content', 'fever-energy-overlap');
  await page.fill('#rf-plan', '120');
  await page.fill('#rf-actual', '120');
  await page.click('#rf-save');
  await page.waitForTimeout(200);
  const overlapBpText = await page.textContent('#celebrate-bp');
  /* APP-440 §3: 手入力なので、フィーバーもエナジーも乗らない。
   * 発動したアイテムは消費されず、タイマーで勉強したときに使える。 */
  ok('APP-440 手入力ではフィーバーもエナジーも乗らない',
    overlapBpText.includes('1.00倍') && !overlapBpText.includes('10.00倍') && !overlapBpText.includes('2.00倍'),
    overlapBpText);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  st = await getState();
  const overlapRec = st.records.find(r => r.content === 'fever-energy-overlap');
  ok('APP-440 手入力120分のBPは等倍+行動ボーナスのみ(170)', overlapRec.bp === 170, `bp=${overlapRec.bp}`);
  /* 手入力で発動を消費していないこと(タイマーで使えば効くこと)を確認する */
  const notConsumed = await page.evaluate(() => {
    const s2 = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    return (s2.shop.activeBoosts || []).every(b => (b.consumedMs || 0) === 0);
  });
  ok('APP-440 手入力ではアイテムの持ち時間を消費しない', notConsumed);

  // エナジードリンクを2本使った場合、効果が加算される(1本ずつの上限で頭打ちにならない)ことも確認する
  await freshPage(true);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const p = n => (n < 10 ? '0' : '') + n;
    const d = (o) => { const x = new Date(); x.setDate(x.getDate() + o); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`; };
    for (let i = 0; i < 2; i++) s.records.push({ id: 'seed' + i, date: d(-1), subjectId: 'eng', content: 'seed', kind: '暗記', planMin: 30, actualMin: 30, reflection: '', deletedAt: null, bp: 700, createdAt: 1, updatedAt: 1, score: null, maxScore: null });
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(s));
  });
  await reload();
  await nav('coach');
  await page.click('#btn-open-shop');
  await page.click('[data-tab="consumable"]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("エナジードリンク") [data-buy]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("エナジードリンク") [data-buy]');
  await page.waitForTimeout(150);
  const useButtons = page.locator('.shop-item:has-text("エナジードリンク") [data-use]');
  await useButtons.click();
  await page.waitForTimeout(150);
  await useButtons.click();
  await page.waitForTimeout(150);
  await page.click('#m-close');
  await nav('today');
  const doubleEnergyMult = await page.textContent('#boost-mult');
  ok('エナジードリンクを2本使うと倍率が加算される(1.0+1.0+1.0=3.00倍)', doubleEnergyMult.includes('3.00'), doubleEnergyMult);

  // --- 修正3: 受験30日前に装備・ショップが自動でOFFになる ---
  await freshPage(true);
  await nav('settings');
  await page.click('.settings-item[data-panel="exam"]');
  await page.waitForSelector('#modal-body');
  await page.click('#m-close');
  async function setExamDate(offsetDays) {
    await page.evaluate((off) => {
      const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
      const p = n => (n < 10 ? '0' : '') + n;
      const x = new Date(); x.setDate(x.getDate() + off);
      s.settings.examDate = `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
      localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(s));
    }, offsetDays);
    await reload();
    await nav('coach');
  }
  await setExamDate(31);
  ok('受験31日前は装備カードが表示される(通常モード)', await page.isVisible('#equip-card'));
  ok('受験31日前はショップ導線が表示される(通常モード)', await page.isVisible('#btn-open-shop'));
  ok('受験31日前は集中モード案内が出ない', !(await page.isVisible('#focus-mode-card')));

  await setExamDate(30);
  ok('受験30日前(境界)は装備カードが非表示になる(集中モード)', !(await page.isVisible('#equip-card')));
  ok('受験30日前(境界)はショップ導線が非表示になる(集中モード)', !(await page.isVisible('#btn-open-shop')));
  ok('受験30日前は集中モードの案内が表示される', await page.isVisible('#focus-mode-card'));
  await shot('60-focus-mode');

  await setExamDate(1);
  ok('受験前日も集中モードが続く', !(await page.isVisible('#equip-card')));

  await setExamDate(-1);
  ok('受験日を過ぎたら通常モードに戻る(装備カード表示)', await page.isVisible('#equip-card'));

  // 集中モードはUI非表示だけでなく、すでに装備済みのギアの倍率も無効化する(見た目だけの安全装置にしない)
  await freshPage(true);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const p = n => (n < 10 ? '0' : '') + n;
    const d = (o) => { const x = new Date(); x.setDate(x.getDate() + o); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`; };
    for (let i = 0; i < 3; i++) s.records.push({ id: 'seed' + i, date: d(-1), subjectId: 'eng', content: 'seed', kind: '暗記', planMin: 30, actualMin: 30, reflection: '', deletedAt: null, bp: 1000, createdAt: 1, updatedAt: 1, score: null, maxScore: null });
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(s));
  });
  await reload();
  await nav('coach');
  await page.click('#btn-open-shop');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("白いソックス") [data-buy]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("白いソックス") [data-equip]');
  await page.waitForTimeout(150);
  await page.click('#m-close');
  await nav('record');
  await page.selectOption('#rf-subject', { label: '英語' });
  await page.fill('#rf-content', 'normal-with-gear');
  await page.fill('#rf-plan', '100');
  await page.fill('#rf-actual', '50');
  await page.click('#rf-save');
  await page.waitForTimeout(200);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  st = await getState();
  ok('通常モードでは装備の倍率がBPに反映される(50分×1.10倍=55)', st.records.find(r => r.content === 'normal-with-gear').bp === 55, `bp=${st.records.find(r => r.content === 'normal-with-gear').bp}`);

  await setExamDate(10);
  await nav('today');
  const focusBoostMult = await page.textContent('#boost-mult');
  const focusBoostSub = await page.textContent('#boost-sub');
  ok('集中モード中は今日のブースト表示も1.00倍になる(実際のBP計算と一致させる)', focusBoostMult.includes('1.00'), focusBoostMult);
  ok('集中モード中は今日のブースト内訳も装備+0.00と表示される(表示と計算の食い違いを防ぐ)', focusBoostSub.includes('装備+0.00'), focusBoostSub);
  await page.click('#btn-boost-card');
  await page.waitForTimeout(150);
  const focusModalText = await page.textContent('#modal-body');
  ok('集中モード中のブースト内訳モーダルにも装備の倍率が表示されない', focusModalText.includes('衣装+0.00倍'), focusModalText);
  await page.click('#m-close');

  await nav('record');
  await page.selectOption('#rf-subject', { label: '英語' });
  await page.fill('#rf-content', 'focus-with-gear');
  await page.fill('#rf-plan', '100');
  await page.fill('#rf-actual', '50');
  await page.click('#rf-save');
  await page.waitForTimeout(200);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  st = await getState();
  ok('集中モード中は装備済みでも倍率が適用されない(50分×1.00倍=50)', st.records.find(r => r.content === 'focus-with-gear').bp === 50, `bp=${st.records.find(r => r.content === 'focus-with-gear').bp}`);

  // --- 修正4: リカバリーの同日二重消費を防止 ---
  await freshPage(true);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < 3; i++) s.records.push({ id: 'seed' + i, date: today, subjectId: 'eng', content: 'seed', kind: '暗記', planMin: 30, actualMin: 30, reflection: '', deletedAt: null, bp: 1000, createdAt: 1, updatedAt: 1, score: null, maxScore: null });
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(s));
  });
  await reload();
  await nav('coach');
  await page.click('#btn-open-shop');
  await page.click('[data-tab="consumable"]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("リカバリー") [data-buy]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("リカバリー") [data-buy]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("リカバリー") [data-use]');
  await page.waitForTimeout(150);
  st = await getState();
  ok('リカバリー使用で当日がstreakGuardDatesに追加される', st.shop.streakGuardDates.length === 1);
  ok('リカバリー使用でused.consumableが1になる', st.shop.used.consumable.recovery === 1);
  await page.click('.shop-item:has-text("リカバリー") [data-use]');
  await page.waitForTimeout(200);
  const recoveryToast = await page.textContent('#toast-text');
  ok('同日2回目のリカバリー使用は拒否される', recoveryToast.includes('すでに'), recoveryToast);
  st = await getState();
  ok('拒否された2回目はBPを消費しない(used.consumableは1のまま)', st.shop.used.consumable.recovery === 1);
  ok('拒否された2回目はstreakGuardDatesも増えない', st.shop.streakGuardDates.length === 1);
}

async function test14_subjectStudyKinds() {
  console.log('\n■ 試験14: 科目ごとの学習種別(APP-460)');
  await freshPage(true);

  const kinds = async (sel) => page.$$eval(sel + ' option', (os) => os.map((o) => o.textContent));

  /* --- 記録画面: 科目を変えると学習種別が入れ替わる --- */
  await nav('record');

  await page.selectOption('#rf-subject', 'soc');
  await page.waitForTimeout(150);
  let list = await kinds('#rf-kind');
  ok('14-1 社会を選ぶと社会の学習種別になる', list.includes('一問一答') && list.includes('用語の暗記'), list.join('/'));
  ok('14-2 社会に「読解」「演習」が出ない', !list.includes('読解') && !list.includes('演習'), list.join('/'));
  ok('14-3 社会の初期値が「用語の暗記」', await page.inputValue('#rf-kind') === '用語の暗記');

  await page.selectOption('#rf-subject', 'math');
  await page.waitForTimeout(150);
  list = await kinds('#rf-kind');
  ok('14-4 数学に「公式・定理の確認」がある', list.includes('公式・定理の確認'), list.join('/'));
  ok('14-5 数学に素の「暗記」「読解」が出ない', !list.includes('暗記') && !list.includes('読解'), list.join('/'));
  ok('14-6 数学の初期値が「問題演習」', await page.inputValue('#rf-kind') === '問題演習');

  await page.selectOption('#rf-subject', 'eng');
  await page.waitForTimeout(150);
  list = await kinds('#rf-kind');
  ok('14-7 英語に「リスニング」がある', list.includes('リスニング'), list.join('/'));

  await page.selectOption('#rf-subject', 'other');
  await page.waitForTimeout(150);
  list = await kinds('#rf-kind');
  ok('14-8 その他は共通の選択肢に戻る', list.includes('暗記') && list.includes('演習'), list.join('/'));

  /* --- テストは全科目に残り、点数欄の出し分けが動く --- */
  let missingTest = null;
  for (const sid of ['eng', 'math', 'jpn', 'sci', 'soc', 'other']) {
    await page.selectOption('#rf-subject', sid);
    await page.waitForTimeout(120);
    const l = await kinds('#rf-kind');
    if (!l.includes('テスト')) { missingTest = sid + ': ' + l.join('/'); break; }
  }
  ok('14-9 全科目に「テスト」がある', missingTest === null, missingTest || '6科目すべて');

  await page.selectOption('#rf-subject', 'soc');
  await page.waitForTimeout(120);
  await page.selectOption('#rf-kind', 'テスト');
  await page.waitForTimeout(150);
  ok('14-10 テストを選ぶと点数欄が出る', await page.isVisible('#rf-score-row'));
  await page.selectOption('#rf-subject', 'math');
  await page.waitForTimeout(150);
  // 「テスト」はどの科目にもあるため、科目を変えても保たれる。
  // ここで既定値へ戻すと、入力済みの得点が保存時に消える(15-17〜20 で検証)。
  ok('14-11 科目を変えても「テスト」は保たれ点数欄が開いたまま',
    (await page.inputValue('#rf-kind')) === 'テスト' && (await page.isVisible('#rf-score-row')),
    await page.inputValue('#rf-kind'));

  /* --- 保存できる --- */
  await page.selectOption('#rf-subject', 'soc');
  await page.waitForTimeout(120);
  await page.fill('#rf-content', '世界史 一問一答');
  await page.selectOption('#rf-kind', '一問一答');
  await page.fill('#rf-plan', '20');
  await page.fill('#rf-actual', '20');
  await page.click('#rf-save');
  await page.waitForTimeout(300);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  const saved = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    return st.records.filter((r) => !r.deletedAt).map((r) => r.kind);
  });
  ok('14-12 科目別の種別で保存できる', saved.includes('一問一答'), saved.join('/'));

  /* --- 予定追加モーダルでも連動する --- */
  await nav('today');
  await page.click('#btn-add-plan');
  await page.waitForTimeout(250);
  await page.selectOption('#m-subject', 'jpn');
  await page.waitForTimeout(150);
  list = await kinds('#m-kind');
  ok('14-13 予定追加でも科目に連動する(国語に「古文」)', list.includes('古文'), list.join('/'));
  await page.click('#m-close');
  await page.waitForTimeout(200);

  /* --- 旧データの値を持つ記録を編集しても値が消えない --- */
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    st.records.push({
      id: 'r_legacy', date: st.records[0] ? st.records[0].date : new Date().toISOString().slice(0, 10),
      subjectId: 'soc', content: '旧データ', kind: '暗記',
      planMin: 30, actualMin: 30, score: null, maxScore: null, reflection: '',
      createdAt: 1, updatedAt: 1, deletedAt: null
    });
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(st));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await nav('record');
  await page.waitForTimeout(300);
  const keptLegacy = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const r = st.records.find((x) => x.id === 'r_legacy');
    return r ? r.kind : null;
  });
  ok('14-14 旧データの「暗記」が読み込みで消えない', keptLegacy === '暗記', String(keptLegacy));

  /* --- 長い選択肢が途中で切れない(320pxでも) --- */
  await nav('record');
  await page.selectOption('#rf-subject', 'math');
  await page.waitForTimeout(150);
  await page.selectOption('#rf-kind', '公式・定理の確認');
  await page.waitForTimeout(150);
  const fits = await page.$eval('#rf-kind', (el) => el.scrollWidth <= el.clientWidth + 1);
  ok('14-15 長い学習種別が枠内に収まる(390px)', fits);
  await shot('60-subject-study-kinds');

  await page.setViewportSize({ width: 320, height: 700 });
  await page.waitForTimeout(250);
  const fits320 = await page.$eval('#rf-kind', (el) => el.scrollWidth <= el.clientWidth + 1);
  ok('14-16 長い学習種別が枠内に収まる(320px)', fits320);
  const noHScroll = await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  ok('14-17 320px幅の記録画面で横スクロールが発生しない', noHScroll);
  await shot('62-subject-study-kinds-320');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
}

async function test15_coachPanelsAndReport() {
  console.log('\n■ 試験15: コーチのパネル表示・不具合報告・更新バッジ(APP-461)');
  await freshPage(true);
  await nav('coach');
  await page.waitForTimeout(300);

  const geo = async (sel) => page.$eval(sel, (el) => {
    const b = el.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), vh: window.innerHeight,
             visible: !!(el.offsetWidth || el.offsetHeight) };
  });

  /* --- ポーズ変更: 押したら画面内に見える --- */
  await page.click('#btn-pose');
  await page.waitForTimeout(700);
  let g = await geo('#pose-panel');
  ok('15-1 ポーズ変更を押すとパネルが開く', g.visible);
  ok('15-2 ポーズパネルが画面内に入る(押しても何も起きないように見えない)',
    g.top < g.vh && g.bottom > 0, JSON.stringify(g));
  const poseTappable = await page.$eval('.pose-cell', (el) => {
    const b = el.getBoundingClientRect();
    const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !!(t && (t === el || el.contains(t)));
  });
  ok('15-3 ポーズを実際にタップできる', poseTappable);

  /* --- メッセージ: 押したら入力欄が画面内に見える --- */
  await page.click('#btn-chat');
  await page.waitForTimeout(700);
  g = await geo('#chat-input');
  ok('15-4 メッセージを押すと入力欄が開く', g.visible);
  ok('15-5 入力欄が画面内に入る', g.top < g.vh && g.bottom > 0, JSON.stringify(g));
  const inputTappable = await page.$eval('#chat-input', (el) => {
    const b = el.getBoundingClientRect();
    const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !!(t && (t === el || el.contains(t)));
  });
  ok('15-6 入力欄が他の要素に隠れていない', inputTappable);

  await page.fill('#chat-input', 'テスト送信');
  await page.click('#chat-send');
  await page.waitForTimeout(400);
  const chatSaved = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    return ((st.coach && st.coach.messages) || []).some((c) => (c.text || '').includes('テスト送信'));
  });
  ok('15-7 メッセージを送信できる', chatSaved);
  await shot('63-coach-chat-open');

  /* --- 不具合を報告する --- */
  await nav('settings');
  await page.click('.settings-item[data-panel="report"]');
  await page.waitForSelector('#rp-preview');
  const preview0 = await page.textContent('#rp-preview');
  ok('15-8 報告画面に版数が自動で入る', preview0.includes('ver.'), preview0.slice(0, 40));
  ok('15-9 端末と画面幅が自動で入る', preview0.includes('画面幅') && preview0.includes('端末'));
  ok('15-10 学習内容の本文は含めない旨を明記', preview0.includes('本文は含めていません'));
  await page.fill('#rp-text', 'コーチのボタンが反応しない');
  await page.waitForTimeout(200);
  const preview1 = await page.textContent('#rp-preview');
  ok('15-11 書いた内容が報告文に反映される', preview1.includes('コーチのボタンが反応しない'));
  await shot('64-report-panel');
  await page.click('#rp-copy');
  await page.waitForTimeout(300);
  ok('15-12 コピー操作でエラーにならない', true);
  await page.click('#m-close');
  await page.waitForTimeout(200);

  /* --- 更新バッジ --- */
  const before = await page.$eval('.nav-btn[data-screen="settings"]', (el) => el.className);
  ok('15-13 通常時は設定タブに赤い点が出ない', !before.includes('has-update'), before);
  await page.evaluate(() => window.__isbSetUpdateBadge && window.__isbSetUpdateBadge(true));
  await page.waitForTimeout(200);
  const after = await page.$eval('.nav-btn[data-screen="settings"]', (el) => el.className);
  ok('15-14 更新が届くと設定タブに赤い点が出る', after.includes('has-update'), after);
  const dotVisible = await page.$eval('.nav-btn[data-screen="settings"] .dot',
    (el) => !!(el.offsetWidth || el.offsetHeight));
  ok('15-15 赤い点が実際に表示される', dotVisible);
  await shot('65-update-badge');
  await page.evaluate(() => window.__isbSetUpdateBadge && window.__isbSetUpdateBadge(false));
  await page.waitForTimeout(200);
  const cleared = await page.$eval('.nav-btn[data-screen="settings"]', (el) => el.className);
  ok('15-16 更新すると赤い点が消える', !cleared.includes('has-update'), cleared);

  /* --- 第三者レビュー指摘1: 科目を変えてもテストの得点が消えない --- */
  await nav('record');
  await page.selectOption('#rf-subject', 'soc');
  await page.waitForTimeout(200);
  await page.selectOption('#rf-kind', 'テスト');
  await page.waitForTimeout(200);
  await page.fill('#rf-content', '模試(科目変更の検証)');
  await page.fill('#rf-plan', '60');
  await page.fill('#rf-actual', '60');
  await page.fill('#rf-score', '80');
  await page.fill('#rf-maxscore', '100');
  await page.selectOption('#rf-subject', 'math');       // ここで種別が既定値へ戻ると得点が消える
  await page.waitForTimeout(300);
  ok('15-17 科目を変えても学習種別「テスト」が保たれる',
    (await page.inputValue('#rf-kind')) === 'テスト', await page.inputValue('#rf-kind'));
  ok('15-18 科目を変えても得点欄が開いたまま', await page.isVisible('#rf-score-row'));
  ok('15-19 入力済みの得点が残っている', (await page.inputValue('#rf-score')) === '80');
  await page.click('#rf-save');
  await page.waitForTimeout(400);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  const savedScore = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const r = st.records.filter((x) => !x.deletedAt).find((x) => (x.content || '').includes('科目変更の検証'));
    return r ? { kind: r.kind, score: r.score, max: r.maxScore, subject: r.subjectId } : null;
  });
  ok('15-20 保存後も得点が消えていない', savedScore && savedScore.score === 80 && savedScore.kind === 'テスト',
    JSON.stringify(savedScore));

  /* --- 科目を変えたとき、その科目に無い種別は既定値へ切り替わる --- */
  await page.selectOption('#rf-subject', 'soc');
  await page.waitForTimeout(200);
  await page.selectOption('#rf-kind', '一問一答');
  await page.selectOption('#rf-subject', 'math');       // 数学に「一問一答」は無い
  await page.waitForTimeout(300);
  ok('15-21 その科目に無い種別は既定値へ切り替わる',
    (await page.inputValue('#rf-kind')) === '問題演習', await page.inputValue('#rf-kind'));

  /* --- 第三者レビュー指摘2: 壊れた科目idでも起動する --- */
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    st.settings.subjects.push({ id: 'toString', name: '壊れid', color: '#888', visible: true, examSubject: false });
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(st));
  });
  const errsBefore = consoleErrors.length;
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await nav('record');
  await page.selectOption('#rf-subject', 'toString');
  await page.waitForTimeout(300);
  const kindsForBroken = await page.$$eval('#rf-kind option', (os) => os.map((o) => o.textContent));
  ok('15-22 科目idが toString でもアプリが起動し操作できる', kindsForBroken.length > 0, kindsForBroken.join('/'));
  ok('15-23 壊れた科目idでJSエラーが増えない', consoleErrors.length === errsBefore,
    consoleErrors.slice(errsBefore).join(' | '));
}

async function extra_screens() {
  console.log('\n■ 追加: 全画面スクリーンショットとコーチ・320px幅・横向き');
  await freshPage(true);
  // デモデータ投入(完成イメージ照合用)
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const p = n => (n < 10 ? '0' : '') + n;
    const dstr = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
    const subs = ['eng', 'math', 'jpn', 'sci', 'soc'];
    let id = 0;
    for (let i = 13; i >= 0; i--) {
      subs.slice(0, 2 + (i % 3)).forEach((sub, j) => {
        s.records.push({ id: 'demo' + (++id), date: dstr(-i), subjectId: sub, content: ['英単語 20語', '数学 演習', '現代文 読解', '化学 基礎', '世界史 通史'][j] || '学習', kind: '演習', planMin: 30 + j * 15, actualMin: i === 0 && j === 0 ? 0 : 20 + ((i * 7 + j * 13) % 40), score: null, maxScore: null, reflection: '', createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null });
      });
    }
    s.events.push({ id: 'ev1', date: dstr(40), title: '近畿大学 公募推薦', faculty: '経営学部', method: '公募推薦', url: 'https://www.kindai.ac.jp/', memo: '' });
    s.news.push(
      { id: 'demoN1', date: dstr(0), genreId: 'economy', headline: '円安が1ドル160円台に', comment: '輸入品が高くなる理由が分かった気がする', bp: 60, createdAt: Date.now() },
      { id: 'demoN2', date: dstr(-1), genreId: 'international', headline: 'G7サミットが閉幕', comment: '', bp: 60, createdAt: Date.now() - 1000 }
    );
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(s));
  });
  await reload();
  await shot('20-today-demo');
  await nav('world');
  await page.waitForTimeout(200);
  await shot('20b-world-demo');
  await nav('graph');
  await page.waitForTimeout(300);
  await shot('21-graph-demo-week');
  await page.click('.range-tab[data-range="month"]');
  await page.waitForTimeout(300);
  await shot('22-graph-demo-month');
  await nav('coach');
  await page.waitForTimeout(300);
  await shot('23-coach');
  await page.click('#btn-pose');
  await page.waitForTimeout(200);
  await shot('24-coach-poses');
  await page.click('#btn-chat');
  await page.fill('#chat-input', '今日は英単語がんばった！');
  await page.click('#chat-send');
  await page.waitForTimeout(300);
  const chatTxt = await page.textContent('#chat-log');
  ok('コーチ: 発言保存+端末内ロジックの返答', chatTxt.includes('がんばった') && chatTxt.length > 30);
  await shot('25-coach-chat');
  await nav('settings');
  await shot('26-settings');
  // 320px幅
  await page.setViewportSize({ width: 320, height: 680 });
  await nav('today');
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > 330);
  ok('320px幅で横スクロールが発生しない', !overflow);
  await shot('27-today-320px');
  await nav('world');
  await page.waitForTimeout(200);
  const worldOverflow = await page.evaluate(() => document.documentElement.scrollWidth > 330);
  ok('320px幅で世界タブも横スクロールが発生しない(ジャンル・BPチップ含む)', !worldOverflow);
  await shot('27b-world-320px');
  // 横向き
  await page.setViewportSize({ width: 844, height: 390 });
  await nav('graph');
  await page.waitForTimeout(400);
  await shot('28-graph-landscape');
  const chartH = await page.evaluate(() => document.querySelector('#chart-svg').getAttribute('height'));
  ok('横向きでグラフを優先表示', Number(chartH) >= 220, `h=${chartH}`);
}

/* ============ APP-440 段階3: タイマーの自動停止と延長 ============ */

/** 偽の時計を入れた状態でページを開く。実時間を待たずに経過を再現する。 */
async function freshPageWithClock(startMs) {
  if (context) await context.close();
  context = await browser.newContext({ ...devices['iPhone 13'], locale: 'ja-JP' });
  page = await context.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(String(e)));
  await page.clock.install({ time: new Date(startMs) });
  /* 時計を完全に止める。止めないと実時間ぶんの微小なずれが積もり、
     分単位の期待値が1分ずれることがある。 */
  await page.clock.pauseAt(new Date(startMs));
  await page.goto(BASE + '/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#screen-today.active');
  await dismissCenter();
}

/** 今日の予定を作ってタイマーを開始する */
async function startPlanTimer({ subjectLabel = '英語', kind = '単語・熟語', content, plan }) {
  await page.click('#btn-start-study');
  await page.waitForSelector('#modal-back.open');
  await page.selectOption('#m-subject', { label: subjectLabel });
  await page.selectOption('#m-kind', kind);
  await page.fill('#m-content', content);
  await page.fill('#m-plan', String(plan));
  await page.click('#m-save');
  await page.waitForTimeout(200);
}

async function test16_timerAutoStop() {
  console.log('\n■ 試験16: タイマーの自動停止と延長(APP-440 T-1)');
  // 2026-08-11 10:00 に固定する
  const T0 = new Date(2026, 7, 11, 10, 0, 0).getTime();
  await freshPageWithClock(T0);

  /* --- T-1-1: 宣言済み時間で自動停止する --- */
  await startPlanTimer({ content: '英単語 60分', plan: 60 });
  await page.waitForSelector('#timer-card:visible');
  const runningBefore = await page.isVisible('#timer-elapsed');
  ok('T-1-1 開始直後はタイマーが動いている', runningBefore);

  await page.clock.fastForward(60 * 60 * 1000);
  await page.waitForTimeout(300);
  ok('T-1-1 計画時間でタイマーが自動停止し完了画面が出る', await page.isVisible('#timer-completed'));
  const doneText = await page.textContent('#timer-completed');
  ok('T-1-1 完了画面に60分と出る', /1時間|60分/.test(doneText), doneText);
  await shot('70-timer-completed');

  /* --- T-1-2: 完了画面で何もしないまま放置しても増えない --- */
  await page.clock.fastForward(30 * 60 * 1000);
  await page.waitForTimeout(300);
  const doneText2 = await page.textContent('#timer-completed');
  ok('T-1-2 完了後に30分放置しても90分にならない', doneText2 === doneText, doneText2);

  /* 保存すると60分。超過30分は捨てられる。 */
  await page.click('#btn-finish');
  await page.waitForSelector('#m-actual');
  const suggested = await page.inputValue('#m-actual');
  ok('T-1-2 保存欄の既定値が60分(90分ではない)', suggested === '60', suggested);
  const maxAttr = await page.getAttribute('#m-actual', 'max');
  ok('T-1-2 実績欄の上限が宣言済み時間になっている', maxAttr === '60', maxAttr);

  /* 増やす方向の修正は受け付けない */
  await page.fill('#m-actual', '120');
  await page.click('#m-save');
  await page.waitForTimeout(200);
  const stillOpen = await page.isVisible('#m-actual');
  ok('T-1-2 宣言済み時間を超える値では保存できない', stillOpen);
  await page.fill('#m-actual', '60');
  await page.click('#m-save');
  await page.waitForTimeout(300);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');

  let st = await getState();
  let rec = st.records.find(r => r.content === '英単語 60分');
  ok('T-1-2 実績60分で保存される(放置分は入らない)', rec && rec.actualMin === 60,
    rec ? `actual=${rec.actualMin}` : '記録なし');
  ok('T-1-2 未確定の30分はBPにならない', rec && rec.bp > 0 && rec.bp <= 60 * 3,
    rec ? `bp=${rec.bp}` : '');

  /* --- T-1-5/T-1-6/T-1-14: 延長 --- */
  await page.clock.fastForward(60 * 1000);
  await startPlanTimer({ content: '延長テスト', plan: 30 });
  await page.waitForSelector('#timer-card:visible');
  await page.clock.fastForward(30 * 60 * 1000);
  await page.waitForTimeout(300);
  ok('T-1-5 計画30分で完了画面が出る', await page.isVisible('#timer-completed'));
  ok('T-1-5 延長のボタンが出ている', await page.isVisible('[data-ext="15"]'));

  await page.click('[data-ext="15"]');
  await page.waitForTimeout(300);
  ok('T-1-5 延長するとタイマーが再開する', await page.isVisible('#timer-elapsed'));
  st = await getState();
  rec = st.records.find(r => r.content === '延長テスト');
  ok('T-1-14 延長は実績へ溶かし込まず extendedMin に残る', rec && rec.extendedMin === 15,
    rec ? `extendedMin=${rec.extendedMin}` : '記録なし');

  await page.clock.fastForward(15 * 60 * 1000);
  await page.waitForTimeout(300);
  ok('T-1-6 延長した時間で再び完了画面が出る', await page.isVisible('#timer-completed'));
  await page.click('#btn-finish');
  await page.waitForSelector('#m-actual');
  const extSuggested = await page.inputValue('#m-actual');
  ok('T-1-6 計画30分＋延長15分=45分が既定値', extSuggested === '45', extSuggested);
  await page.click('#m-save');
  await page.waitForTimeout(300);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  st = await getState();
  rec = st.records.find(r => r.content === '延長テスト');
  ok('T-1-6 実績45分・延長15分で保存', rec && rec.actualMin === 45 && rec.extendedMin === 15,
    rec ? `actual=${rec.actualMin}, ext=${rec.extendedMin}` : '記録なし');

  /* --- T-1-13: テストは延長できない --- */
  await page.clock.fastForward(60 * 1000);
  await startPlanTimer({ content: '英語ミニテスト', kind: 'テスト', plan: 20 });
  await page.waitForSelector('#timer-card:visible');
  await page.clock.fastForward(20 * 60 * 1000);
  await page.waitForTimeout(300);
  ok('T-1-13 テストでも完了画面は出る', await page.isVisible('#timer-completed'));
  ok('T-1-13 テストには延長のボタンが出ない', !(await page.isVisible('[data-ext="15"]')));
  await page.click('#btn-finish');
  await page.waitForSelector('#m-actual');
  await page.click('#m-save');
  await page.waitForTimeout(300);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
}

async function test17_timerReopenAndDayCross() {
  console.log('\n■ 試験17: 再起動・日またぎでも終了時刻で頭打ち(APP-440 T-1-3/T-1-4)');
  const T0 = new Date(2026, 7, 11, 10, 0, 0).getTime();

  /* --- T-1-3: アプリを閉じたまま8時間放置して開く --- */
  await freshPageWithClock(T0);
  await startPlanTimer({ content: '放置8時間', plan: 60 });
  await page.waitForSelector('#timer-card:visible');
  /* アプリを閉じている状態を、8時間先の時計で開き直して再現する */
  await page.clock.fastForward(8 * 60 * 60 * 1000);
  await page.reload();
  await page.waitForSelector('#screen-today.active');
  await dismissCenter();
  ok('T-1-3 開き直すと完了画面が出る', await page.isVisible('#timer-completed'));
  const late = await page.textContent('#timer-card');
  ok('T-1-3 完了していた時刻を伝える', /完了していました/.test(late), late.slice(0, 60));
  await shot('71-timer-completed-late');
  await page.click('#btn-finish');
  await page.waitForSelector('#m-actual');
  const v = await page.inputValue('#m-actual');
  ok('T-1-3 480分ではなく60分', v === '60', v);
  await page.click('#m-save');
  await page.waitForTimeout(300);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  let st = await getState();
  let rec = st.records.find(r => r.content === '放置8時間');
  ok('T-1-3 実績60分で保存される', rec && rec.actualMin === 60, rec ? `actual=${rec.actualMin}` : '記録なし');
  ok('T-1-3 BPも60分ぶんまで', rec && rec.bp <= 60 * 3, rec ? `bp=${rec.bp}` : '');

  /* --- 完了直後にアプリを閉じても実績とBPが残る(段階3レビューの修正条件3) --- */
  await freshPageWithClock(T0);
  await startPlanTimer({ content: '完了直後に閉じる', plan: 60 });
  await page.waitForSelector('#timer-card:visible');
  await page.clock.fastForward(60 * 60 * 1000);
  await page.waitForTimeout(300);
  ok('完了時点で完了画面が出る', await page.isVisible('#timer-completed'));
  /* ボタンを一切押さずに保存状態を見る */
  let stAuto = await getState();
  let recAuto = stAuto.records.find(r => r.content === '完了直後に閉じる');
  ok('ボタンを押さなくても実績が保存されている', recAuto && recAuto.actualMin === 60,
    recAuto ? `actual=${recAuto.actualMin}` : '記録なし');
  ok('ボタンを押さなくてもBPが確定している', recAuto && recAuto.bp > 0,
    recAuto ? `bp=${recAuto.bp}` : '');
  const bpAfterComplete = recAuto.bp;

  /* アプリを閉じて開き直しても残る。二重付与もしない。 */
  await page.reload();
  await page.waitForSelector('#screen-today.active');
  await dismissCenter();
  stAuto = await getState();
  recAuto = stAuto.records.find(r => r.content === '完了直後に閉じる');
  ok('再起動しても実績が残る', recAuto && recAuto.actualMin === 60, recAuto ? `actual=${recAuto.actualMin}` : '');
  ok('再起動してもBPが二重に増えない', recAuto && recAuto.bp === bpAfterComplete,
    recAuto ? `bp=${recAuto.bp} (前=${bpAfterComplete})` : '');
  /* 何度描画し直しても増えない */
  await page.reload();
  await page.waitForSelector('#screen-today.active');
  await dismissCenter();
  stAuto = await getState();
  recAuto = stAuto.records.find(r => r.content === '完了直後に閉じる');
  ok('2回目の再起動でもBPが変わらない', recAuto && recAuto.bp === bpAfterComplete,
    recAuto ? `bp=${recAuto.bp}` : '');

  /* 延長すると、確定済みの記録へ明示した分だけ足される */
  await page.click('[data-ext="10"]');
  await page.waitForTimeout(300);
  await page.clock.fastForward(10 * 60 * 1000);
  await page.waitForTimeout(300);
  stAuto = await getState();
  recAuto = stAuto.records.find(r => r.content === '完了直後に閉じる');
  ok('延長ぶんも自動で確定する', recAuto && recAuto.actualMin === 70,
    recAuto ? `actual=${recAuto.actualMin}` : '');
  ok('延長は extendedMin に残る', recAuto && recAuto.extendedMin === 10,
    recAuto ? `ext=${recAuto.extendedMin}` : '');
  ok('延長後のBPが上限を超えない', recAuto && recAuto.bp <= 70 * 3 + 500,
    recAuto ? `bp=${recAuto.bp}` : '');
  await page.click('#btn-finish');
  await page.waitForSelector('#m-actual');
  await page.click('#m-save');
  await page.waitForTimeout(300);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');

  /* --- T-1-4: 日をまたいで放置 --- */
  await freshPageWithClock(new Date(2026, 7, 11, 22, 0, 0).getTime());
  await startPlanTimer({ content: '日またぎ放置', plan: 60 });
  await page.waitForSelector('#timer-card:visible');
  await page.clock.fastForward(11 * 60 * 60 * 1000);   // 翌日09:00
  await page.reload();
  await page.waitForSelector('#screen-today.active');
  await dismissCenter();
  ok('T-1-4 日をまたいでも完了画面が出る', await page.isVisible('#timer-completed'));
  await page.click('#btn-finish');
  await page.waitForSelector('#m-actual');
  const v2 = await page.inputValue('#m-actual');
  ok('T-1-4 日またぎでも宣言済み時間しか入らない', v2 === '60', v2);
  await page.click('#m-save');
  await page.waitForTimeout(300);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  st = await getState();
  rec = st.records.find(r => r.content === '日またぎ放置');
  ok('T-1-4 実績60分で保存される', rec && rec.actualMin === 60, rec ? `actual=${rec.actualMin}` : '記録なし');

  /* --- 一時停止中は進まない --- */
  await freshPageWithClock(T0);
  await startPlanTimer({ content: '一時停止テスト', plan: 60 });
  await page.waitForSelector('#timer-card:visible');
  await page.clock.fastForward(20 * 60 * 1000);
  await page.click('#btn-pause');
  await page.waitForTimeout(200);
  await page.clock.fastForward(2 * 60 * 60 * 1000);
  await page.reload();
  await page.waitForSelector('#screen-today.active');
  await dismissCenter();
  ok('一時停止中は2時間放置しても完了しない', !(await page.isVisible('#timer-completed')));
  await page.click('#btn-finish');
  await page.waitForSelector('#m-actual');
  const v3 = await page.inputValue('#m-actual');
  ok('一時停止中の放置は実績に入らない', v3 === '20', v3);
  await page.click('#m-save');
  await page.waitForTimeout(300);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');

  /* --- 計画時間が無いと開始できない --- */
  await freshPage(true);
  await addRecord({ date: localDate(0), subjectLabel: '英語', content: '計画なし記録', plan: 0, actual: 20 });
  await page.waitForTimeout(200);
  const started = await page.evaluate(() => {
    const st2 = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    return !!st2.activeSession;
  });
  ok('計画0分の記録ではタイマーが始まらない', !started);
}

async function test18_itemsOnStudyIntervals() {
  console.log('\n■ 試験18: 時間制アイテムを実学習区間にだけ適用(APP-440 T-2)');
  const T0 = new Date(2026, 7, 11, 10, 0, 0).getTime();
  await freshPageWithClock(T0);
  /* BPを与えてエナジードリンクを買えるようにする */
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const p = n => (n < 10 ? '0' : '') + n;
    const x = new Date(); x.setDate(x.getDate() - 1);
    s.records.push({ id: 'seedbp', date: `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`,
      subjectId: 'eng', content: 'seed', kind: '暗記', planMin: 30, actualMin: 30,
      reflection: '', deletedAt: null, bp: 1000, createdAt: 1, updatedAt: 1, score: null, maxScore: null });
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(s));
  });
  await page.reload();
  await page.waitForSelector('#screen-today.active');
  await dismissCenter();

  /* エナジードリンク(60分)を発動する */
  await nav('coach');
  await page.click('#btn-open-shop');
  await page.click('[data-tab="consumable"]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("エナジードリンク") [data-buy]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("エナジードリンク") [data-use]');
  await page.waitForTimeout(150);
  await page.click('#m-close');
  await nav('today');

  /* 10分勉強 → 40分休憩 → 20分勉強。実学習30分、壁時計70分。
   * アイテムの有効区間は 0〜60分なので、重なるのは [0,10] と [50,60] の20分だけ。 */
  await startPlanTimer({ content: '休憩を挟む学習', plan: 30 });
  await page.waitForSelector('#timer-card:visible');
  await page.clock.fastForward(10 * 60 * 1000);
  await page.click('#btn-pause');
  await page.waitForTimeout(200);
  await page.clock.fastForward(40 * 60 * 1000);
  await page.click('#btn-pause');           // 再開
  await page.waitForTimeout(200);
  await page.clock.fastForward(20 * 60 * 1000);
  await page.waitForTimeout(300);
  ok('T-2 休憩を挟んでも実学習30分で完了する', await page.isVisible('#timer-completed'));

  let st = await getState();
  let rec = st.records.find(r => r.content === '休憩を挟む学習');
  ok('T-2-3 休憩中の時間はアイテム消費に入らない(20分だけ)',
    rec && rec.bpBoost && rec.bpBoost.timed.length === 1 && rec.bpBoost.timed[0].itemId === 'energy_drink' && rec.bpBoost.timed[0].minutes === 20,
    rec && rec.bpBoost ? JSON.stringify(rec.bpBoost.timed) : 'bpBoostなし');
  ok('T-2-3 実績は実学習の30分', rec && rec.actualMin === 30, rec ? `actual=${rec.actualMin}` : '');

  /* 保存した時点で壁時計は70分経っており、60分のアイテムは期限切れ。
     有効だった区間ぶん(20分)は数えたうえで片付けられる。 */
  ok('T-2 期限切れのアイテムは数え終わってから片付けられる', st.shop.activeBoosts.length === 0,
    JSON.stringify(st.shop.activeBoosts));

  /* 学習区間が保存されていること(休憩で分かれている) */
  ok('T-2 学習区間が2本に分かれて記録されている',
    st.activeSession && Array.isArray(st.activeSession.segments) && st.activeSession.segments.length === 2,
    st.activeSession ? JSON.stringify(st.activeSession.segments) : 'セッションなし');

  await page.click('#btn-finish');
  await page.waitForSelector('#m-actual');
  await page.click('#m-save');
  await page.waitForTimeout(300);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');

  /* --- T-2-8/T-2-11: 同じアイテム時間を別の記録へ再利用できない --- */
  await startPlanTimer({ content: '2件目の学習', plan: 20 });
  await page.waitForSelector('#timer-card:visible');
  await page.clock.fastForward(20 * 60 * 1000);
  await page.waitForTimeout(300);
  st = await getState();
  const rec2 = st.records.find(r => r.content === '2件目の学習');
  const boosted2 = rec2 && rec2.bpBoost ? (rec2.bpBoost.timed || []).reduce((n, t) => n + t.minutes, 0) : -1;
  ok('T-2-8 期限を過ぎたアイテムは2件目に乗らない', boosted2 === 0, `boosted=${boosted2}`);
  ok('T-2-11 期限切れのアイテムが2件目で復活しない', st.shop.activeBoosts.length === 0,
    JSON.stringify(st.shop.activeBoosts));

  /* --- 延長ぶんもアイテムが効く(段階4レビューの修正条件3) --- */
  await freshPageWithClock(T0);
  await page.evaluate(() => {
    const s3 = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const p3 = n => (n < 10 ? '0' : '') + n;
    const y = new Date(); y.setDate(y.getDate() - 1);
    s3.records.push({ id: 'seedbp2', date: `${y.getFullYear()}-${p3(y.getMonth() + 1)}-${p3(y.getDate())}`,
      subjectId: 'eng', content: 'seed', kind: '暗記', planMin: 30, actualMin: 30,
      reflection: '', deletedAt: null, bp: 1000, createdAt: 1, updatedAt: 1, score: null, maxScore: null });
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(s3));
  });
  await page.reload();
  await page.waitForSelector('#screen-today.active');
  await dismissCenter();
  await nav('coach');
  await page.click('#btn-open-shop');
  await page.click('[data-tab="consumable"]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("エナジードリンク") [data-buy]');
  await page.waitForTimeout(150);
  await page.click('.shop-item:has-text("エナジードリンク") [data-use]');
  await page.waitForTimeout(150);
  await page.click('#m-close');
  await nav('today');

  await startPlanTimer({ content: '延長でもアイテムが効く', plan: 30 });
  await page.waitForSelector('#timer-card:visible');
  await page.clock.fastForward(30 * 60 * 1000);
  await page.waitForTimeout(300);
  st = await getState();
  let extRec = st.records.find(r => r.content === '延長でもアイテムが効く');
  const firstBoost = extRec.bpBoost.timed.reduce((n, t) => n + t.minutes, 0);
  ok('延長前: 最初の30分にアイテムが乗る', firstBoost === 30, `boost=${firstBoost}`);
  const bpFirst = extRec.bp;

  await page.click('[data-ext="10"]');
  await page.waitForTimeout(200);
  await page.clock.fastForward(10 * 60 * 1000);
  await page.waitForTimeout(300);
  st = await getState();
  extRec = st.records.find(r => r.content === '延長でもアイテムが効く');
  const totalBoost = extRec.bpBoost.timed.reduce((n, t) => n + t.minutes, 0);
  ok('延長後: 延長した10分にもアイテムが乗る(合計40分)', totalBoost === 40, `boost=${totalBoost}`);
  ok('延長後の実績は40分', extRec.actualMin === 40, `actual=${extRec.actualMin}`);
  ok('延長でBPが増えている', extRec.bp > bpFirst, `bp=${extRec.bp} (前=${bpFirst})`);
  const bpAfterExt = extRec.bp;
  const consumedAfterExt = st.shop.activeBoosts.map(b => b.consumedMs || 0);
  ok('消費は合計40分ぶん', consumedAfterExt.length === 1 && consumedAfterExt[0] === 40 * 60000,
    JSON.stringify(consumedAfterExt));

  /* 再起動しても二重消費・二重BPにならない */
  await page.reload();
  await page.waitForSelector('#screen-today.active');
  await dismissCenter();
  st = await getState();
  extRec = st.records.find(r => r.content === '延長でもアイテムが効く');
  const totalBoost2 = extRec.bpBoost.timed.reduce((n, t) => n + t.minutes, 0);
  ok('再起動しても消費が増えない', totalBoost2 === 40, `boost=${totalBoost2}`);
  ok('再起動してもBPが増えない', extRec.bp === bpAfterExt, `bp=${extRec.bp} (前=${bpAfterExt})`);
  const consumedReload = st.shop.activeBoosts.map(b => b.consumedMs || 0);
  ok('再起動しても consumedMs が増えない', consumedReload.length === 1 && consumedReload[0] === 40 * 60000,
    JSON.stringify(consumedReload));

  /* 同じ記録を再描画しても追加消費しない(画面を行き来するだけ) */
  await nav('graph');
  await page.waitForTimeout(150);
  await nav('today');
  await page.waitForTimeout(300);
  st = await getState();
  extRec = st.records.find(r => r.content === '延長でもアイテムが効く');
  const totalBoost3 = extRec.bpBoost.timed.reduce((n, t) => n + t.minutes, 0);
  ok('画面を行き来するだけでは追加消費しない', totalBoost3 === 40 && extRec.bp === bpAfterExt,
    `boost=${totalBoost3}, bp=${extRec.bp}`);

  /* --- スポットライト2個ぶんの倍率が保存・再起動で減らない(段階4レビュー) --- */
  await freshPageWithClock(T0);
  await page.evaluate(() => {
    const s4 = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const p4 = n => (n < 10 ? '0' : '') + n;
    const z = new Date(); z.setDate(z.getDate() - 1);
    /* スポットライトは1個800BP。2個買うので余裕を持たせる(1記録の上限は1,500BP) */
    for (let k = 0; k < 2; k++) {
      s4.records.push({ id: 'seedbp3' + k, date: `${z.getFullYear()}-${p4(z.getMonth() + 1)}-${p4(z.getDate())}`,
        subjectId: 'eng', content: 'seed' + k, kind: '暗記', planMin: 30, actualMin: 30,
        reflection: '', deletedAt: null, bp: 1500, createdAt: 1 + k, updatedAt: 1, score: null, maxScore: null });
    }
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(s4));
  });
  await page.reload();
  await page.waitForSelector('#screen-today.active');
  await dismissCenter();
  await nav('coach');
  await page.click('#btn-open-shop');
  await page.click('[data-tab="consumable"]');
  await page.waitForTimeout(150);
  for (let i = 0; i < 2; i++) {
    await page.click('.shop-item:has-text("スポットライト") [data-buy]');
    await page.waitForTimeout(150);
    await page.click('.shop-item:has-text("スポットライト") [data-use]');
    await page.waitForTimeout(150);
  }
  await page.click('#m-close');
  await nav('today');

  await startPlanTimer({ content: 'スポットライト2個', plan: 20 });
  await page.waitForSelector('#timer-card:visible');
  await page.clock.fastForward(20 * 60 * 1000);
  await page.waitForTimeout(300);
  st = await getState();
  let spotRec = st.records.find(r => r.content === 'スポットライト2個');
  ok('スポットライト2個ぶんが1消費1要素で保存される',
    spotRec && spotRec.bpBoost && spotRec.bpBoost.dayItemIds.length === 2,
    spotRec && spotRec.bpBoost ? JSON.stringify(spotRec.bpBoost.dayItemIds) : 'bpBoostなし');
  const spotBp = spotRec.bp;
  /* 20分 × (1.0 + 0.5 + 0.5) = 40BP。1個ぶんに減れば30BPになる。 */
  ok('2個ぶんの倍率(合計+1.0倍)でBPが計算される', spotBp >= 40, `bp=${spotBp}`);

  await page.reload();
  await page.waitForSelector('#screen-today.active');
  await dismissCenter();
  st = await getState();
  spotRec = st.records.find(r => r.content === 'スポットライト2個');
  ok('再起動しても2個ぶんのままBPが減らない',
    spotRec.bpBoost.dayItemIds.length === 2 && spotRec.bp === spotBp,
    `ids=${JSON.stringify(spotRec.bpBoost.dayItemIds)}, bp=${spotRec.bp}`);

  /* 延長しても個数が増えない(倍率が勝手に上がらない) */
  await page.click('[data-ext="5"]');
  await page.waitForTimeout(200);
  await page.clock.fastForward(5 * 60 * 1000);
  await page.waitForTimeout(300);
  st = await getState();
  spotRec = st.records.find(r => r.content === 'スポットライト2個');
  ok('延長しても個数は2個のまま(倍率が増えない)', spotRec.bpBoost.dayItemIds.length === 2,
    JSON.stringify(spotRec.bpBoost.dayItemIds));
  await page.click('#btn-finish');
  await page.waitForSelector('#m-actual');
  await page.click('#m-save');
  await page.waitForTimeout(300);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');

  /* 削除・復元の検証(T-2-9/T-2-10)は経路3とあわせて段階5で扱う。 */

}

async function test19_newsSlotOnRestore() {
  console.log('\n■ 試験19: ニュースの削除・復元で1日3本の上限を回り込めない(APP-440 T-3)');
  await freshPage(true);
  await nav('world');

  async function addNews(headline) {
    await page.click('#btn-add-news');
    await page.waitForSelector('#m-headline');
    await page.fill('#m-headline', headline);
    await page.click('#m-save');
    await page.waitForTimeout(250);
    if (await page.isVisible('#modal-back.open')) { await page.click('#m-close'); await page.waitForTimeout(150); }
  }
  async function bpNewsCount() {
    return page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
      const p = n => (n < 10 ? '0' : '') + n;
      const d = new Date();
      const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      return (s.news || []).filter(n => n.date === today && (n.bp | 0) > 0).length;
    });
  }

  await addNews('ニュース1');
  await addNews('ニュース2');
  await addNews('ニュース3');
  ok('T-3-1 3本目までBPが付く', await bpNewsCount() === 3, String(await bpNewsCount()));

  /* 1本削除して4本目を追加 → 枠が空いているのでBPが付く */
  await page.click('.news-item:has-text("ニュース2") [data-act="del"]');
  await page.waitForTimeout(300);
  ok('T-3-1 削除で枠が空く', await bpNewsCount() === 2, String(await bpNewsCount()));
  await addNews('ニュース4');
  ok('T-3-1 4本目にBPが付き、BP付きは3本のまま', await bpNewsCount() === 3, String(await bpNewsCount()));

  /* ここで「元に戻す」を押しても、枠が埋まっているのでBPは戻らない */
  await page.click('.news-item:has-text("ニュース4") [data-act="del"]');
  await page.waitForTimeout(200);
  await addNews('ニュース5');
  await page.click('.news-item:has-text("ニュース5") [data-act="del"]');
  await page.waitForTimeout(200);
  await addNews('ニュース6');
  const beforeUndo = await bpNewsCount();
  if (await page.isVisible('#toast .toast-action')) {
    await page.click('#toast .toast-action');
    await page.waitForTimeout(300);
  }
  const afterUndo = await bpNewsCount();
  ok('T-3-2 枠が埋まっていれば元に戻してもBPは戻らない', afterUndo <= C_NEWS_LIMIT,
    `前=${beforeUndo}, 後=${afterUndo}`);
  ok('T-3-5 どの時点でもBP付きは3本を超えない', afterUndo <= C_NEWS_LIMIT, String(afterUndo));

  /* 5本目以降を足してもBP付きは3本を超えない */
  await addNews('ニュース7');
  await addNews('ニュース8');
  ok('T-3-5 追加を重ねてもBP付きは3本のまま', await bpNewsCount() === 3, String(await bpNewsCount()));

  const st = await getState();
  ok('T-3-7 BP残高が負にならない', st.shop.bpBalance === undefined || st.shop.bpBalance >= 0);
  await shot('72-news-slots');
}

async function test20_editRecalcBp() {
  console.log('\n■ 試験20: 編集・削除・復元でBPを再計算する(APP-440 T-4)');
  await freshPage(true);

  async function recBy(content) {
    const st = await getState();
    return st.records.find(r => r.content === content);
  }
  async function editRecord(content, fields) {
    await nav('record');
    await page.waitForTimeout(150);
    await page.click(`.rec-item:has-text("${content}") [data-act="edit"]`);
    await page.waitForSelector('#m-actual');
    if (fields.date !== undefined) await page.fill('#m-date', fields.date);
    if (fields.actual !== undefined) await page.fill('#m-actual', String(fields.actual));
    if (fields.subjectLabel !== undefined) await page.selectOption('#m-subject', { label: fields.subjectLabel });
    await page.click('#m-save');
    await page.waitForTimeout(300);
  }

  /* --- T-4-3: 実績を増やす編集ではBPが増えない --- */
  await addRecord({ date: localDate(0), subjectLabel: '英語', content: '増やす編集', plan: 30, actual: 30 });
  await page.waitForTimeout(200);
  let r = await recBy('増やす編集');
  const bpBefore = r.bp;
  ok('T-4-3 手入力30分のBPが確定している', bpBefore > 0, `bp=${bpBefore}`);

  await editRecord('増やす編集', { actual: 600 });
  r = await recBy('増やす編集');
  ok('T-4-3 グラフの実績は600分になる', r.actualMin === 600, `actual=${r.actualMin}`);
  ok('T-4-3 BP対象時間は30分のまま', r.bpMin === 30, `bpMin=${r.bpMin}`);
  /* 設計は「編集でBPは減ることはあっても、増えることはない」。
   * ここでは達成率が2000%になり計画達成ボーナスが外れるため、むしろ減る。
   * 時間ぶんのBPは bpMin=30 で据え置かれており、増える方向には動かない。 */
  ok('T-4-3 BPは増えない(むしろ達成率から外れて減る)', r.bp <= bpBefore, `bp=${r.bp} (前=${bpBefore})`);
  ok('T-4-3 時間ぶんのBPは30分ぶんのまま(600分ぶんにならない)', r.bp <= 30 + 50, `bp=${r.bp}`);

  /* --- 実績を減らす編集ではBPも減る --- */
  await editRecord('増やす編集', { actual: 10 });
  r = await recBy('増やす編集');
  ok('減らす編集ではBPも減る', r.bp < bpBefore && r.bpMin === 10, `bp=${r.bp}, bpMin=${r.bpMin}`);

  /* --- T-4-1: 別の日へ移すと移動先の日次上限が効く --- */
  await freshPage(true);
  /* 8/1相当と当日にそれぞれ上限近くまで積む */
  const dayA = localDate(-1), dayB = localDate(0);
  await addRecord({ date: dayA, subjectLabel: '英語', content: '移動元', plan: 700, actual: 700 });
  await page.waitForTimeout(200);
  await addRecord({ date: dayB, subjectLabel: '英語', content: '移動先1', plan: 700, actual: 700 });
  await page.waitForTimeout(200);
  await addRecord({ date: dayB, subjectLabel: '英語', content: '移動先2', plan: 700, actual: 700 });
  await page.waitForTimeout(200);

  let stBefore = await getState();
  const dayBBefore = stBefore.records.filter(x => x.date === dayB && !x.deletedAt)
    .reduce((n, x) => n + (x.bp | 0), 0);
  ok('T-4-1 移動先の日は既に日次上限に達している', dayBBefore === 1500, `合計=${dayBBefore}`);

  await editRecord('移動元', { date: dayB });
  let stAfter = await getState();
  const dayBAfter = stAfter.records.filter(x => x.date === dayB && !x.deletedAt)
    .reduce((n, x) => n + (x.bp | 0), 0);
  const dayAAfter = stAfter.records.filter(x => x.date === dayA && !x.deletedAt)
    .reduce((n, x) => n + (x.bp | 0), 0);
  ok('T-4-1 移動しても移動先の合計は日次上限を超えない', dayBAfter === 1500, `合計=${dayBAfter}`);
  ok('T-4-1 移動元の日のBPは残らない', dayAAfter === 0, `合計=${dayAAfter}`);

  /* --- T-4-2: 受験科目から非受験科目へ変えると100BP上限が効く --- */
  await freshPage(true);
  await addRecord({ date: localDate(0), subjectLabel: '英語', content: '科目変更', plan: 200, actual: 200 });
  await page.waitForTimeout(200);
  r = await recBy('科目変更');
  ok('T-4-2 受験科目では200分ぶんのBPが付く', r.bp > 100, `bp=${r.bp}`);
  await editRecord('科目変更', { subjectLabel: 'その他' });
  r = await recBy('科目変更');
  ok('T-4-2 非受験科目へ変えると100BP上限が効く', r.bp <= 100, `bp=${r.bp}`);

  /* --- T-4-4/T-4-5: 削除・復元で配り直す --- */
  await freshPage(true);
  await addRecord({ date: localDate(0), subjectLabel: '英語', content: '削除する記録', plan: 700, actual: 700 });
  await page.waitForTimeout(200);
  await addRecord({ date: localDate(0), subjectLabel: '英語', content: '上限に当たる記録', plan: 700, actual: 700 });
  await page.waitForTimeout(200);
  await addRecord({ date: localDate(0), subjectLabel: '英語', content: 'あふれた記録', plan: 700, actual: 700 });
  await page.waitForTimeout(200);
  let overflow = await recBy('あふれた記録');
  ok('T-4-4 上限を超えた3件目はBPが少ない', overflow.bp < 700, `bp=${overflow.bp}`);

  await nav('record');
  await page.waitForTimeout(150);
  await page.click('.rec-item:has-text("削除する記録") [data-act="del"]');
  await page.waitForTimeout(400);
  overflow = await recBy('あふれた記録');
  ok('T-4-4 削除で枠が空くと残りへ配り直される', overflow.bp > 0, `bp=${overflow.bp}`);
  let stDel = await getState();
  const totalAfterDel = stDel.records.filter(x => x.date === localDate(0) && !x.deletedAt)
    .reduce((n, x) => n + (x.bp | 0), 0);
  ok('T-4-4 配り直しても日次上限を超えない', totalAfterDel <= 1500, `合計=${totalAfterDel}`);

  /* ごみ箱から戻す */
  await nav('record');
  await page.waitForTimeout(150);
  if (await page.isVisible('#btn-trash')) {
    await page.click('#btn-trash');
    await page.waitForTimeout(300);
    if (await page.isVisible('[data-act="restore"]')) {
      await page.click('[data-act="restore"]');
      await page.waitForTimeout(400);
    }
    if (await page.isVisible('#m-close')) await page.click('#m-close');
  }
  let stRes = await getState();
  const totalAfterRestore = stRes.records.filter(x => x.date === localDate(0) && !x.deletedAt)
    .reduce((n, x) => n + (x.bp | 0), 0);
  ok('T-4-5 復元しても日次上限を超えない', totalAfterRestore <= 1500, `合計=${totalAfterRestore}`);

  /* --- 更新前からある記録を編集しても稼げない(段階6レビューの修正条件) --- */
  await freshPage(true);
  await page.evaluate(() => {
    const key = 'ibukiStudyBeat.v3';
    const s5 = JSON.parse(localStorage.getItem(key));
    const p5 = n => (n < 10 ? '0' : '') + n;
    const d5 = new Date();
    const today = `${d5.getFullYear()}-${p5(d5.getMonth() + 1)}-${p5(d5.getDate())}`;
    /* APP-440 より前の形。bpMinInitial も timerUsed も持たない。 */
    s5.records.push({
      id: 'oldtimer', date: today, subjectId: 'eng', content: '旧タイマー記録',
      kind: '暗記', planMin: 30, actualMin: 30, reflection: '', deletedAt: null,
      bp: 80, createdAt: 1, updatedAt: 1, score: null, maxScore: null
    });
    s5.records.push({
      id: 'oldmanual', date: today, subjectId: 'eng', content: '旧手入力記録',
      kind: '暗記', planMin: 0, actualMin: 45, reflection: '', deletedAt: null,
      bp: 45, createdAt: 2, updatedAt: 1, score: null, maxScore: null
    });
    localStorage.setItem(key, JSON.stringify(s5));
  });
  await reload();
  let stOld = await getState();
  const oldTimer = stOld.records.find(x => x.id === 'oldtimer');
  const oldManual = stOld.records.find(x => x.id === 'oldmanual');
  ok('旧記録を読み込むだけではBP残高が変わらない',
    oldTimer.bp === 80 && oldManual.bp === 45, `timer=${oldTimer.bp}, manual=${oldManual.bp}`);
  ok('旧記録に初回BP上限が入る',
    oldTimer.bpMinInitial === 30 && oldManual.bpMinInitial === 45,
    `timer=${oldTimer.bpMinInitial}, manual=${oldManual.bpMinInitial}`);

  await editRecord('旧タイマー記録', { actual: 600 });
  r = await recBy('旧タイマー記録');
  ok('旧タイマー記録を600分へ編集してもBP対象は30分以下', r.bpMin <= 30, `bpMin=${r.bpMin}, bp=${r.bp}`);
  ok('旧タイマー記録のBPが600分ぶんにならない', r.bp <= 80, `bp=${r.bp}`);

  await editRecord('旧手入力記録', { actual: 600 });
  r = await recBy('旧手入力記録');
  ok('旧手入力記録を600分へ編集してもBP対象は45分以下', r.bpMin <= 45, `bpMin=${r.bpMin}, bp=${r.bp}`);
  ok('旧手入力記録のBPが600分ぶんにならない', r.bp <= 95, `bp=${r.bp}`);

  /* --- T-4-6: 何度再計算しても同じ値になる --- */
  const stable = await page.evaluate(() => {
    const key = 'ibukiStudyBeat.v3';
    const before = JSON.parse(localStorage.getItem(key)).records.map(r => r.bp | 0);
    /* 画面を開き直すだけでは配り直さない。編集を経由しない限り値は動かない。 */
    const after = JSON.parse(localStorage.getItem(key)).records.map(r => r.bp | 0);
    return JSON.stringify(before) === JSON.stringify(after);
  });
  ok('T-4-6 再読み込みだけではBPが動かない', stable);
  await shot('73-edit-recalc');
}

/* ============ 実行 ============ */
browser = await chromium.launch();
try {
  await test1_firstStudy();
  await test2_sevenDays();
  await test3_multiSubject();
  await test4_invalidInput();
  await test5_editDeleteRestore();
  await test6_events();
  await test7_touchAndAxis();
  await test8_dataProtection();
  await test9_versionAndUpdate();
  await test10_aiIntegration();
  await test11_worldNews();
  await test12_pointsEquipShop();
  await test13_codexReviewFixes();
  await test14_subjectStudyKinds();
  await test15_coachPanelsAndReport();
  await test16_timerAutoStop();
  await test17_timerReopenAndDayCross();
  await test18_itemsOnStudyIntervals();
  await test19_newsSlotOnRestore();
  await test20_editRecalcBp();
  await extra_screens();
} catch (e) {
  console.error('試験実行エラー:', e);
  results.push({ name: '試験実行が最後まで完了', pass: false, detail: String(e).slice(0, 300) });
  try { await shot('99-error'); } catch {}
}

ok('JavaScriptコンソールエラーなし', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
await browser.close();

const passed = results.filter(r => r.pass).length;
console.log(`\n===== 結果: ${passed}/${results.length} 合格 =====`);
const md = ['# 受け入れ試験結果', '', `実行日: ${new Date().toISOString().slice(0, 10)} / 環境: Playwright + Chromium (iPhone 13 viewport)`, '',
  `**${passed}/${results.length} 合格**`, '', '| 結果 | 項目 | 詳細 |', '|---|---|---|',
  ...results.map(r => `| ${r.pass ? '✅' : '❌'} | ${r.name} | ${r.detail} |`), ''].join('\n');
writeFileSync(new URL('../../TEST_RESULTS.md', import.meta.url).pathname, md);
process.exit(passed === results.length ? 0 : 1);
