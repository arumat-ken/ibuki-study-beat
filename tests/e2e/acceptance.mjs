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
  ok('フィーバー中の長時間記録は、発動中の30分だけ10倍になる', bpBoxText.includes('30分') && bpBoxText.includes('10.00倍') && bpBoxText.includes('90分') && bpBoxText.includes('1.00倍'), bpBoxText);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  st = await getState();
  const feverRec = st.records.find(r => r.content === 'fever-120min');
  ok('120分記録のBPが「30分×10倍+90分×1倍+行動ボーナス」で計算される(記録全体が10倍にならない)', feverRec.bp === 440, `bp=${feverRec.bp}`);

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
  ok('フィーバー(残30分)とエナジー(残60分)が重なる区間は、フィーバー優先(30分×10倍)→エナジー継続(30分×2倍)→通常(60分×1倍)に正しく分割される',
    overlapBpText.includes('30分') && overlapBpText.includes('10.00倍') && overlapBpText.includes('2.00倍') && overlapBpText.includes('60分') && overlapBpText.includes('1.00倍'), overlapBpText);
  if (await page.isVisible('#celebrate.open')) await page.click('#celebrate-close');
  st = await getState();
  const overlapRec = st.records.find(r => r.content === 'fever-energy-overlap');
  ok('フィーバー×エナジー重なり時のBPが期待値470(30×10+30×2+60×1+行動ボーナス50)と一致する(以前は平均配分で499になっていた)', overlapRec.bp === 470, `bp=${overlapRec.bp}`);

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

async function test16_bpChipAndGraph() {
  console.log('\n■ 試験16: ポイントの常時表示とポイントグラフ(APP-470)');
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

async function test17_sessionGuards() {
  console.log('\n■ 試験17: 学習セッションを不用意に失わないためのガード(APP-471)');
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

  async function startAndAge(name, minutes) {
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

  /* --- Codexレビュー Q6-2: 別の学習が始まっていたら上書きしない --- */
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
  await test16_bpChipAndGraph();
  await test17_sessionGuards();
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
