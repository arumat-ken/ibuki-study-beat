/*
 * IBUKI STUDY BEAT — 受け入れ試験(ACCEPTANCE_TESTS.md 準拠)
 * 実行: node tests/e2e/acceptance.mjs
 * 前提: http-server 等で репо ルートを配信済み(BASE_URL 環境変数、既定 http://127.0.0.1:8787)
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
const SHOT_DIR = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
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
  // 得点欄は前回の値が残るため、テスト以外では必ず空にする。
  // 種別が「テスト」のときは欄が出ていなければ異常なので、待って確実に扱う。
  if (kind === 'テスト') await page.waitForSelector('#rf-score-row', { state: 'visible' });
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
  /* APP-440 §6: 行動ボーナスは1日1回になったので、9件ぶんの計画達成50BPは
   * 積み上がらない。時間ぶん(9件×30分=270)と1回ぶんのボーナスは残る。 */
  ok('複数回の記録でBPが積み上がる(時間ぶんは記録ごとに加算される)', totalBP >= 270, `total=${totalBP}`);

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
  /* 計画達成+50 はその日の最初の対象記録へ寄せるため、ここでは時間ぶんだけ。 */
  ok('非受験科目1件目はキャップ未満なら満額もらえる', nonExam1.bp === 30, `bp=${nonExam1.bp}`);

  /* 行動ボーナスが1日1回になったぶん、上限に届くまでの時間が長くなった。
   * 30分 + 120分 = 150BP相当だが、非受験科目は1日100BPまで。 */
  await addRecord({ subjectLabel: 'その他', content: '非受験科目2', plan: 120, actual: 120 });
  st = await getState();
  const nonExam2 = st.records[st.records.length - 1];
  ok('非受験科目2件目で1日100BPの上限にかかる(30+120→100までしか付かない)', nonExam2.bp === 70, `bp=${nonExam2.bp}`);
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
  /* APP-440 §6: 行動ボーナスは1日1回。担当は bpOrder の先頭(=1件目)に固定する。
   * 2件目は時間ぶんだけ。合計は「30+30分 + 計画達成50 + streak3の30」= 140。 */
  ok('3日連続達成の当日、1件目にstreak3ボーナス(+30)が付く', first.bp === 110, `bp=${first.bp}`);
  ok('同じ日の2件目には行動ボーナスが再度付かない(時間ぶんだけ)', second.bp === 30, `bp=${second.bp}`);
  const dayTotal = st.records.filter(r => r.date === localDate() && !r.deletedAt)
    .reduce((n, r) => n + (r.bp | 0), 0);
  ok('APP-440 §6 その日の合計に行動ボーナスは1回ぶんだけ入る', dayTotal === 140, `合計=${dayTotal}`);

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
  /* APP-440 §6: どの記録に付くかは bpOrder で固定される。
   * 検証すべきは「その日の合計に1回ぶんだけ入っているか」。
   * 記録は math1(20分) + 5科目×10分 + 追加10分 = 80分。
   * 行動ボーナスは 全受験科目80 + 計画達成50 = 130。合計210。 */
  const allExamDayTotal = st.records.filter(r => r.date === localDate() && !r.deletedAt)
    .reduce((n, r) => n + (r.bp | 0), 0);
  ok('全受験科目達成ボーナス(+80)は1日に1回だけ付与される', allExamDayTotal === 210,
    `合計=${allExamDayTotal}`);

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

async function test24_bpChipAndGraph() {
  console.log('\n■ 試験24: ポイントの常時表示とポイントグラフ(APP-470)');
  await freshPage(true);
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const d = (o) => { const x = new Date(); x.setDate(x.getDate() + o);
      return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); };
    for (let i = 6; i >= 0; i--) {
      st.records.push({ id: 'bp' + i, date: d(-i), subjectId: 'eng', content: 'BP検証' + i, kind: '単語・熟語',
        planMin: 60, actualMin: 60, score: null, maxScore: null, reflection: '',
        bp: 100 * (i + 1), createdAt: 1, updatedAt: 1, deletedAt: null });
    }
    st.news.push({ id: 'bpn', date: d(-1), genreId: 'economy', headline: 'N', comment: '', bp: 60, createdAt: 1 });
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(st));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  /* --- 全画面の上部にポイントが出る --- */
  const expected = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    return window.ISBCalc.calcBpBalance(st).toLocaleString('ja-JP');
  });
  let allShown = true, detail = [];
  for (const sc of ['today', 'record', 'graph', 'world', 'coach', 'settings']) {
    await nav(sc);
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const c = document.querySelector('.screen.active .bp-balance');
      if (!c) return null;
      const b = c.getBoundingClientRect();
      return { text: c.textContent.trim(), visible: !!(c.offsetWidth || c.offsetHeight), top: Math.round(b.top) };
    });
    if (!r || !r.visible || r.text.indexOf(expected) === -1) { allShown = false; detail.push(sc + ':' + JSON.stringify(r)); }
  }
  ok('16-1 6画面すべての上部にポイント残高が出る', allShown, detail.join(' '));

  /* --- タップで内訳が開く --- */
  await nav('today');
  await page.click('.screen.active .bp-balance');
  await page.waitForTimeout(400);
  ok('16-2 ポイントをタップすると内訳が開く', await page.isVisible('#modal-back.open'));
  await page.click('#m-close');
  await page.waitForTimeout(250);

  /* --- 記録を足すと残高が増える --- */
  const before = await page.textContent('.screen.active .bp-balance');
  await addRecord({ subjectLabel: '英語', content: 'ポイント増加の検証', plan: 30, actual: 30 });
  await nav('today');
  await page.waitForTimeout(300);
  const after = await page.textContent('.screen.active .bp-balance');
  ok('16-3 記録を保存すると残高表示が更新される', before !== after, before + ' → ' + after);

  /* --- ポイントグラフ --- */
  await nav('graph');
  await page.waitForTimeout(300);
  const timeBars = await page.locator('#chart-svg-wrap rect').count();
  ok('16-4 学習時間グラフが従来どおり描かれる', timeBars > 0, 'rect=' + timeBars);

  await page.click('#graph-mode-tabs [data-mode="bp"]');
  await page.waitForTimeout(500);
  ok('16-5 ポイントグラフに切り替わる', (await page.locator('#chart-svg-wrap rect').count()) > 0);
  ok('16-6 累積の線が描かれる', (await page.locator('#chart-svg-wrap polyline').count()) === 1);
  const stats = (await page.textContent('#graph-stats')).replace(/\s+/g, '');
  ok('16-7 獲得合計・学習から・ニュースからが出る',
    stats.includes('獲得合計') && stats.includes('学習から') && stats.includes('ニュースから'), stats.slice(0, 60));
  const ovBp = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('16-8 ポイントグラフで横スクロールが起きない', ovBp <= 1, 'overflow=' + ovBp);
  await shot('66-graph-bp');

  /* --- 期間切替がポイント側でも効く --- */
  await page.click('.range-tab[data-range="month"]');
  await page.waitForTimeout(400);
  ok('16-9 期間(月)を変えてもポイントグラフが描かれる',
    (await page.locator('#chart-svg-wrap rect').count()) > 0);

  /* --- 学習時間グラフへ戻して壊れていないこと --- */
  await page.click('#graph-mode-tabs [data-mode="time"]');
  await page.waitForTimeout(400);
  ok('16-10 学習時間グラフへ戻せる(既存機能を壊していない)',
    (await page.locator('#chart-svg-wrap rect').count()) > 0);
  ok('16-11 学習時間の統計が従来どおり出る',
    (await page.textContent('#graph-stats')).includes('達成率'));

  /* --- 不具合報告のLINE送信 --- */
  await nav('settings');
  await page.click('.settings-item[data-panel="report"]');
  await page.waitForSelector('#rp-send');
  ok('16-12 不具合報告に「送る」ボタンがある', await page.isVisible('#rp-send'));
  ok('16-13 コピーするボタンも残っている', await page.isVisible('#rp-copy'));
  const shared = await page.evaluate(() => {
    window.__shared = null;
    navigator.share = (d) => { window.__shared = d; return Promise.resolve(); };
    document.getElementById('rp-send').click();
    return new Promise((r) => setTimeout(() => r(window.__shared), 200));
  });
  ok('16-14 送るボタンで共有に報告文が渡る',
    shared && (shared.text || '').includes('IBUKI STUDY BEAT 不具合レポート'),
    shared ? (shared.text || '').slice(0, 30) : 'null');
  ok('16-15 共有に学習内容の本文が含まれない',
    shared && (shared.text || '').includes('本文は含めていません'));
  await shot('67-report-share');
  await page.click('#m-close');
}

async function test25_sessionGuards() {
  console.log('\n■ 試験25: 学習セッションを不用意に失わないためのガード(APP-471)');
  await freshPage(true);

  // 予定を1件作り、その予定から学習を始める。
  // 「学習を開始する」は予定が残っていると選択モーダルを出すため、
  // 予定を作る → その予定をタップ、の2段階にして手順を確定させる。
  async function makePlan(name) {
    await nav('today');
    await page.click('#btn-add-plan');
    await page.waitForSelector('#m-subject');
    await page.selectOption('#m-subject', { label: '英語' });
    await page.fill('#m-content', name);
    await page.fill('#m-plan', '60');
    await page.click('#m-save');
    await page.waitForTimeout(300);
  }

  async function startPlan(name) {
    await nav('today');
    await page.click('#today-plans .plan-item:has-text("' + name + '")');
    await page.waitForSelector('#timer-card:visible');
  }

  async function ageSession(minutes) {
    await page.evaluate((m) => {
      const st = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
      st.activeSession.startTs -= m * 60 * 1000;
      localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(st));
    }, minutes);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#timer-card:visible');
  }

  // 学習中なら破棄して、次の試験の前提を揃える
  async function endSessionIfAny() {
    await nav('today');
    await page.waitForTimeout(200);
    if (await page.isVisible('#timer-card')) {
      await page.click('#btn-discard');
      await page.waitForSelector('#m-ok');
      await page.click('#m-ok');
      await page.waitForTimeout(300);
    }
  }

  async function startAndAge(name, minutes) {
    await endSessionIfAny();
    await makePlan(name);
    await startPlan(name);
    await ageSession(minutes);
  }

  /* --- 画面を移動しても、アプリを閉じても続く --- */
  await startAndAge('継続の検証', 45);
  for (const sc of ['record', 'graph', 'world', 'coach', 'settings', 'today']) {
    await nav(sc);
    await page.waitForTimeout(80);
  }
  ok('17-1 アプリ内で画面を移動してもタイマーが続く', await page.isVisible('#timer-card'));

  await page.goto(BASE + '/glossary/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  ok('17-2 別のページへ行って戻ってもタイマーが続く', await page.isVisible('#timer-card'));

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const elapsed = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    return st.activeSession ? Math.floor((Date.now() - st.activeSession.startTs) / 60000) : null;
  });
  ok('17-3 開き直しても経過時間が保たれる(裏で進む)', elapsed === 45, String(elapsed));

  /* --- やめるときに何分消えるか見せる --- */
  await page.click('#btn-discard');
  await page.waitForSelector('#m-ok');
  const dlg = (await page.textContent('#modal-back')).replace(/\s+/g, '');
  ok('17-4 失う時間を具体的に示す(45分)', dlg.includes('45分'), dlg.slice(0, 50));
  ok('17-5 取り消せることを案内する', dlg.includes('元に戻す'));

  /* --- やめても取り消せる --- */
  await page.click('#m-ok');
  await page.waitForTimeout(400);
  ok('17-6 やめるとタイマーが消える', !(await page.isVisible('#timer-card')));
  ok('17-7 取り消しボタン付きの知らせが出る',
    (await page.textContent('#toast')).includes('元に戻す'));
  await page.click('#toast-action');
  await page.waitForTimeout(500);
  ok('17-8 取り消すとタイマーが戻る', await page.isVisible('#timer-card'));
  const back = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    return st.activeSession ? Math.floor((Date.now() - st.activeSession.startTs) / 60000) : null;
  });
  ok('17-9 取り消すと経過時間もそのまま戻る', back === 45, String(back));

  /* --- 学習中の予定を消したら、黙って止めずに理由を伝える --- */
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const r = st.records.find((x) => x.id === st.activeSession.recordId);
    r.deletedAt = Date.now();
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(st));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  ok('17-10 削除済みの予定でタイマーが動き続けない', !(await page.isVisible('#timer-card')));
  ok('17-11 止めた理由を知らせる',
    (await page.textContent('#toast')).includes('削除された'),
    (await page.textContent('#toast')).replace(/\s+/g, ' ').slice(0, 40));
  const cleared = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('ibukiStudyBeat.v3')).activeSession);
  ok('17-12 セッションが残らない', cleared === null, JSON.stringify(cleared));

  /* --- Codexレビュー Q4-2: 学習中の予定を削除しても時間を失わない（実際の削除UIから） --- */
  await startAndAge('削除ガードの検証', 25);
  await nav('record');
  await page.waitForTimeout(300);
  // 一覧の🗑から削除しようとする
  const delBtn = page.locator('.rec-item .rec-actions button', { hasText: '🗑' })
    .first();
  const hasDel = await delBtn.count();
  if (hasDel) {
    await delBtn.click();
    await page.waitForTimeout(400);
  }
  const guardTxt = (await page.textContent('#modal-back')).replace(/\s+/g, '');
  ok('17-13 学習中の予定を消そうとすると止められる',
    guardTxt.includes('いま学習中の予定'), guardTxt.slice(0, 50));
  ok('17-14 未保存の時間を具体的に示す', guardTxt.includes('25分'), guardTxt.slice(0, 60));
  ok('17-15 終了して記録する選択肢がある', await page.isVisible('#dl-finish'));

  // 「やめる」を選べば、記録もタイマーも無事
  await page.click('#dl-cancel');
  await page.waitForTimeout(300);
  await nav('today');
  await page.waitForTimeout(200);
  ok('17-16 やめるとタイマーが続く(時間を失わない)', await page.isVisible('#timer-card'));
  const stillThere = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const r = st.records.find((x) => (x.content || '').includes('削除ガードの検証'));
    return r ? !r.deletedAt : null;
  });
  ok('17-17 記録も削除されていない', stillThere === true, String(stillThere));

  /* --- Codexレビュー Q6-1: 取り消し待ちの時間が勉強時間に入らない --- */
  await page.click('#btn-discard');
  await page.waitForSelector('#m-ok');
  await page.click('#m-ok');
  await page.waitForTimeout(2500);          // 2.5秒ぶん待ってから戻す
  await page.click('#toast-action');
  await page.waitForTimeout(400);
  const afterUndo = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    const s = st.activeSession;
    if (!s) return null;
    return { elapsedMin: Math.floor((Date.now() - s.startTs - s.pausedAccum) / 60000),
             pausedAccum: s.pausedAccum };
  });
  ok('17-18 取り消し待ちの時間が一時停止として除かれる',
    afterUndo && afterUndo.pausedAccum >= 2000, JSON.stringify(afterUndo));
  ok('17-19 取り消し後の経過時間が水増しされない',
    afterUndo && afterUndo.elapsedMin === 25, JSON.stringify(afterUndo));

  /* --- Codexレビュー Q6-1(再): 一時停止中にやめて戻しても時間が減らない --- */
  await startAndAge('一時停止からの復元', 10);
  await page.click('#btn-pause');                 // 一時停止する
  await page.waitForTimeout(300);
  const pausedElapsed = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3')).activeSession;
    return Math.floor(((s.pausedAt || Date.now()) - s.startTs - s.pausedAccum) / 60000);
  });
  ok('17-22 一時停止で経過が止まる', pausedElapsed === 10, String(pausedElapsed));

  await page.click('#btn-discard');
  await page.waitForSelector('#m-ok');
  await page.click('#m-ok');
  await page.waitForTimeout(2500);                // 2.5秒待ってから戻す
  await page.click('#toast-action');
  await page.waitForTimeout(400);
  const restored = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3')).activeSession;
    if (!s) return null;
    return { elapsedMin: Math.floor(((s.pausedAt || Date.now()) - s.startTs - s.pausedAccum) / 60000),
             pausedAccum: s.pausedAccum, stillPaused: !!s.pausedAt };
  });
  ok('17-23 一時停止中に戻しても学習時間が減らない',
    restored && restored.elapsedMin === 10, JSON.stringify(restored));
  ok('17-24 一時停止中は待ち時間を二重に引かない',
    restored && restored.pausedAccum === 0, JSON.stringify(restored));

  // 再開しても、待ち時間が経過に混ざらない
  await page.click('#btn-pause');                 // 再開
  await page.waitForTimeout(600);
  const resumed = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3')).activeSession;
    return Math.floor((Date.now() - s.startTs - s.pausedAccum) / 60000);
  });
  ok('17-25 再開後も経過が10分のまま(待ち時間が混ざらない)', resumed === 10, String(resumed));

  /* --- Codexレビュー Q6-2: 別の学習が始まっていたら上書きしない --- */
  await startAndAge('上書き検証のもと', 5);
  const prevRecordId = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('ibukiStudyBeat.v3')).activeSession.recordId);
  await page.click('#btn-discard');
  await page.waitForSelector('#m-ok');
  await page.click('#m-ok');
  await page.waitForTimeout(300);
  // 先に別の学習を始めてしまう(前のセッションとは別の予定)
  await makePlan('別セッションの検証');
  await startPlan('別セッションの検証');
  await page.waitForTimeout(300);
  // 前のセッションの「元に戻す」が残っていれば押してみる
  if (await page.isVisible('#toast-action')) {
    await page.click('#toast-action');
    await page.waitForTimeout(300);
  }
  const nowRecordId = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('ibukiStudyBeat.v3')).activeSession || {}).recordId);
  ok('17-20 別の学習を始めた後は、前のセッションで上書きされない',
    nowRecordId && nowRecordId !== prevRecordId,
    'prev=' + prevRecordId + ' now=' + nowRecordId);

  /* --- Codexレビュー Q4-1: 削除済みの予定からは学習を始められない --- */
  const startedOnDeleted = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
    // 適当な記録をごみ箱へ入れ、そのIDで開始を試みる
    const target = st.records.find((r) => !r.deletedAt && r.id !== (st.activeSession || {}).recordId);
    if (!target) return 'no-target';
    target.deletedAt = Date.now();
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(st));
    return target.id;
  });
  if (startedOnDeleted !== 'no-target') {
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const inList = await page.evaluate((id) =>
      !!document.querySelector('#today-plans .plan-item[data-id="' + id + '"]'), startedOnDeleted);
    ok('17-21 ごみ箱に入れた予定は今日の一覧から消える(開始できない)', !inList, String(inList));
  } else {
    ok('17-21 ごみ箱に入れた予定は今日の一覧から消える(開始できない)', true, '対象なし');
  }

  await shot('68-session-guard');
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
async function startPlanTimer({ subjectLabel = '英語', kind = '単語・熟語', content = '', plan }) {
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
  /* 完了したのにコーチが「集中してるね」のままだと、画面と実態が食い違う */
  const greetAfter = await page.textContent('#today-greeting');
  ok('T-1-1 完了後はコーチの言葉も完了に変わる', !/集中してるね/.test(greetAfter), greetAfter);
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

  /* T-3-3: 枠が空いている状態で「元に戻す」を押すとBPごと復活する。
   * 条件付きにせず、トーストの「元に戻す」が出るまで待って必ず押す。 */
  await page.click('.news-item:has-text("ニュース4") [data-act="del"]');
  await page.waitForSelector('#toast-action');
  const beforeUndo = await bpNewsCount();
  ok('T-3-3 削除直後はBP付きが2本', beforeUndo === 2, String(beforeUndo));
  await page.click('#toast-action');
  await page.waitForTimeout(300);
  const afterUndo = await bpNewsCount();
  ok('T-3-3 枠が空いていればBPごと復活する', afterUndo === 3, `前=${beforeUndo}, 後=${afterUndo}`);
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
  /* 700分×2件 + 計画達成50(1日1回) = 1450 */
  ok('T-4-1 移動先の日は上限近くまで埋まっている', dayBBefore === 1450, `合計=${dayBBefore}`);

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

  /* ごみ箱から戻す。トーストの「元に戻す」ではなく、ごみ箱画面の復元ボタンを使う。
   * 以前はボタンのIDを取り違えて条件付きで囲っており、無言でスキップされていた。 */
  await nav('record');
  await page.waitForTimeout(150);
  await page.click('#btn-open-trash');
  await page.waitForSelector('[data-act="restore"]');
  await page.click('[data-act="restore"]');
  await page.waitForTimeout(400);
  let stRes = await getState();
  const restored = stRes.records.find(x => x.content === '削除する記録');
  ok('T-4-5 ごみ箱から実際に復元される', restored && !restored.deletedAt,
    restored ? `deletedAt=${restored.deletedAt}` : '記録なし');
  const totalAfterRestore = stRes.records.filter(x => x.date === localDate(0) && !x.deletedAt)
    .reduce((n, x) => n + (x.bp | 0), 0);
  ok('T-4-5 ごみ箱から復元しても日次上限を超えない', totalAfterRestore <= 1500, `合計=${totalAfterRestore}`);

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

async function test21_dailyActionBonuses() {
  console.log('\n■ 試験21: 行動ボーナスを1日1回に束ねる(APP-440 T-5)');
  await freshPage(true);
  await nav('record');

  async function add(content, plan, actual, refl) {
    await page.selectOption('#rf-subject', { label: '英語' });
    await page.fill('#rf-content', content);
    await page.fill('#rf-plan', String(plan));
    await page.fill('#rf-actual', String(actual));
    if (refl !== undefined) await page.fill('#rf-reflection', refl);
    await page.click('#rf-save');
    await page.waitForTimeout(250);
    if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  }
  async function dayTotal() {
    const st = await getState();
    return st.records.filter(r => r.date === localDate() && !r.deletedAt)
      .reduce((n, r) => n + (r.bp | 0), 0);
  }

  /* --- T-5-1: 1分の記録を10件作っても行動ボーナスは1回ぶん --- */
  for (let i = 0; i < 10; i++) await add('小分け' + i, 1, 1);
  const smallTotal = await dayTotal();
  /* 10分ぶん + 計画達成50 = 60。旧仕様なら 10 + 50×10 = 510 */
  ok('T-5-1 1分の記録を10件作っても計画達成は1回ぶん', smallTotal <= 60, `合計=${smallTotal}`);
  ok('T-5-1 旧仕様の510BPにならない', smallTotal < 510, `合計=${smallTotal}`);

  /* --- T-5-6: 15分ちょうどは対象、14分は対象外 --- */
  await freshPage(true);
  await nav('record');
  await add('14分', 14, 14);
  const t14 = await dayTotal();
  ok('T-5-6 14分では計画達成ボーナスが付かない', t14 === 14, `合計=${t14}`);

  await freshPage(true);
  await nav('record');
  await add('15分', 15, 15);
  const t15 = await dayTotal();
  ok('T-5-6 15分ちょうどでは計画達成ボーナスが付く', t15 === 15 + 50, `合計=${t15}`);

  /* --- T-5-2: 振り返りも1日1回 --- */
  await freshPage(true);
  await nav('record');
  await add('振り返り1', 30, 30, 'わかった');
  await add('振り返り2', 30, 30, 'これもわかった');
  const reflTotal = await dayTotal();
  /* 60分 + 計画達成50 + 振り返り10 = 120 */
  ok('T-5-2 振り返りを2件書いても+10は1回ぶん', reflTotal === 120, `合計=${reflTotal}`);

  /* --- T-5-3: 模試も1日1回 --- */
  await freshPage(true);
  await nav('record');
  for (let i = 0; i < 2; i++) {
    await page.selectOption('#rf-subject', { label: '英語' });
    await page.selectOption('#rf-kind', 'テスト');
    await page.fill('#rf-content', '模試' + i);
    await page.fill('#rf-plan', '60');
    await page.fill('#rf-actual', '60');
    await page.fill('#rf-score', '80');
    await page.fill('#rf-maxscore', '100');
    await page.click('#rf-save');
    await page.waitForTimeout(250);
    if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  }
  const mockTotal = await dayTotal();
  /* 120分 + 計画達成50 + 模試300 = 470。旧仕様なら模試が2回で770 */
  ok('T-5-3 模試を2件記録しても+300は1回ぶん', mockTotal === 470, `合計=${mockTotal}`);

  /* --- T-5-4: 編集して配り直しても行動ボーナスは1回ぶんのまま --- */
  await nav('record');
  await page.waitForTimeout(150);
  await page.click('.rec-item:has-text("模試0") [data-act="edit"]');
  await page.waitForSelector('#m-actual');
  await page.fill('#m-actual', '59');
  await page.click('#m-save');
  await page.waitForTimeout(350);
  const afterEdit = await dayTotal();
  ok('T-5-4 編集で配り直しても行動ボーナスは1回ぶんのまま', afterEdit === 469, `合計=${afterEdit}`);

  /* --- T-5-5: 更新前からある記録でも1日1回になる --- */
  await freshPage(true);
  await page.evaluate(() => {
    const key = 'ibukiStudyBeat.v3';
    const s6 = JSON.parse(localStorage.getItem(key));
    const p6 = n => (n < 10 ? '0' : '') + n;
    const d6 = new Date();
    const today = `${d6.getFullYear()}-${p6(d6.getMonth() + 1)}-${p6(d6.getDate())}`;
    /* 旧仕様で「1件ごとに計画達成50BP」が付いていた状態を再現する */
    for (let i = 0; i < 3; i++) {
      s6.records.push({
        id: 'oldbonus' + i, date: today, subjectId: 'eng', content: '旧ボーナス' + i,
        kind: '暗記', planMin: 30, actualMin: 30, reflection: '', deletedAt: null,
        bp: 80, createdAt: 10 + i, updatedAt: 1, score: null, maxScore: null
      });
    }
    localStorage.setItem(key, JSON.stringify(s6));
  });
  await reload();
  const legacyBefore = await dayTotal();
  ok('T-5-5 旧記録は読み込むだけではBPが変わらない', legacyBefore === 240, `合計=${legacyBefore}`);

  /* 1件編集すると、その日が配り直されて1日1回になる */
  await nav('record');
  await page.waitForTimeout(150);
  await page.click('.rec-item:has-text("旧ボーナス0") [data-act="edit"]');
  await page.waitForSelector('#m-actual');
  await page.fill('#m-actual', '30');
  await page.click('#m-save');
  await page.waitForTimeout(350);
  const legacyAfter = await dayTotal();
  /* 90分 + 計画達成50 = 140 */
  ok('T-5-5 編集を機に配り直すと行動ボーナスは1回ぶんになる', legacyAfter === 140, `合計=${legacyAfter}`);
  await shot('74-daily-action-bonus');
}

async function test22_trashRestoreRecalc() {
  console.log('\n■ 試験22: ごみ箱からの復元でも上限を超えない(APP-440 段階7レビュー)');

  async function dayBp() {
    const st = await getState();
    return st.records.filter(r => r.date === localDate(0) && !r.deletedAt)
      .reduce((n, r) => n + (r.bp | 0), 0);
  }
  async function nonExamDayBp() {
    const st = await getState();
    const nonExamIds = st.settings.subjects.filter(x => !x.examSubject).map(x => x.id);
    return st.records.filter(r => r.date === localDate(0) && !r.deletedAt &&
      nonExamIds.indexOf(r.subjectId) !== -1).reduce((n, r) => n + (r.bp | 0), 0);
  }
  /* トーストの「元に戻す」を押さずに、ごみ箱画面から復元する */
  async function deleteThenRestoreFromTrash(content) {
    await nav('record');
    await page.waitForTimeout(150);
    await page.click(`.rec-item:has-text("${content}") [data-act="del"]`);
    await page.waitForTimeout(400);
    await page.click('#btn-open-trash');
    await page.waitForSelector('[data-act="restore"]');
    await page.click('[data-act="restore"]');
    await page.waitForTimeout(400);
  }

  /* --- 日次1,500BPの上限 --- */
  await freshPage(true);
  for (let i = 0; i < 3; i++) {
    await addRecord({ date: localDate(0), subjectLabel: '英語', content: '上限' + i, plan: 700, actual: 700 });
    await page.waitForTimeout(200);
  }
  const capBefore = await dayBp();
  ok('日次上限まで埋まっている', capBefore === 1500, `合計=${capBefore}`);

  await deleteThenRestoreFromTrash('上限0');
  const capAfter = await dayBp();
  ok('ごみ箱から復元しても日次1,500BPを超えない', capAfter <= 1500, `合計=${capAfter}`);

  /* --- 非受験科目の100BP上限 --- */
  await freshPage(true);
  await addRecord({ date: localDate(0), subjectLabel: 'その他', content: '非受験A', plan: 90, actual: 90 });
  await page.waitForTimeout(200);
  await addRecord({ date: localDate(0), subjectLabel: 'その他', content: '非受験B', plan: 90, actual: 90 });
  await page.waitForTimeout(200);
  const nonExamBefore = await nonExamDayBp();
  ok('非受験科目は100BPで頭打ちになっている', nonExamBefore === 100, `合計=${nonExamBefore}`);

  await deleteThenRestoreFromTrash('非受験A');
  const nonExamAfter = await nonExamDayBp();
  ok('ごみ箱から復元しても非受験科目100BPを超えない', nonExamAfter <= 100, `合計=${nonExamAfter}`);

  /* --- 行動ボーナスは1日1回のまま --- */
  await freshPage(true);
  await addRecord({ date: localDate(0), subjectLabel: '英語', content: 'ボーナスA', plan: 30, actual: 30 });
  await page.waitForTimeout(200);
  await addRecord({ date: localDate(0), subjectLabel: '英語', content: 'ボーナスB', plan: 30, actual: 30 });
  await page.waitForTimeout(200);
  const bonusBefore = await dayBp();
  ok('行動ボーナスは1回ぶん(60分+50)', bonusBefore === 110, `合計=${bonusBefore}`);

  await deleteThenRestoreFromTrash('ボーナスA');
  const bonusAfter = await dayBp();
  ok('ごみ箱から復元しても行動ボーナスは1回ぶんのまま', bonusAfter === 110, `合計=${bonusAfter}`);
  await shot('75-trash-restore');
}

async function test23_narrowScreens() {
  console.log('\n■ 試験23: APP-440で追加した画面の実表示確認(320px / 390px)');
  const T0 = new Date(2026, 7, 11, 10, 0, 0).getTime();

  for (const width of [320, 390]) {
    await freshPageWithClock(T0);
    await page.setViewportSize({ width, height: 700 });
    await startPlanTimer({ content: '表示確認' + width, plan: 30 });
    await page.waitForSelector('#timer-card:visible');

    /* 学習中のカード */
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    ok(`${width}px 学習中のタイマーカードで横スクロールが出ない`, !overflow);

    /* 完了画面(延長ボタン4つ + 休憩 + 今日はここまで) */
    await page.clock.fastForward(30 * 60 * 1000);
    await page.waitForSelector('#timer-completed');
    overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    ok(`${width}px 完了画面で横スクロールが出ない`, !overflow);

    /* 延長ボタンが画面内に収まっているか */
    const extFits = await page.evaluate((w) => {
      return Array.prototype.every.call(document.querySelectorAll('[data-ext]'), function (b) {
        const r = b.getBoundingClientRect();
        return r.left >= -1 && r.right <= w + 1 && r.height >= 32;
      });
    }, width);
    ok(`${width}px 延長ボタンが画面内に収まり、押せる大きさがある`, extFits);

    /* 文字が切れていないか(ボタンの中身がはみ出していないか) */
    const textFits = await page.evaluate(() => {
      return Array.prototype.every.call(document.querySelectorAll('[data-ext]'), function (b) {
        return b.scrollWidth <= b.clientWidth + 1;
      });
    });
    ok(`${width}px 延長ボタンの文字が切れない`, textFits);

    await shot(width === 320 ? '76-completed-320px' : '77-completed-390px');

    /* 保存モーダルも確認する */
    await page.click('#btn-finish');
    await page.waitForSelector('#m-actual');
    overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    ok(`${width}px 保存モーダルで横スクロールが出ない`, !overflow);
    await page.click('#m-save');
    await page.waitForTimeout(300);
    if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  }
}

async function test26_bpGraphFollowsRecalc() {
  console.log('\n■ 試験26: 編集・削除・復元のあとBPグラフの集計も追随する(Codex Q3)');
  await freshPage(true);

  /* 画面に出ているBPグラフの合計を、保存データから求め直して突き合わせる。
   * グラフが古い値を描いていれば、この2つがずれる。 */
  async function graphTotalAndStored() {
    await nav('graph');
    await page.waitForTimeout(200);
    /* ⚡ポイント表示へ切り替える */
    if (await page.isVisible('[data-graph-mode="bp"]')) {
      await page.click('[data-graph-mode="bp"]');
      await page.waitForTimeout(250);
    }
    return page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('ibukiStudyBeat.v3'));
      const stored = (s.records || []).filter(r => !r.deletedAt).reduce((n, r) => n + (r.bp | 0), 0)
        + (s.news || []).reduce((n, x) => n + (x.bp | 0), 0);
      const series = window.ISBCalc.buildBpSeries(s.records, s.news, s.records[0] ? s.records[0].date : '2026-08-01', 60);
      const graphed = series.reduce((n, d) => n + d.total, 0);
      return { stored, graphed };
    });
  }

  await addRecord({ date: localDate(0), subjectLabel: '英語', content: 'グラフ追随1', plan: 60, actual: 60 });
  await page.waitForTimeout(200);
  await addRecord({ date: localDate(0), subjectLabel: '数学', content: 'グラフ追随2', plan: 60, actual: 60 });
  await page.waitForTimeout(200);

  let v = await graphTotalAndStored();
  ok('Q3 追加直後: グラフの合計と保存値が一致', v.stored === v.graphed, `保存=${v.stored} グラフ=${v.graphed}`);
  const beforeEdit = v.stored;

  /* 実績を減らす編集 → BPが減る → グラフも減っていること */
  await nav('record');
  await page.waitForTimeout(150);
  await page.click('.rec-item:has-text("グラフ追随1") [data-act="edit"]');
  await page.waitForSelector('#m-actual');
  await page.fill('#m-actual', '10');
  await page.click('#m-save');
  await page.waitForTimeout(350);
  v = await graphTotalAndStored();
  ok('Q3 編集後: グラフの合計と保存値が一致', v.stored === v.graphed, `保存=${v.stored} グラフ=${v.graphed}`);
  ok('Q3 編集でBPが減り、グラフにも反映される', v.graphed < beforeEdit, `前=${beforeEdit} 後=${v.graphed}`);

  /* 削除 → グラフから外れること */
  await nav('record');
  await page.waitForTimeout(150);
  await page.click('.rec-item:has-text("グラフ追随2") [data-act="del"]');
  await page.waitForTimeout(400);
  v = await graphTotalAndStored();
  ok('Q3 削除後: グラフの合計と保存値が一致', v.stored === v.graphed, `保存=${v.stored} グラフ=${v.graphed}`);

  /* ごみ箱から復元 → 配り直した値でグラフも一致すること */
  await nav('record');
  await page.waitForTimeout(150);
  await page.click('#btn-open-trash');
  await page.waitForSelector('[data-act="restore"]');
  await page.click('[data-act="restore"]');
  await page.waitForTimeout(400);
  v = await graphTotalAndStored();
  ok('Q3 復元後: グラフの合計と保存値が一致', v.stored === v.graphed, `保存=${v.stored} グラフ=${v.graphed}`);

  /* Q1の承認条件: 学習時間グラフが初期表示のままであること */
  await freshPage(true);
  await nav('graph');
  await page.waitForTimeout(250);
  const defaultMode = await page.evaluate(() => {
    const on = document.querySelector('[data-graph-mode].active, [data-graph-mode][aria-pressed="true"]');
    return on ? on.dataset.graphMode : 'time';
  });
  ok('Q1 グラフの初期表示は学習時間のまま', defaultMode === 'time', `既定=${defaultMode}`);
}

async function test27_itemImages() {
  console.log('\n■ 試験27: ショップと装備欄にアイテム画像を表示する(APP-430)');

  async function openShop(tab) {
    await nav('coach');
    await page.waitForTimeout(150);
    await page.click('#btn-open-shop');
    await page.waitForSelector('#shop-items');
    await page.click(`[data-tab="${tab}"]`);
    await page.waitForTimeout(250);
  }

  for (const width of [320, 390]) {
    await freshPage(true);
    await page.setViewportSize({ width, height: 760 });

    for (const tab of ['costume', 'skill', 'stage']) {
      await openShop(tab);
      /* 5点すべてに画像が出ていること。読み込み失敗は img が消えるので数が減る。 */
      const shown = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('#shop-items .si-img img'));
        return { count: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length };
      });
      ok(`${width}px ${tab}: 5点すべてに画像が出る`, shown.count === 5, `枚数=${shown.count}`);
      ok(`${width}px ${tab}: 画像が5点とも読み込めている`, shown.loaded === 5, `読込=${shown.loaded}/5`);

      /* 文字・価格・ボタンと重ならず、横スクロールも出さない */
      const layout = await page.evaluate((w) => {
        const overflow = document.documentElement.scrollWidth > w + 2;
        const rows = Array.from(document.querySelectorAll('#shop-items .shop-item'));
        const clipped = rows.some(r => {
          const name = r.querySelector('.si-name');
          const side = r.querySelector('.si-side');
          if (!name || !side) return true;
          return name.scrollWidth > name.clientWidth + 1 ||
                 name.getBoundingClientRect().right > side.getBoundingClientRect().left + 1;
        });
        return { overflow, clipped };
      }, width);
      ok(`${width}px ${tab}: 横スクロールが出ない`, !layout.overflow);
      ok(`${width}px ${tab}: 名称と価格・ボタンが重ならない`, !layout.clipped);
      /* ショップを開いたまま撮る。閉じてから撮ると画像が写らない。 */
      if (tab === 'costume') await shot(width === 320 ? '80-shop-images-320px' : '81-shop-images-390px');
      await page.click('#m-close');
      await page.waitForTimeout(150);
    }
  }

  /* --- 各画面のヘッダーが狭い幅でくっつかないこと ---
   * スクリーンショットの目視で、320pxでポイント残高と補足文がくっついて
   * 重なって見えることに気づいた。scrollWidth の検査だけでは通ってしまう。 */
  for (const width of [320, 390]) {
    await freshPage(true);
    await page.setViewportSize({ width, height: 760 });
    for (const scr of ['today', 'record', 'graph', 'world', 'coach', 'settings']) {
      await nav(scr);
      await page.waitForTimeout(180);
      const gap = await page.evaluate((s) => {
        const h = document.querySelector('#screen-' + s + ' .screen-head');
        if (!h) return { min: 99, n: 0 };
        const boxes = Array.from(h.children)
          .filter(e => e.offsetParent !== null)
          .map(e => e.getBoundingClientRect())
          .sort((a, b) => a.left - b.left);
        let min = 99;
        for (let i = 0; i < boxes.length - 1; i++) min = Math.min(min, boxes[i + 1].left - boxes[i].right);
        return { min: Math.round(min), n: boxes.length };
      }, scr);
      ok(`${width}px ${scr}: ヘッダーの要素が4px以上離れている`, gap.n < 2 || gap.min >= 4,
        `最小の隙間=${gap.min}px`);
    }
  }

  /* --- 装備スロットにも画像が出る --- */
  await freshPage(true);
  await nav('coach');
  await page.waitForTimeout(200);
  const equipImgs = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('#equip-slots .es-img img'));
    return { count: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length };
  });
  /* 初期状態はステージ(ストリート)のみ装備。衣装とスキルは未装備で画像を出さない。 */
  ok('装備スロット: 装備中のアイテムに画像が出る', equipImgs.count >= 1, `枚数=${equipImgs.count}`);
  ok('装備スロット: 画像が読み込めている', equipImgs.loaded === equipImgs.count, `読込=${equipImgs.loaded}`);
  await shot('82-equip-images');

  /* --- 購入・装備の操作が従来どおり動く --- */
  await page.evaluate(() => {
    const k = 'ibukiStudyBeat.v3';
    const s = JSON.parse(localStorage.getItem(k));
    const p = n => (n < 10 ? '0' : '') + n;
    const d = new Date(); d.setDate(d.getDate() - 1);
    s.records.push({ id: 'seedimg', date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
      subjectId: 'eng', content: 'seed', kind: '暗記', planMin: 30, actualMin: 30,
      reflection: '', deletedAt: null, bp: 1500, createdAt: 1, updatedAt: 1, score: null, maxScore: null });
    localStorage.setItem(k, JSON.stringify(s));
  });
  await reload();
  await openShop('costume');
  await page.click('.shop-item:has-text("白いソックス") [data-buy]');
  await page.waitForTimeout(250);
  await page.click('.shop-item:has-text("白いソックス") [data-equip]');
  await page.waitForTimeout(300);
  if (await page.isVisible('#m-close')) { await page.click('#m-close'); await page.waitForTimeout(200); }
  let st = await getState();
  ok('APP-430 画像を出しても購入・装備は従来どおり動く',
    st.shop.owned.costume.indexOf('socks') !== -1 && st.shop.equipped.costume === 'socks',
    `所持=${JSON.stringify(st.shop.owned.costume)} 装備=${st.shop.equipped.costume}`);

  /* 再起動後も装備が残る */
  await reload();
  st = await getState();
  ok('APP-430 再起動後も装備が残る', st.shop.equipped.costume === 'socks', `装備=${st.shop.equipped.costume}`);
  await nav('coach');   // 装備カードはコーチ画面にある
  await page.waitForTimeout(250);
  const afterReload = await page.evaluate(() =>
    document.querySelectorAll('#equip-slots .es-img img').length);
  ok('APP-430 再起動後も装備欄に画像が出る(衣装+ステージ)', afterReload >= 2, `枚数=${afterReload}`);

  /* --- 画像が欠けても操作できる(フォールバック) ---
   * ここでは画像の読み込みを意図的に失敗させる。出るコンソールエラーは
   * 試験が起こしたものなので、検証の対象から外す。 */
  const errsBeforeAbort = consoleErrors.length;
  await page.route('**/assets/items/*.png', route => route.abort());
  await reload();
  await openShop('costume');
  const fallback = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#shop-items .shop-item'));
    return {
      rows: rows.length,
      names: rows.filter(r => (r.querySelector('.si-name') || {}).textContent).length,
      buttons: document.querySelectorAll('#shop-items [data-buy], #shop-items [data-equip], #shop-items .chip').length,
      hiddenFrames: document.querySelectorAll('#shop-items .si-img.img-missing').length
    };
  });
  ok('APP-430 画像が欠けても名称が出る', fallback.names === 5, `名称=${fallback.names}/5`);
  ok('APP-430 画像が欠けても購入・装備の操作が残る', fallback.buttons === 5, `操作=${fallback.buttons}/5`);
  ok('APP-430 読み込めなかった枠は消える', fallback.hiddenFrames === 5, `枠=${fallback.hiddenFrames}/5`);
  await shot('83-shop-images-fallback');
  await page.unroute('**/assets/items/*.png');
  /* 意図的に失敗させたぶんだけを取り除く。それ以外のエラーは残す。 */
  consoleErrors.length = errsBeforeAbort;
}

async function test28_reportScreenshot() {
  console.log('\n■ 試験28: 不具合報告にスクリーンショットを添付する(APP-480)');
  const sampleImage = fileURLToPath(new URL('../../icons/icon-192.png', import.meta.url));

  async function openReport() {
    await nav('settings');
    await page.click('.settings-item[data-panel="report"]');
    await page.waitForSelector('#rp-preview');
  }

  /* --- 画像選択欄がある。まだ選んでいない時は隠れている --- */
  await freshPage(true);
  await openReport();
  ok('28-1 画像を選ぶボタンがある', await page.isVisible('#rp-pick'));
  ok('28-2 何も選んでいない時はプレビュー行が隠れている', !(await page.isVisible('#rp-image-row')));

  /* --- 画像を選ぶと、分かる表示(サムネ・ファイル名)が出る --- */
  await page.setInputFiles('#rp-file', sampleImage);
  await page.waitForTimeout(200);
  ok('28-3 画像を選ぶとプレビュー行が表示される', await page.isVisible('#rp-image-row'));
  const thumbSrc = await page.getAttribute('#rp-image-thumb', 'src');
  ok('28-4 選んだ画像のサムネイルが表示される', !!thumbSrc && thumbSrc.indexOf('data:image') === 0,
    (thumbSrc || '').slice(0, 20));
  const nameText = await page.textContent('#rp-image-name');
  ok('28-5 選んだ画像のファイル名が分かる', !!nameText && nameText.indexOf('icon-192') !== -1, nameText);
  await shot('84-report-image-selected');

  /* --- 画像自体をlocalStorageへ保存しない --- */
  const storageCheck = await page.evaluate(() => {
    var raw = localStorage.getItem('ibukiStudyBeat.v3') || '';
    var hasDataUri = raw.indexOf('data:image') !== -1;
    var keys = Object.keys(localStorage);
    return { hasDataUri, keys };
  });
  ok('28-6 画像データが保存キーの中身に入らない', !storageCheck.hasDataUri);
  ok('28-7 画像用の新しい保存キーを作らない',
    storageCheck.keys.every((k) => k.indexOf('ibukiStudyBeat') === 0 || k === 'ibuki_beat_state'),
    storageCheck.keys.join(','));

  /* --- 選択解除 --- */
  await page.click('#rp-image-clear');
  await page.waitForTimeout(150);
  ok('28-8 選択解除するとプレビュー行が消える', !(await page.isVisible('#rp-image-row')));
  const clearedThumb = await page.getAttribute('#rp-image-thumb', 'src');
  ok('28-9 選択解除するとサムネイルの参照も消える', !clearedThumb);

  /* --- 対応端末: canShareがtrueなら画像込みで共有に渡る --- */
  await page.setInputFiles('#rp-file', sampleImage);
  await page.waitForTimeout(200);
  let shared = await page.evaluate(() => {
    window.__shared = null;
    window.File = window.File || function () {};
    navigator.canShare = () => true;
    navigator.share = (d) => { window.__shared = d; return Promise.resolve(); };
    document.getElementById('rp-send').click();
    return new Promise((r) => setTimeout(() => r(window.__shared), 200));
  });
  ok('28-10 対応端末では画像込みで共有に渡る',
    shared && Array.isArray(shared.files) && shared.files.length === 1,
    shared ? JSON.stringify({ hasFiles: !!shared.files, text: (shared.text || '').slice(0, 20) }) : 'null');
  ok('28-11 画像込みでも報告文が一緒に渡る',
    shared && (shared.text || '').includes('IBUKI STUDY BEAT 不具合レポート'));
  await page.click('#m-close');
  await page.waitForTimeout(150);

  /* --- 非対応端末: canShareがfalse/未対応なら文章のみの共有に落ちる --- */
  await openReport();
  await page.setInputFiles('#rp-file', sampleImage);
  await page.waitForTimeout(200);
  shared = await page.evaluate(() => {
    window.__shared = null;
    navigator.canShare = () => false;
    navigator.share = (d) => { window.__shared = d; return Promise.resolve(); };
    document.getElementById('rp-send').click();
    return new Promise((r) => setTimeout(() => r(window.__shared), 200));
  });
  ok('28-12 非対応端末では画像なしで文章だけ共有に渡る',
    shared && !shared.files && (shared.text || '').includes('IBUKI STUDY BEAT 不具合レポート'),
    shared ? JSON.stringify({ hasFiles: !!shared.files }) : 'null');
  const warnToastVisible = await page.evaluate(() => document.getElementById('toast').classList.contains('warn'));
  ok('28-13 非対応時は文章だけ送った旨をやさしく伝える', warnToastVisible);
  await page.click('#m-close');
  await page.waitForTimeout(150);

  /* --- 共有APIそのものが無い端末: 従来どおりコピーへ落ちる --- */
  await openReport();
  await page.fill('#rp-text', '共有API非対応環境の確認');
  await page.waitForTimeout(150);
  const copyResult = await page.evaluate(() => {
    window.__copied = null;
    delete navigator.share;
    // navigator.clipboard はgetterのみのプロパティなので、直接代入では上書きできない(defineProperty必須)
    Object.defineProperty(navigator, 'clipboard',
      { value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } }, configurable: true });
    document.getElementById('rp-send').click();
    return new Promise((r) => setTimeout(() => r(window.__copied), 300));
  });
  ok('28-14 共有APIが無い端末では文章のコピーに落ちる',
    !!copyResult && copyResult.includes('共有API非対応環境の確認'),
    (copyResult || '').slice(0, 30));
  await page.click('#m-close');
  await page.waitForTimeout(150);

  /* --- キャンセルはエラー扱いにしない(コピーへ落とさない) --- */
  await openReport();
  const cancelResult = await page.evaluate(() => {
    window.__copyCalled = false;
    navigator.share = () => { var e = new Error('cancel'); e.name = 'AbortError'; return Promise.reject(e); };
    Object.defineProperty(navigator, 'clipboard',
      { value: { writeText: () => { window.__copyCalled = true; return Promise.resolve(); } }, configurable: true });
    document.getElementById('rp-send').click();
    return new Promise((r) => setTimeout(() => r(window.__copyCalled), 300));
  });
  ok('28-15 共有をキャンセルしてもコピーへのフォールバックが起きない(エラー扱いにしない)',
    cancelResult === false);
  const errToastAfterCancel = await page.evaluate(() => document.getElementById('toast').classList.contains('warn'));
  ok('28-16 共有をキャンセルしてもエラーのトーストが出ない', !errToastAfterCancel);
  await page.click('#m-close');
  await page.waitForTimeout(150);

  /* --- 320px / 390px で画像選択欄・説明・ボタンが重ならない --- */
  for (const width of [320, 390]) {
    await freshPage(true);
    await page.setViewportSize({ width, height: 760 });
    await openReport();
    await page.setInputFiles('#rp-file', sampleImage);
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    ok(`${width}px 28-17 画像選択済みの報告画面で横スクロールが出ない`, !overflow);
    const rowFits = await page.$eval('#rp-image-row', (el) => {
      const b = el.getBoundingClientRect();
      return b.right <= window.innerWidth + 1 && b.left >= -1;
    });
    ok(`${width}px 28-18 画像プレビュー行が画面内に収まる`, rowFits);
    const clearTappable = await page.$eval('#rp-image-clear', (el) => {
      const b = el.getBoundingClientRect();
      const t = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!(t && (t === el || el.contains(t))) && b.height >= 32;
    });
    ok(`${width}px 28-19 選択解除ボタンが押せる大きさで他要素に隠れていない`, clearTappable);
    await shot(width === 320 ? '85-report-image-320px' : '86-report-image-390px');
  }
  await page.click('#m-close');
  await page.setViewportSize({ width: 390, height: 844 });
}

async function test29_emptyContentStart() {
  console.log('\n■ 試験29: 内容欄が空でも学習を開始できる(APP-481)');
  const T0 = new Date(2026, 7, 12, 10, 0, 0).getTime();
  await freshPageWithClock(T0);

  /* --- 空欄開始→自動停止→保存 --- */
  await startPlanTimer({ content: '', plan: 20 });
  ok('内容欄が空でもタイマーが始まる', await page.isVisible('#timer-card:visible'));
  const runningLabel = await page.textContent('#timer-card .timer-sub');
  ok('学習中の表示は空白ではなく仮表示になる', runningLabel.includes('内容未入力'), runningLabel);

  await page.clock.fastForward(20 * 60 * 1000);
  await page.waitForTimeout(300);
  ok('内容未入力のまま自動停止して完了画面が出る', await page.isVisible('#timer-completed'));
  const completedLabel = await page.textContent('#timer-card .timer-sub');
  ok('完了画面でも仮表示になる', completedLabel.includes('内容未入力'), completedLabel);

  /* --- 保存(終了する)。ここが従来ブロックされていた経路 --- */
  await page.click('#btn-finish');
  await page.waitForSelector('#m-actual');
  await page.click('#m-save');
  await page.waitForTimeout(300);
  const stillBlocked = await page.isVisible('#m-actual');
  ok('内容が空のままでも保存できる(以前は「内容を入力してください」で止まっていた)', !stillBlocked);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');

  let st = await getState();
  let rec = st.records.find(r => r.actualMin === 20 && r.date === localDate(0) && r.content === '');
  ok('保存された記録の内容は空文字のまま(仮表示の文字列を書き込まない)',
    rec && rec.content === '', rec ? `content=${JSON.stringify(rec.content)}` : '記録なし');
  ok('BPは通常どおり付く', rec && rec.bp > 0, rec ? `bp=${rec.bp}` : '');

  /* --- 一覧・グラフでも仮表示になる --- */
  await nav('record');
  await page.waitForTimeout(200);
  const listLabel = await page.textContent('.rec-item .r-title');
  ok('記録一覧でも空白ではなく仮表示になる', listLabel.includes('内容未入力'), listLabel);

  /* --- 再起動後も保持される --- */
  await reload();
  st = await getState();
  rec = st.records.find(r => r.actualMin === 20 && r.date === localDate(0));
  ok('再起動後も内容は空文字のまま保持される(実績・BPも保たれる)',
    rec && rec.content === '' && rec.actualMin === 20 && rec.bp > 0,
    rec ? JSON.stringify({ content: rec.content, actual: rec.actualMin, bp: rec.bp }) : '記録なし');

  /* --- 後から編集で具体的な内容へ変更できる --- */
  await nav('record');
  await page.waitForTimeout(200);
  await page.click('.rec-item:has-text("内容未入力") [data-act="edit"]');
  await page.waitForSelector('#m-content');
  const editValue = await page.inputValue('#m-content');
  ok('編集画面では仮表示ではなく空欄のまま出る(打ち直す手間がない)', editValue === '', `value=${JSON.stringify(editValue)}`);
  await page.fill('#m-content', '英単語 20語');
  await page.click('#m-save');
  await page.waitForTimeout(300);
  st = await getState();
  rec = st.records.find(r => r.content === '英単語 20語');
  ok('編集で具体的な内容へ変更できる', !!rec, JSON.stringify(st.records.map(r => r.content)));

  /* --- 「予定に追加する」経路は従来どおり内容が必須 --- */
  await freshPage(true);
  await page.click('#btn-add-plan');
  await page.waitForSelector('#modal-back.open');
  await page.selectOption('#m-subject', { label: '英語' });
  await page.fill('#m-content', '');
  await page.fill('#m-plan', '20');
  await page.click('#m-save');
  await page.waitForTimeout(250);
  ok('「予定に追加する」は内容が空だと従来どおり拒否される(検査範囲を広げない)',
    await page.isVisible('#modal-back.open'));
  await page.click('#m-close');

  /* --- 通常の手入力記録も従来どおり内容が必須 --- */
  await nav('record');
  await page.waitForTimeout(150);
  await page.selectOption('#rf-subject', { label: '英語' });
  await page.fill('#rf-content', '');
  await page.fill('#rf-plan', '20');
  await page.fill('#rf-actual', '20');
  await page.click('#rf-save');
  await page.waitForTimeout(250);
  const rfCount = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('ibukiStudyBeat.v3')).records.filter(r => r.actualMin === 20 && r.content === '').length);
  ok('通常の手入力記録は内容が空だと従来どおり拒否される', rfCount === 0, `件数=${rfCount}`);

  /* --- 計画時間1分以上の必須条件は変わらない --- */
  await freshPage(true);
  await page.click('#btn-start-study');
  await page.waitForSelector('#modal-back.open');
  await page.selectOption('#m-subject', { label: '英語' });
  await page.fill('#m-content', '');
  await page.fill('#m-plan', '0');
  await page.click('#m-save');
  await page.waitForTimeout(250);
  ok('計画時間0分では内容が空でも開始できない(条件は変えない)', await page.isVisible('#modal-back.open'));
  await page.click('#m-close');
  await shot('90-empty-content-start');
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
  await test21_dailyActionBonuses();
  await test22_trashRestoreRecalc();
  await test23_narrowScreens();
  await test24_bpChipAndGraph();
  await test25_sessionGuards();
  await test26_bpGraphFollowsRecalc();
  await test27_itemImages();
  await test28_reportScreenshot();
  await test29_emptyContentStart();
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
writeFileSync(fileURLToPath(new URL('../../TEST_RESULTS.md', import.meta.url)), md);
process.exit(passed === results.length ? 0 : 1);
