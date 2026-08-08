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

async function addRecord({ date, subjectLabel, content, kind = '暗記', plan = '', actual = '', score = '', maxScore = '' }) {
  await nav('record');
  if (date) await page.fill('#rf-date', date);
  if (subjectLabel) await page.selectOption('#rf-subject', { label: subjectLabel });
  await page.fill('#rf-content', content);
  await page.selectOption('#rf-kind', kind);
  await page.fill('#rf-plan', String(plan));
  await page.fill('#rf-actual', String(actual));
  if (kind === 'テスト') {
    if (score !== '') await page.fill('#rf-score', String(score));
    if (maxScore !== '') await page.fill('#rf-maxscore', String(maxScore));
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
  await page.selectOption('#m-kind', '暗記');
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
  await addRecord({ date: localDate(0), subjectLabel: '国語', content: '現代文 読解', kind: '読解', plan: 40, actual: 35 });
  await addRecord({ date: localDate(0), subjectLabel: '社会', content: '世界史 通史', kind: '復習', plan: 50, actual: 60 });
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
    localStorage.setItem('ibukiStudyBeat.v3', JSON.stringify(s));
  });
  await reload();
  await shot('20-today-demo');
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
  // 横向き
  await page.setViewportSize({ width: 844, height: 390 });
  await nav('graph');
  await page.waitForTimeout(400);
  await shot('28-graph-landscape');
  const chartH = await page.evaluate(() => document.querySelector('#chart-svg').getAttribute('height'));
  ok('横向きでグラフを優先表示', Number(chartH) >= 220, `h=${chartH}`);
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
