/* IBUKI STUDY BEAT — アプリ本体 */
(function () {
  'use strict';
  var C = window.ISBCalc;

  /* アプリのバージョン。更新時はここと sw.js の CACHE を一緒に上げる。
   * 保存キー(KEY)は絶対に変えないこと(過去の記録が読めなくなるため)。 */
  var APP_VERSION = '4.2.0';
  /* リリース表示用(画面右上)。更新のたびに日付を上げる。
   * モデル名は「未記録」固定とする(実行時のモデル識別子を断定してリポジトリの
   * 成果物に書き出さない方針のため。推測での記載はしない)。 */
  var BUILD_DATE = '2026-08-10';
  var BUILD_UPDATER = 'Claude Code';
  var BUILD_MODEL = '未記録';

  /* ================= ストレージ ================= */
  var KEY = 'ibukiStudyBeat.v3';
  var BACKUP_KEY = 'ibukiStudyBeat.v3.backup';
  var OLD_KEY = 'ibuki_beat_state';

  var state = null;
  var storageWarning = null;

  function todayStr() { return C.toDateStr(new Date()); }

  function loadState() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* プライベートモード等 */ }
    if (raw) {
      var parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
      var sane = parsed ? C.sanitizeState(parsed, todayStr()) : null;
      if (sane) return sane;
      // 破損: 元データは消さずに退避キーへ保存し、バックアップからの復元を試す
      try { localStorage.setItem(KEY + '.corrupt.' + Date.now(), raw); } catch (e) {}
      var bak = null;
      try { bak = localStorage.getItem(BACKUP_KEY); } catch (e) {}
      if (bak) {
        try {
          var bsane = C.sanitizeState(JSON.parse(bak).state, todayStr());
          if (bsane) {
            storageWarning = '保存データが読めなかったため、自動バックアップから復元しました。元データは端末内に退避してあります。';
            return bsane;
          }
        } catch (e) {}
      }
      storageWarning = '保存データが壊れていたため、新しい状態で開始します。元データは端末内に退避してあり、消去はしていません。';
      return C.defaultState(todayStr());
    }
    // 初回: 旧パイロット版からの移行
    var st = C.defaultState(todayStr());
    try {
      var oldRaw = localStorage.getItem(OLD_KEY);
      if (oldRaw) {
        var migrated = C.migrateOldPilot(JSON.parse(oldRaw), st.settings.subjects);
        if (migrated.length) {
          st.records = migrated;
          storageWarning = '旧アプリの学習ログ ' + migrated.length + '件を引き継ぎました。';
        }
      }
    } catch (e) {}
    return st;
  }

  var lastBackupDate = null;
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      var today = todayStr();
      if (lastBackupDate !== today) {
        localStorage.setItem(BACKUP_KEY, JSON.stringify({ backedUpAt: new Date().toISOString(), state: state }));
        lastBackupDate = today;
      }
    } catch (e) {
      toast('保存に失敗しました。空き容量を確認してください。', true);
    }
    // ポイントが変わる操作はすべて save を通るため、ここで常時表示を更新する
    try { renderBpBalance(); } catch (e2) { /* 起動途中は要素が無い */ }
  }

  function nextId(prefix) { state.seq = (state.seq || 1) + 1; return prefix + Date.now().toString(36) + state.seq; }

  /* ================= ユーティリティ ================= */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function subjectById(id) {
    for (var i = 0; i < state.settings.subjects.length; i++) {
      if (state.settings.subjects[i].id === id) return state.settings.subjects[i];
    }
    return { id: id, name: '(不明)', color: '#9AA0A6', visible: true };
  }
  function fmtDateJa(dateStr) {
    var d = C.parseDate(dateStr);
    var youbi = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + youbi + ')';
  }

  var toastTimer = null;
  function toast(msg, warn, actionLabel, actionFn) {
    var t = $('toast');
    $('toast-text').textContent = msg;
    t.classList.toggle('warn', !!warn);
    var btn = $('toast-action');
    if (actionLabel) {
      btn.style.display = '';
      btn.textContent = actionLabel;
      btn.onclick = function () { hideToast(); actionFn(); };
    } else {
      btn.style.display = 'none';
      btn.onclick = null;
    }
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, actionLabel ? 6000 : 3000);
  }
  function hideToast() { $('toast').classList.remove('show'); }

  /* --- 画面中央メッセージ --- */
  var centerTimer = null;
  /**
   * 画面中央にメッセージを表示する。
   * opts: { title, body, sub, img, buttonLabel, autoCloseMs, onConfirm }
   */
  function showCenterMessage(opts) {
    clearTimeout(centerTimer);
    var el = $('center-msg');
    $('cm-visual').innerHTML = opts.img ? charImg(opts.img, opts.title) : '';
    $('cm-title').textContent = opts.title;
    $('cm-body').innerHTML = esc(opts.body) + (opts.sub ? '<span class="cm-sub">' + esc(opts.sub) + '</span>' : '');
    $('cm-version').textContent = 'ver. ' + APP_VERSION;
    var btn = $('cm-btn');
    btn.textContent = opts.buttonLabel || '閉じる';
    btn.onclick = function () {
      hideCenterMessage();
      if (opts.onConfirm) opts.onConfirm();
    };
    el.classList.add('open');
    if (opts.autoCloseMs) {
      // あいさつは自動で閉じる。画面のどこをタップしてもすぐ閉じられる。
      centerTimer = setTimeout(hideCenterMessage, opts.autoCloseMs);
      el.onclick = function (e) { if (e.target === el) hideCenterMessage(); };
    } else {
      el.onclick = null;
    }
  }
  function hideCenterMessage() {
    clearTimeout(centerTimer);
    $('center-msg').classList.remove('open');
  }

  function openModal(html) {
    $('modal-body').innerHTML = html;
    $('modal-back').classList.add('open');
  }
  function closeModal() {
    $('modal-back').classList.remove('open');
    $('modal-body').innerHTML = '';
  }
  $('modal-back').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });

  /* IME変換中のEnterで誤動作しないためのガード */
  function imeSafe(e) { return e.isComposing || e.keyCode === 229; }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || imeSafe(e)) {
      if (e.key === 'Enter' && imeSafe(e)) e.stopPropagation();
      return;
    }
    var t = e.target;
    if (t && t.tagName === 'INPUT') e.preventDefault(); // フォームはボタンでのみ送信
  }, true);

  /* ================= キャラクター(BEATスター) =================
   * 確定デザイン(LEGOミニフィグ風マイケル)のポスターから切り出した画像を使用。
   * assets/char/ 以下に固定部品として管理する。 */
  function charImg(file, alt) {
    return '<img class="char-img" src="assets/char/' + file + '" alt="' + esc(alt || 'BEATスター') + '">';
  }

  var POSES = [
    { id: 'smooth', name: 'スムーズクリミナル', img: 'pose_smooth_criminal.png', cond: null },
    { id: 'thriller', name: 'スリラー', img: 'pose_thriller.png', cond: null },
    { id: 'billie', name: 'ビリー・ジーン', img: 'pose_billie_jean.png', cond: null },
    { id: 'moonwalk', name: 'ムーンウォーク', img: 'pose_moonwalk.png', cond: '7日連続記録で解放' },
    { id: 'heel', name: 'ヒール・トゥ', img: 'pose_heel_toe.png', cond: '受験イベント登録で解放' },
    { id: 'zerogravity', name: 'ゼロ・グラビティ・リーブ', img: 'pose_zero_gravity.png', cond: '累計20時間で解放' },
    { id: 'spin', name: 'スピンターン', img: 'pose_spin_turn.png', cond: 'テストを記録して解放' },
    { id: 'windmill', name: 'ウィンドミル', img: 'pose_windmill.png', cond: '累計50時間で解放' },
    { id: 'end', name: 'エンドポーズ', img: 'pose_end_pose.png', cond: '累計100時間で解放' }
  ];
  var currentPose = 'smooth';

  function poseUnlocked(p) {
    if (!p.cond) return true;
    return state.poseUnlocks.indexOf(p.id) !== -1;
  }
  function checkPoseUnlocks() {
    var recs = C.activeRecords(state.records);
    var unlocked = [];
    if (C.streakDays(state.records, todayStr(), state.shop.streakGuardDates) >= 7) unlocked.push('moonwalk');
    var total = 0;
    recs.forEach(function (r) { total += r.actualMin; });
    if (total >= 20 * 60) unlocked.push('zerogravity');
    if (total >= 50 * 60) unlocked.push('windmill');
    if (total >= 100 * 60) unlocked.push('end');
    if (recs.some(function (r) { return r.kind === 'テスト' && r.actualMin > 0; })) unlocked.push('spin');
    if (state.events.length > 0) unlocked.push('heel');
    var added = [];
    unlocked.forEach(function (id) {
      if (state.poseUnlocks.indexOf(id) === -1) { state.poseUnlocks.push(id); added.push(id); }
    });
    if (added.length) {
      save();
      var names = added.map(function (id) {
        for (var i = 0; i < POSES.length; i++) if (POSES[i].id === id) return POSES[i].name;
        return id;
      });
      toast('新しいポーズ「' + names.join('・') + '」を解放！');
    }
  }
  function poseById(id) {
    for (var i = 0; i < POSES.length; i++) if (POSES[i].id === id) return POSES[i];
    return POSES[0];
  }

  /* ================= 画面切り替え ================= */
  var currentScreen = 'today';
  function showScreen(name) {
    currentScreen = name;
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    $('screen-' + name).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.screen === name);
    });
    if (name === 'today') renderToday();
    if (name === 'record') renderRecordScreen();
    if (name === 'graph') renderGraphScreen();
    if (name === 'world') renderWorldScreen();
    if (name === 'coach') renderCoach();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.nav-btn').forEach(function (b) {
    b.addEventListener('click', function () { showScreen(b.dataset.screen); });
  });

  /* ================= 今日画面 ================= */
  function todayRecords() {
    return C.activeRecords(state.records).filter(function (r) { return r.date === todayStr(); });
  }

  function greeting() {
    var h = new Date().getHours();
    var total = 0;
    todayRecords().forEach(function (r) { total += r.actualMin; });
    var name = state.settings.userName || '伊吹';
    if (state.activeSession) return '集中してるね！このビート、最高だよ！';
    if (total >= state.settings.dailyGoalMin) return '今日の目標クリア！' + name + '、君がチャンピオンだ！';
    if (total > 0) return 'いい積み上げだね！この調子で刻んでいこう！';
    if (h < 5) return '夜更かしは体に毒だよ。無理せずいこう。';
    if (h < 11) return 'おはよう、' + name + '！今日も一緒にビートを刻もう！';
    if (h < 18) return 'よし、' + name + '！今日も一歩、未来へ進もう！';
    return '夜の集中タイム。まずは1曲分だけでもやってみよう！';
  }

  var sloganIndex = 0;
  function renderToday() {
    renderBpBalance();
    $('today-char-name').textContent = state.settings.characterName;
    $('today-greeting').textContent = greeting();
    $('today-beat').innerHTML = charImg(state.activeSession ? 'pose_billie_jean.png' : 'coach_stage.png');

    var slogans = state.settings.slogans;
    $('slogan-text').textContent = slogans[sloganIndex % slogans.length] || '一日一歩、未来の自分へ';

    // 予定リスト
    var recs = todayRecords();
    var listHtml = '';
    if (recs.length === 0) {
      listHtml = '<p class="muted">まだ予定がありません。「＋ 予定を追加」か「学習を開始する」から始めよう。</p>';
    } else {
      recs.forEach(function (r) {
        var sub = subjectById(r.subjectId);
        listHtml +=
          '<div class="plan-item" data-id="' + r.id + '">' +
          '<span class="dot" style="background:' + sub.color + '"></span>' +
          '<div class="p-main"><div class="p-title">' + esc(r.content) + '</div>' +
          '<div class="p-sub">' + esc(sub.name) + (r.kind ? '・' + esc(r.kind) : '') + '</div></div>' +
          (r.actualMin > 0
            ? '<span class="p-done">✓ ' + C.fmtDuration(r.actualMin) + '</span>'
            : '<span class="p-time">' + (r.planMin > 0 ? C.fmtDuration(r.planMin) : '') + '</span>') +
          '</div>';
      });
    }
    $('today-plans').innerHTML = listHtml;
    document.querySelectorAll('#today-plans .plan-item').forEach(function (el) {
      el.addEventListener('click', function () {
        if (state.activeSession) { toast('学習中です。終了してから選んでね。'); return; }
        startSessionForRecord(el.dataset.id);
      });
    });

    // 積み上げ
    var total = 0;
    recs.forEach(function (r) { total += r.actualMin; });
    var goal = state.settings.dailyGoalMin;
    $('today-total').textContent = C.fmtDuration(total);
    $('today-goal').textContent = '目標 ' + C.fmtDuration(goal);
    $('today-progress').style.width = Math.min(100, Math.round(total / goal * 100)) + '%';
    $('today-streak').textContent = C.streakDays(state.records, todayStr(), state.shop.streakGuardDates);
    var weekStart = C.addDays(todayStr(), -6);
    var weekSeries = C.buildSeries(state.records, weekStart, 7);
    $('today-week').textContent = C.fmtDuration(C.summarize(weekSeries).actualTotal);
    var exam = state.settings.examDate;
    if (exam) {
      var dd = C.diffDays(todayStr(), exam);
      $('today-exam-count').innerHTML = dd >= 0 ? '受験まで <b>' + dd + '</b>日' : '';
    } else {
      $('today-exam-count').textContent = '';
    }

    renderTimerCard();
    renderBoostCard();
    var banner = $('today-banner');
    if (storageWarning) {
      banner.innerHTML = '<div class="banner">' + esc(storageWarning) + '</div>';
    } else {
      banner.innerHTML = '';
    }
  }

  /* 獲得ポイントの常時表示(APP-470)。
   * どの画面にいても「いま何ポイント持っているか」が上部で見えるようにする。
   * タップすると今日のブースト内訳(倍率とBP残高)が開く。 */
  function renderBpBalance() {
    var text = C.calcBpBalance(state).toLocaleString('ja-JP');
    var els = document.querySelectorAll('.bp-balance-val');
    for (var i = 0; i < els.length; i++) els[i].textContent = text;
  }

  document.addEventListener('click', function (e) {
    var chip = e.target && e.target.closest ? e.target.closest('.bp-balance') : null;
    if (chip) openBoostModal();
  });

  /** 今日のブーストカード(GUI_SPEC_v4.md 2.1)。開始ボタンより下、BP残高より倍率を先に見せる。 */
  function renderBoostCard() {
    var boost = currentBoostBreakdown();
    var b = boost.breakdown;
    var balance = C.calcBpBalance(state);
    $('boost-mult').textContent = (boost.feverActive ? '🔥 ' : '') + boost.multiplier.toFixed(2) + '倍';
    var equipTotal = C.roundAmount(b.costume + b.skill + b.stage + b.consumable, 2);
    $('boost-sub').textContent =
      '装備+' + equipTotal.toFixed(2) + ' / 条件+' + b.condition.toFixed(2) + ' / BP ' + balance.toLocaleString('ja-JP');
  }

  $('btn-boost-card').addEventListener('click', openBoostModal);
  function openBoostModal() {
    var boost = currentBoostBreakdown();
    var b = boost.breakdown;
    var balance = C.calcBpBalance(state);
    var rows = [
      ['基礎', '1.00倍'],
      ['衣装', '+' + b.costume.toFixed(2) + '倍'],
      ['スキル', '+' + b.skill.toFixed(2) + '倍'],
      ['ステージ', '+' + b.stage.toFixed(2) + '倍'],
      ['コンディション(昨日の生活習慣)', '+' + b.condition.toFixed(2) + '倍'],
      ['消費アイテム', '+' + b.consumable.toFixed(2) + '倍']
    ];
    var html = '<h3>今日のブースト内訳<button class="icon-btn" id="m-close">✕</button></h3>';
    if (boost.feverActive) {
      html += '<p class="small" style="color:var(--gold-bright)">🔥 フィーバータイム発動中は他の倍率をすべて無視して10倍になります。</p>';
    } else {
      html += '<div class="boost-rows">' + rows.map(function (r) {
        return '<div class="boost-row"><span>' + esc(r[0]) + '</span><span>' + esc(r[1]) + '</span></div>';
      }).join('') + '</div>';
      html += '<p class="small muted" style="margin-top:8px">合計 ' + boost.multiplier.toFixed(2) + '倍(上限3.0倍)' + (boost.capped ? '・上限に到達しています' : '') + '</p>';
    }
    html += '<p class="small muted" style="margin-top:10px">BP残高 <b style="color:var(--gold-bright)">' + balance.toLocaleString('ja-JP') + '</b></p>';
    html += '<p class="small muted">装備・ショップは「コーチ」画面から変更できます。</p>';
    openModal(html);
    $('m-close').onclick = closeModal;
  }

  $('slogan-card').addEventListener('click', function () {
    if (state.settings.slogans.length > 1) {
      sloganIndex = (sloganIndex + 1) % state.settings.slogans.length;
      renderToday();
    }
  });

  $('btn-rename-char').addEventListener('click', openRenameModal);
  function openRenameModal() {
    openModal(
      '<h3>キャラクター名の変更<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<div class="field"><label for="m-charname">名前(10文字まで)</label>' +
      '<input type="text" id="m-charname" maxlength="10" value="' + esc(state.settings.characterName) + '"></div>' +
      '<button class="btn primary block" id="m-save">保存する</button>'
    );
    $('m-close').onclick = closeModal;
    $('m-save').onclick = function () {
      var v = $('m-charname').value.trim();
      if (!v) { toast('名前を入力してください', true); return; }
      state.settings.characterName = v.slice(0, 10);
      save(); closeModal(); renderToday(); toast('名前を「' + v + '」にしたよ！');
    };
  }

  /* --- 予定追加 / 記録フォームモーダル --- */
  function subjectOptions(selectedId) {
    return state.settings.subjects.filter(function (s) { return s.visible; }).map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (s.id === selectedId ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
  }
  /* 学習種別は科目ごとに変える(APP-460)。
   * 選択中の値がその科目の一覧に無い場合(科目を変えた・旧データを編集した)は、
   * 一覧の末尾にそのまま残して選択状態にする。過去の記録の値を勝手に書き換えない。 */
  function firstSubjectId() {
    var visible = state.settings.subjects.filter(function (s) { return s.visible; });
    return visible.length ? visible[0].id : '';
  }

  function kindOptions(selected, subjectId) {
    var kinds = C.studyKindsFor(subjectId);
    if (selected && kinds.indexOf(selected) === -1) kinds = kinds.concat([selected]);
    return kinds.map(function (k) {
      return '<option value="' + esc(k) + '"' + (k === selected ? ' selected' : '') + '>' + esc(k) + '</option>';
    }).join('');
  }

  /* 科目を変えたら、その科目の学習種別に入れ替える。
   * 入れ替え後の値で点数欄の出し分けも更新する。 */
  /* 記録画面の学習種別が、どの科目のものとして作られているか。
   * 設定で科目を消した・並べ替えたときに一覧を作り直す判定に使う。 */
  var rfKindSubjectId = null;

  /* 科目を変えたときの学習種別の入れ替え。
   * いま選んでいる種別が新しい科目にもあるなら、それを保つ。
   * 「テスト」はどの科目にもあるため、科目を変えても得点欄が閉じず、
   * 入力済みの得点が保存時に消えることがない。 */
  function refreshKindForSubject(kindEl, subjectId, scoreRowEl, openStyle) {
    var keep = kindEl.value;
    var next = C.studyKindsFor(subjectId).indexOf(keep) !== -1
      ? keep
      : C.defaultStudyKindFor(subjectId);
    kindEl.innerHTML = kindOptions(next, subjectId);
    if (scoreRowEl) {
      scoreRowEl.style.display = kindEl.value === C.TEST_KIND ? (openStyle || '') : 'none';
    }
  }

  function bindKindToSubject(subjectSelId, kindSelId, scoreRowId) {
    var subjEl = $(subjectSelId), kindEl = $(kindSelId);
    if (!subjEl || !kindEl) return;
    subjEl.addEventListener('change', function () {
      refreshKindForSubject(kindEl, subjEl.value, scoreRowId ? $(scoreRowId) : null, '');
      if (subjectSelId === 'rf-subject') rfKindSubjectId = subjEl.value;
    });
  }

  $('btn-add-plan').addEventListener('click', function () { openPlanModal(null); });
  function openPlanModal(thenStart) {
    openModal(
      '<h3>今日の予定を追加<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<div class="field"><label>科目</label><select id="m-subject">' + subjectOptions() + '</select></div>' +
      '<div class="field"><label>学習種別</label><select id="m-kind">' +
        kindOptions(C.defaultStudyKindFor(firstSubjectId()), firstSubjectId()) + '</select></div>' +
      '<div class="field"><label>内容</label><input type="text" id="m-content" placeholder="例: 英単語 20語" maxlength="100"></div>' +
      '<div class="field"><label>計画時間(分)</label><input type="number" id="m-plan" min="1" max="720" inputmode="numeric" value="30"></div>' +
      '<button class="btn primary block big" id="m-save">' + (thenStart ? 'この内容で開始する ▶' : '予定に追加する') + '</button>'
    );
    $('m-close').onclick = closeModal;
    bindKindToSubject('m-subject', 'm-kind', null);
    $('m-save').onclick = function () {
      var rec = {
        id: nextId('r'),
        date: todayStr(),
        subjectId: $('m-subject').value,
        content: $('m-content').value.trim(),
        kind: $('m-kind').value,
        planMin: parseIntSafe($('m-plan').value),
        actualMin: 0,
        score: null, maxScore: null, reflection: '',
        createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null
      };
      var v = C.validateRecord(rec, state.settings.subjects);
      if (!v.ok) { toast(v.errors[0], true); return; }
      state.records.push(rec);
      save(); closeModal(); renderToday();
      if (thenStart) startSessionForRecord(rec.id);
      else toast('予定を追加したよ！');
    };
  }

  function parseIntSafe(v) {
    if (v === '' || v == null) return 0;
    var n = Number(v);
    return (isFinite(n) && Math.floor(n) === n) ? n : NaN;
  }

  /* --- 学習セッション(タイマー) --- */
  var timerInterval = null;

  $('btn-start-study').addEventListener('click', function () {
    if (state.activeSession) {
      renderTimerCard();
      $('timer-card').scrollIntoView({ behavior: 'smooth' });
      return;
    }
    var pending = todayRecords().filter(function (r) { return r.actualMin === 0; });
    if (pending.length === 0) { openPlanModal(true); return; }
    var html = '<h3>どれから始める？<button class="icon-btn" id="m-close">✕</button></h3><div class="plan-list">';
    pending.forEach(function (r) {
      var sub = subjectById(r.subjectId);
      html += '<button class="plan-item" data-id="' + r.id + '" style="width:100%;cursor:pointer">' +
        '<span class="dot" style="background:' + sub.color + '"></span>' +
        '<div class="p-main" style="text-align:left"><div class="p-title">' + esc(r.content) + '</div>' +
        '<div class="p-sub">' + esc(sub.name) + '・計画' + C.fmtDuration(r.planMin) + '</div></div>▶</button>';
    });
    html += '</div><button class="btn block" id="m-new" style="margin-top:10px">＋ 新しい内容で開始</button>';
    openModal(html);
    $('m-close').onclick = closeModal;
    $('m-new').onclick = function () { closeModal(); openPlanModal(true); };
    document.querySelectorAll('#modal-body .plan-item').forEach(function (el) {
      el.addEventListener('click', function () { closeModal(); startSessionForRecord(el.dataset.id); });
    });
  });

  function startSessionForRecord(recordId) {
    var rec = state.records.find(function (r) { return r.id === recordId; });
    if (!rec) return;
    state.activeSession = { recordId: recordId, startTs: Date.now(), pausedAccum: 0, pausedAt: null };
    save();
    renderToday();
    toast('スタート！いいビートを刻もう！');
  }

  function sessionElapsedMs() {
    var s = state.activeSession;
    if (!s) return 0;
    var end = s.pausedAt || Date.now();
    return Math.max(0, end - s.startTs - s.pausedAccum);
  }

  function renderTimerCard() {
    var card = $('timer-card');
    clearInterval(timerInterval);
    if (!state.activeSession) { card.style.display = 'none'; return; }
    var rec = state.records.find(function (r) { return r.id === state.activeSession.recordId; });
    if (!rec) { state.activeSession = null; save(); card.style.display = 'none'; return; }
    var sub = subjectById(rec.subjectId);
    var paused = !!state.activeSession.pausedAt;
    card.style.display = '';
    card.innerHTML =
      '<h2>学習中</h2>' +
      '<div class="timer-big" id="timer-elapsed">0:00</div>' +
      '<div class="timer-sub">' + esc(sub.name) + '・' + esc(rec.content) +
      (rec.planMin > 0 ? '(計画 ' + C.fmtDuration(rec.planMin) + ')' : '') + '</div>' +
      '<div class="btn-row">' +
      '<button class="btn" id="btn-pause">' + (paused ? '▶ 再開' : '⏸ 一時停止') + '</button>' +
      '<button class="btn primary" id="btn-finish">終了する ✓</button>' +
      '</div>' +
      '<button class="btn ghost small" id="btn-discard" style="margin-top:8px;color:var(--dim)">記録せずにやめる</button>';
    function tick() {
      var ms = sessionElapsedMs();
      var m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60;
      $('timer-elapsed').textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }
    tick();
    if (!paused) timerInterval = setInterval(tick, 1000);
    $('btn-pause').onclick = function () {
      var ses = state.activeSession;
      if (ses.pausedAt) {
        ses.pausedAccum += Date.now() - ses.pausedAt;
        ses.pausedAt = null;
        toast('再開！ここからまた刻もう！');
      } else {
        ses.pausedAt = Date.now();
      }
      save(); renderTimerCard();
    };
    $('btn-finish').onclick = function () { openFinishModal(rec); };
    $('btn-discard').onclick = function () {
      openModal(
        '<h3>記録せずにやめる<button class="icon-btn" id="m-close">✕</button></h3>' +
        '<p class="small" style="margin-bottom:12px">今回の学習時間は保存されません。よろしいですか？</p>' +
        '<div class="btn-row"><button class="btn" id="m-cancel">戻る</button>' +
        '<button class="btn danger" id="m-ok">記録せずにやめる</button></div>'
      );
      $('m-close').onclick = $('m-cancel').onclick = closeModal;
      $('m-ok').onclick = function () {
        state.activeSession = null;
        save(); closeModal(); renderToday();
      };
    };
  }

  function openFinishModal(rec) {
    var elapsedMin = Math.max(1, Math.round(sessionElapsedMs() / 60000));
    var suggested = Math.min(C.MAX_MIN_PER_RECORD, rec.actualMin + elapsedMin);
    openModal(
      '<h3>おつかれさま！記録しよう<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<p class="small muted" style="margin-bottom:10px">' + esc(rec.content) + '(計測 ' + C.fmtDuration(elapsedMin) + ')</p>' +
      '<div class="field"><label for="m-actual">実績時間(分) — 修正できます</label>' +
      '<input type="number" id="m-actual" min="1" max="720" inputmode="numeric" value="' + suggested + '"></div>' +
      '<div class="field"><label for="m-refl">振り返り(ひとことでOK)</label>' +
      '<textarea id="m-refl" maxlength="300" placeholder="覚えた！例文とセットで覚えるといい。">' + esc(rec.reflection) + '</textarea></div>' +
      '<button class="btn primary block big" id="m-save">記録を保存する ✓</button>'
    );
    $('m-close').onclick = closeModal;
    $('m-save').onclick = function () {
      var actual = parseIntSafe($('m-actual').value);
      var candidate = Object.assign({}, rec, { actualMin: actual, reflection: $('m-refl').value.trim() });
      var v = C.validateRecord(candidate, state.settings.subjects);
      if (!v.ok) { toast(v.errors[0], true); return; }
      rec.actualMin = actual;
      rec.reflection = candidate.reflection;
      rec.updatedAt = Date.now();
      state.activeSession = null;
      var grant = grantStudyBP(rec);
      save(); closeModal();
      celebrateAfterSave(rec, grant);
      renderToday();
    };
  }

  /* --- お祝い演出 --- */
  function celebrateAfterSave(rec, grant) {
    checkPoseUnlocks();
    var total = 0;
    todayRecords().forEach(function (r) { total += r.actualMin; });
    var all = 0;
    C.activeRecords(state.records).forEach(function (r) { all += r.actualMin; });
    var streak = C.streakDays(state.records, todayStr(), state.shop.streakGuardDates);
    var msg = 'ナイスビート！', sub = C.fmtDuration(rec.actualMin) + ' 積み上げたよ', img = 'cele_nicebeat.png';
    if (all >= 100 * 60 && all - rec.actualMin < 100 * 60) {
      msg = '累計100時間達成！'; sub = 'ここまで来た君は本物だ！'; img = 'cele_gokaku.png';
    } else if (all >= 20 * 60 && all - rec.actualMin < 20 * 60) {
      msg = '累計20時間達成！'; sub = '積み重ねが力になってるよ！'; img = 'cele_hours20.png';
    } else if (streak === 7) {
      msg = '7日連続達成！'; sub = 'すごい！その調子！'; img = 'cele_streak7.png';
    } else if (total >= state.settings.dailyGoalMin && total - rec.actualMin < state.settings.dailyGoalMin) {
      msg = '今日の目標達成！'; sub = '君がチャンピオンだ！'; img = 'cele_goal.png';
    } else if (rec.kind === 'テスト') {
      msg = '模試おつかれさま！'; sub = 'よく頑張ったね！'; img = 'cele_exam_done.png';
    }
    $('celebrate-beat').innerHTML = charImg(img, msg);
    $('celebrate-msg').textContent = msg;
    $('celebrate-sub').textContent = sub;
    showBpResult(grant);
    $('celebrate').classList.add('open');
  }
  $('celebrate-close').addEventListener('click', function () {
    $('celebrate').classList.remove('open');
  });

  /* ================= BP(ポイント)獲得 (ver.4) =================
   * 仕様: docs/design/FEATURE_SPEC_v4.md A章・B章 / 決定事項 H-4
   * BPは記録の新規保存時に一度だけ計算してrec.bpに確定する。
   * 編集では再計算しない(時間を水増しして何度もボーナスを稼げないようにするため)。 */
  function subjectExamIds() {
    return state.settings.subjects.filter(function (s) { return s.examSubject; }).map(function (s) { return s.id; });
  }

  function pruneActiveBoosts() {
    var now = Date.now();
    var before = state.shop.activeBoosts.length;
    state.shop.activeBoosts = state.shop.activeBoosts.filter(function (b) { return b.expiresAt > now; });
    return state.shop.activeBoosts.length !== before;
  }

  /** 発動中の消費アイテムの効果を集計する(フィーバーは別枠のフラグで返す)。 */
  function activeConsumableEffect() {
    pruneActiveBoosts();
    var bonus = 0, feverActive = false;
    state.shop.activeBoosts.forEach(function (b) {
      if (b.kind === 'fever') { feverActive = true; return; }
      var item = C.consumableById(b.itemId);
      if (item) bonus += (item.bonus || 0);
    });
    return { bonus: bonus, feverActive: feverActive };
  }

  /*
   * 記録は「後から記録」で過去日にも保存できるため、BP計算は常に rec.date を基準にする
   * (実行中の実時刻=todayStr()ではない)。消費アイテム・早朝スキルなど実時刻に依存する
   * 効果は、rec.date が本当の今日のときだけ適用する。
   */
  function studyMultiplierForRecord(rec) {
    var prevDay = C.addDays(rec.date, -1);
    var conditionBonus = C.conditionBonusFromHabits(C.calcHabitBP(state.habits[prevDay]));
    /* 集中モード中は装備・消費アイテムの表示も実際のBP計算(buildStudyBPSegments)と一致させる。
     * ここで表示だけ+0.10倍のように出て、保存すると1.00倍になる、という食い違いを防ぐ。 */
    if (focusModeActive()) {
      return C.composeMultiplier({ conditionBonus: conditionBonus });
    }

    var shop = state.shop;
    var costumeItem = shop.equipped.costume ? C.costumeById(shop.equipped.costume) : null;
    var stageItem = shop.equipped.stage ? C.stageById(shop.equipped.stage) : null;
    var skillId = shop.equipped.skill;
    var isToday = rec.date === todayStr();

    var distinct = {};
    C.activeRecords(state.records).forEach(function (r) {
      if (r.date === rec.date && r.id !== rec.id && r.actualMin > 0) distinct[r.subjectId] = true;
    });
    if (rec.actualMin > 0) distinct[rec.subjectId] = true;

    var isLagging = skillId === 'moonwalk' &&
      C.laggingSubjectId(state.records, state.settings.subjects) === rec.subjectId;

    var skillBonus = skillId ? C.evaluateSkillBonus(skillId, {
      actualMin: rec.actualMin,
      distinctSubjectsToday: Object.keys(distinct).length,
      hour: isToday ? new Date().getHours() : -1,
      isLaggingSubject: isLagging
    }) : 0;

    var cons = isToday ? activeConsumableEffect() : { bonus: 0, feverActive: false };

    return C.composeMultiplier({
      feverActive: cons.feverActive,
      costumeBonus: costumeItem ? costumeItem.bonus : 0,
      skillBonus: skillBonus,
      stageBonus: stageItem ? stageItem.bonus : 0,
      conditionBonus: conditionBonus,
      consumableBonus: cons.bonus
    });
  }

  /** 今日のブースト内訳。今日画面のカードに使う(消費アイテム・コンディションを含む)。 */
  function currentBoostBreakdown() {
    return studyMultiplierForRecord({ id: '__preview__', date: todayStr(), subjectId: null, actualMin: 0 });
  }

  /* 連続日数・全受験科目ボーナスは「その日1回だけ」の仕様。同じ日に複数回保存しても
   * 再付与されないよう、付与済みかをstate.dailyBonusesで記録する(Codexレビュー指摘)。 */
  function dailyBonusGranted(date, key) {
    return !!(state.dailyBonuses[date] && state.dailyBonuses[date][key]);
  }
  function markDailyBonusGranted(date, key) {
    if (!state.dailyBonuses[date]) state.dailyBonuses[date] = {};
    state.dailyBonuses[date][key] = true;
  }

  function buildActionsForRecord(rec) {
    var actions = [];
    if (C.isPlanAchieved(rec.planMin, rec.actualMin)) actions.push('planAchieved');
    if (rec.reflection && rec.reflection.trim()) actions.push('reflection');

    var streak = C.streakDays(state.records, rec.date, state.shop.streakGuardDates);
    var streakKey = streak === 3 ? 'streak3' : streak === 7 ? 'streak7' : streak === 30 ? 'streak30' : null;
    var streakNewlyGranted = streakKey && !dailyBonusGranted(rec.date, streakKey);
    if (streakNewlyGranted) actions.push(streakKey);

    var examIds = subjectExamIds();
    var allExamNewlyGranted = false;
    if (examIds.length > 0 && !dailyBonusGranted(rec.date, 'allExamSubjects')) {
      var covered = {};
      C.activeRecords(state.records).forEach(function (r) {
        if (r.date === rec.date && r.actualMin > 0) covered[r.subjectId] = true;
      });
      if (examIds.every(function (id) { return covered[id]; })) {
        actions.push('allExamSubjects');
        allExamNewlyGranted = true;
      }
    }

    if (rec.kind === 'テスト' && typeof rec.score === 'number' && typeof rec.maxScore === 'number') {
      actions.push('mockExamTaken');
    }

    /* リズムキープ: 連続日数ボーナスBPを2倍に。その日初めて付与される時だけ倍にする
     * (2回目以降の記録では既にdailyBonusGrantedがtrueになりactionsに入らない)。 */
    if (streakNewlyGranted && state.shop.equipped.skill === 'rhythm_keep') {
      actions.push(streakKey);
    }

    if (streakNewlyGranted) markDailyBonusGranted(rec.date, streakKey);
    if (allExamNewlyGranted) markDailyBonusGranted(rec.date, 'allExamSubjects');
    return actions;
  }

  /**
   * 記録の実績時間を、消費アイテムの残り有効時間で区切ってセグメント化する。
   * フィーバー(30分)・エナジードリンク(60分)は「発動中に保存した記録の全体」ではなく
   * 「発動している時間帯だけ」に効くべきなので、ここで実績時間を分割する(Codexレビュー指摘)。
   * 過去日の記録・実績0分には消費アイテムを適用しない(既存仕様どおり)。
   */
  function buildStudyBPSegments(rec) {
    var prevDay = C.addDays(rec.date, -1);
    var conditionBonus = C.conditionBonusFromHabits(C.calcHabitBP(state.habits[prevDay]));

    /* 集中モード(受験30日前)は「金融・ショップ機能を自動でOFF」(FEATURE_SPEC_v4.md安全装置)。
     * 装備・消費アイテムは B章(ショップ)由来なのでここでは無効化する。
     * コンディション(生活習慣, A章)はショップ機能ではないためそのまま適用する。 */
    if (focusModeActive()) {
      var focusMult = C.composeMultiplier({ conditionBonus: conditionBonus }).multiplier;
      return [{ minutes: rec.actualMin, multiplier: focusMult }];
    }

    var shop = state.shop;
    var costumeItem = shop.equipped.costume ? C.costumeById(shop.equipped.costume) : null;
    var stageItem = shop.equipped.stage ? C.stageById(shop.equipped.stage) : null;
    var skillId = shop.equipped.skill;
    var isToday = rec.date === todayStr();

    var distinct = {};
    C.activeRecords(state.records).forEach(function (r) {
      if (r.date === rec.date && r.id !== rec.id && r.actualMin > 0) distinct[r.subjectId] = true;
    });
    if (rec.actualMin > 0) distinct[rec.subjectId] = true;

    var isLagging = skillId === 'moonwalk' &&
      C.laggingSubjectId(state.records, state.settings.subjects) === rec.subjectId;

    var skillBonus = skillId ? C.evaluateSkillBonus(skillId, {
      actualMin: rec.actualMin,
      distinctSubjectsToday: Object.keys(distinct).length,
      hour: isToday ? new Date().getHours() : -1,
      isLaggingSubject: isLagging
    }) : 0;

    var costumeBonus = costumeItem ? costumeItem.bonus : 0;
    var stageBonus = stageItem ? stageItem.bonus : 0;

    if (!isToday || rec.actualMin <= 0) {
      var plainMult = C.composeMultiplier({ costumeBonus: costumeBonus, skillBonus: skillBonus, stageBonus: stageBonus, conditionBonus: conditionBonus }).multiplier;
      return [{ minutes: rec.actualMin, multiplier: plainMult }];
    }

    pruneActiveBoosts();
    var now = Date.now();
    var actualMin = rec.actualMin;
    /* 実績時間を「今から経過した分」の並びとみなし、各アイテムの残り有効時間(今からの
     * 分数)を境界として区切る。フィーバーが効いている区間は他の倍率を無視して10倍(H-4)。
     * それ以外の区間は、まだ有効なエナジードリンクの倍率を(複数使用時は合算して)適用する。
     * 「残り時間で平均配分」ではなく実際の区間ごとに計算することで、フィーバーとエナジーが
     * 重なる場合や複数のエナジードリンクを使った場合でも正しい時間だけに効かせる。 */
    var feverRemains = [], timedBoosts = [], dayBonus = 0;
    state.shop.activeBoosts.forEach(function (b) {
      var item = C.consumableById(b.itemId);
      if (!item) return;
      var remain = Math.max(0, (b.expiresAt - now) / 60000);
      if (remain <= 0) return;
      if (b.kind === 'fever') feverRemains.push(remain);
      else if (b.kind === 'day') dayBonus += item.bonus;
      else if (b.kind === 'timed') timedBoosts.push({ remain: remain, bonus: item.bonus });
    });

    var boundaries = [0, actualMin];
    feverRemains.forEach(function (r) { if (r > 0 && r < actualMin) boundaries.push(r); });
    timedBoosts.forEach(function (t) { if (t.remain > 0 && t.remain < actualMin) boundaries.push(t.remain); });
    boundaries.sort(function (a, b) { return a - b; });
    boundaries = boundaries.filter(function (v, i) { return i === 0 || v !== boundaries[i - 1]; });

    var segments = [];
    for (var i = 0; i < boundaries.length - 1; i++) {
      var segStart = boundaries[i], segEnd = boundaries[i + 1];
      var segMinutes = segEnd - segStart;
      if (segMinutes <= 0) continue;
      var feverHere = feverRemains.some(function (r) { return r > segStart; });
      var mult;
      if (feverHere) {
        mult = C.FEVER_MULTIPLIER;
      } else {
        var timedBonusHere = 0;
        timedBoosts.forEach(function (t) { if (t.remain > segStart) timedBonusHere += t.bonus; });
        mult = C.composeMultiplier({
          costumeBonus: costumeBonus, skillBonus: skillBonus, stageBonus: stageBonus, conditionBonus: conditionBonus,
          consumableBonus: dayBonus + timedBonusHere
        }).multiplier;
      }
      segments.push({ minutes: segMinutes, multiplier: mult });
    }
    /* boundariesは常に[0, actualMin]を含み(isToday && actualMin>0はここまでに保証済み)、
     * ループは必ず1つ以上のセグメントを生成するため空になることはない。 */
    /* 端数丸めで合計が実績時間とズレないよう、最後のセグメントで吸収する。 */
    var sumMin = segments.reduce(function (s, seg) { return s + seg.minutes; }, 0);
    segments[segments.length - 1].minutes += (actualMin - sumMin);
    return segments;
  }

  /**
   * 記録1件のBPを計算してrec.bpに確定する。呼び出し前にrecはstate.recordsに
   * 入っている必要がある(今日の他の記録との合算・上限判定のため)。
   * セグメントごとに倍率が異なる場合があるため、日次上限はcalcStudyBPを連鎖呼び出しして
   * 正しく累積させる(1セグメント目のtodayTotalAfterを2セグメント目の入力にする)。
   */
  function grantStudyBP(rec) {
    var segments = buildStudyBPSegments(rec);
    var subj = subjectById(rec.subjectId);
    var isExamSubject = subj ? subj.examSubject : true;
    var actions = buildActionsForRecord(rec);
    var todayTotalBP = 0, todayNonExamBP = 0;
    C.activeRecords(state.records).forEach(function (r) {
      if (r.date !== rec.date || r.id === rec.id) return;
      todayTotalBP += (r.bp || 0);
      var s = subjectById(r.subjectId);
      if (s && !s.examSubject) todayNonExamBP += (r.bp || 0);
    });

    var granted = 0, baseBP = 0, multipliedBP = 0, bonusBP = 0;
    var nonExamCapped = false, dailyCapped = false;
    segments.forEach(function (seg, i) {
      var segActions = (i === segments.length - 1) ? actions : []; // 行動ボーナスは最後のセグメントにまとめて重複計上を防ぐ
      var segResult = C.calcStudyBP({
        minutes: seg.minutes, multiplier: seg.multiplier, actions: segActions,
        todayTotalBP: todayTotalBP, todayNonExamBP: todayNonExamBP, isExamSubject: isExamSubject
      });
      granted += segResult.grantedBP;
      baseBP += segResult.baseBP;
      multipliedBP += segResult.multipliedBP;
      bonusBP += segResult.bonusBP;
      nonExamCapped = nonExamCapped || segResult.nonExamCapped;
      dailyCapped = dailyCapped || segResult.dailyCapped;
      todayTotalBP = segResult.todayTotalAfter;
      todayNonExamBP = segResult.todayNonExamAfter;
    });
    rec.bp = granted;
    return {
      result: {
        baseBP: baseBP, multipliedBP: multipliedBP, bonusBP: bonusBP, grantedBP: granted,
        nonExamCapped: nonExamCapped, dailyCapped: dailyCapped
      },
      segments: segments
    };
  }

  function showBpResult(grant) {
    if (!grant || grant.result.grantedBP <= 0) { $('celebrate-bp').style.display = 'none'; return; }
    var r = grant.result;
    var lines = ['<b>+' + r.grantedBP + ' BP</b> 獲得！'];
    var feverUsed = false;
    grant.segments.forEach(function (seg) {
      if (seg.minutes <= 0) return;
      lines.push(Math.round(seg.minutes) + '分 × ' + seg.multiplier.toFixed(2) + '倍');
      if (seg.multiplier === C.FEVER_MULTIPLIER) feverUsed = true;
    });
    if (r.bonusBP > 0) lines.push('行動ボーナス +' + r.bonusBP + 'BP');
    if (feverUsed) lines.push('🔥 フィーバータイムが一部の時間に適用されたよ');
    if (r.nonExamCapped) lines.push('非受験科目の1日上限(100BP)に到達したよ');
    if (r.dailyCapped) lines.push('1日の獲得上限(1,500BP)に到達したよ');
    $('celebrate-bp').innerHTML = lines.join('<br>');
    $('celebrate-bp').style.display = '';
  }

  /* ================= 学習記録画面 ================= */
  function renderRecordScreen() {
    // フォーム初期化(選択肢だけ更新、入力中の値は保持)
    var subjSel = $('rf-subject');
    var cur = subjSel.value;
    subjSel.innerHTML = subjectOptions(cur);
    // 設定で科目を消した・並べ替えたときは選択が別の科目へ移る。
    // その場合は学習種別の一覧も作り直す(古い科目の一覧が残らないように)。
    if ($('rf-kind').options.length === 0 || rfKindSubjectId !== subjSel.value) {
      $('rf-kind').innerHTML = kindOptions(C.defaultStudyKindFor(subjSel.value), subjSel.value);
      rfKindSubjectId = subjSel.value;
    }
    if (!$('rf-date').value) $('rf-date').value = todayStr();
    $('rf-score-row').style.display = $('rf-kind').value === C.TEST_KIND ? '' : 'none';
    renderRecordList();
  }

  $('rf-kind').addEventListener('change', function () {
    $('rf-score-row').style.display = this.value === C.TEST_KIND ? '' : 'none';
  });
  bindKindToSubject('rf-subject', 'rf-kind', 'rf-score-row');

  $('record-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var kind = $('rf-kind').value;
    var scoreV = $('rf-score').value, maxV = $('rf-maxscore').value;
    var rec = {
      id: nextId('r'),
      date: $('rf-date').value,
      subjectId: $('rf-subject').value,
      content: $('rf-content').value.trim(),
      kind: kind,
      planMin: parseIntSafe($('rf-plan').value),
      actualMin: parseIntSafe($('rf-actual').value),
      score: (kind === 'テスト' && scoreV !== '') ? parseIntSafe(scoreV) : null,
      maxScore: (kind === 'テスト' && maxV !== '') ? parseIntSafe(maxV) : null,
      reflection: $('rf-reflection').value.trim(),
      createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null
    };
    var v = C.validateRecord(rec, state.settings.subjects);
    if (!v.ok) { toast(v.errors[0], true); return; }
    state.records.push(rec);
    var grant = rec.actualMin > 0 ? grantStudyBP(rec) : null;
    save();
    $('rf-content').value = ''; $('rf-plan').value = ''; $('rf-actual').value = '';
    $('rf-score').value = ''; $('rf-maxscore').value = ''; $('rf-reflection').value = '';
    renderRecordList();
    checkPoseUnlocks();
    if (rec.actualMin > 0) celebrateAfterSave(rec, grant);
    else toast('保存したよ！');
  });

  function renderRecordList() {
    var recs = C.activeRecords(state.records).slice().sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt - a.createdAt);
    });
    if (recs.length === 0) {
      $('record-list').innerHTML = '<p class="muted">まだ記録がありません。</p>';
      return;
    }
    var html = '', lastDate = null;
    recs.slice(0, 120).forEach(function (r) {
      if (r.date !== lastDate) {
        html += '<div class="rec-group-date">' + fmtDateJa(r.date) + '</div>';
        lastDate = r.date;
      }
      var sub = subjectById(r.subjectId);
      var scoreTxt = (r.score != null && r.maxScore != null) ? '・' + r.score + '/' + r.maxScore + '点' : '';
      html += '<div class="rec-item" data-id="' + r.id + '">' +
        '<span class="dot" style="background:' + sub.color + '"></span>' +
        '<div class="r-main"><div class="r-title">' + esc(r.content) + '</div>' +
        '<div class="r-sub">' + esc(sub.name) + '・' + esc(r.kind) +
        '・計画' + r.planMin + '分 / 実績' + r.actualMin + '分' + scoreTxt + '</div>' +
        (r.reflection ? '<div class="r-refl">' + esc(r.reflection) + '</div>' : '') +
        '</div>' +
        '<div class="rec-actions">' +
        '<button class="icon-btn" data-act="edit" aria-label="編集">✏️</button>' +
        '<button class="icon-btn danger" data-act="del" aria-label="削除">🗑</button>' +
        '</div></div>';
    });
    $('record-list').innerHTML = html;
    document.querySelectorAll('#record-list .icon-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = btn.closest('.rec-item').dataset.id;
        if (btn.dataset.act === 'edit') openEditRecord(id);
        else deleteRecord(id);
      });
    });
  }

  function openEditRecord(id) {
    var rec = state.records.find(function (r) { return r.id === id; });
    if (!rec) return;
    openModal(
      '<h3>記録を編集<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<div class="field-row">' +
      '<div class="field"><label>日付</label><input type="date" id="m-date" value="' + rec.date + '"></div>' +
      '<div class="field"><label>科目</label><select id="m-subject">' + subjectOptions(rec.subjectId) + '</select></div>' +
      '</div>' +
      '<div class="field"><label>内容</label><input type="text" id="m-content" maxlength="100" value="' + esc(rec.content) + '"></div>' +
      '<div class="field"><label>学習種別</label><select id="m-kind">' + kindOptions(rec.kind, rec.subjectId) + '</select></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>計画(分)</label><input type="number" id="m-plan" min="0" max="720" inputmode="numeric" value="' + rec.planMin + '"></div>' +
      '<div class="field"><label>実績(分)</label><input type="number" id="m-actual" min="0" max="720" inputmode="numeric" value="' + rec.actualMin + '"></div>' +
      '</div>' +
      '<div class="field-row" id="m-score-row" style="display:' + (rec.kind === 'テスト' ? 'flex' : 'none') + '">' +
      '<div class="field"><label>得点</label><input type="number" id="m-score" min="0" inputmode="numeric" value="' + (rec.score != null ? rec.score : '') + '"></div>' +
      '<div class="field"><label>満点</label><input type="number" id="m-maxscore" min="1" inputmode="numeric" value="' + (rec.maxScore != null ? rec.maxScore : '') + '"></div>' +
      '</div>' +
      '<div class="field"><label>振り返り</label><textarea id="m-refl" maxlength="300">' + esc(rec.reflection) + '</textarea></div>' +
      '<button class="btn primary block" id="m-save">保存する ✓</button>'
    );
    $('m-close').onclick = closeModal;
    $('m-kind').onchange = function () {
      $('m-score-row').style.display = this.value === C.TEST_KIND ? 'flex' : 'none';
    };
    $('m-subject').onchange = function () {
      refreshKindForSubject($('m-kind'), this.value, $('m-score-row'), 'flex');
    };
    $('m-save').onclick = function () {
      var kind = $('m-kind').value;
      var scoreV = $('m-score').value, maxV = $('m-maxscore').value;
      var cand = Object.assign({}, rec, {
        date: $('m-date').value,
        subjectId: $('m-subject').value,
        content: $('m-content').value.trim(),
        kind: kind,
        planMin: parseIntSafe($('m-plan').value),
        actualMin: parseIntSafe($('m-actual').value),
        score: (kind === 'テスト' && scoreV !== '') ? parseIntSafe(scoreV) : null,
        maxScore: (kind === 'テスト' && maxV !== '') ? parseIntSafe(maxV) : null,
        reflection: $('m-refl').value.trim()
      });
      var v = C.validateRecord(cand, state.settings.subjects);
      if (!v.ok) { toast(v.errors[0], true); return; }
      Object.assign(rec, cand, { updatedAt: Date.now() });
      save(); closeModal(); renderRecordList(); renderToday();
      toast('更新したよ！');
    };
  }

  function deleteRecord(id) {
    var rec = state.records.find(function (r) { return r.id === id; });
    if (!rec) return;
    rec.deletedAt = Date.now();
    save(); renderRecordList(); renderToday();
    toast('削除しました(ごみ箱へ移動)', false, '元に戻す', function () {
      rec.deletedAt = null;
      save(); renderRecordList(); renderToday();
      toast('元に戻したよ！');
    });
  }

  $('btn-open-trash').addEventListener('click', function () {
    var trashed = state.records.filter(function (r) { return r.deletedAt; })
      .sort(function (a, b) { return b.deletedAt - a.deletedAt; });
    var html = '<h3>ごみ箱<button class="icon-btn" id="m-close">✕</button></h3>';
    if (trashed.length === 0) {
      html += '<p class="muted">ごみ箱は空です。</p>';
    } else {
      trashed.forEach(function (r) {
        var sub = subjectById(r.subjectId);
        html += '<div class="rec-item" data-id="' + r.id + '">' +
          '<span class="dot" style="background:' + sub.color + '"></span>' +
          '<div class="r-main"><div class="r-title">' + esc(r.content) + '</div>' +
          '<div class="r-sub">' + fmtDateJa(r.date) + '・' + esc(sub.name) + '・実績' + r.actualMin + '分</div></div>' +
          '<div class="rec-actions">' +
          '<button class="btn small" data-act="restore" style="min-height:40px">復元</button>' +
          '<button class="icon-btn danger" data-act="purge" aria-label="完全削除">✕</button>' +
          '</div></div>';
      });
    }
    openModal(html);
    $('m-close').onclick = closeModal;
    document.querySelectorAll('#modal-body [data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.closest('.rec-item').dataset.id;
        var rec = state.records.find(function (r) { return r.id === id; });
        if (!rec) return;
        if (btn.dataset.act === 'restore') {
          rec.deletedAt = null;
          save(); closeModal(); renderRecordList(); renderToday();
          toast('復元したよ！');
        } else {
          if (btn.dataset.confirmed) {
            state.records = state.records.filter(function (r) { return r.id !== id; });
            save(); closeModal(); renderRecordList();
            toast('完全に削除しました');
          } else {
            btn.dataset.confirmed = '1';
            btn.textContent = '確定?';
            setTimeout(function () { delete btn.dataset.confirmed; btn.textContent = '✕'; }, 2500);
          }
        }
      });
    });
  });

  /* ================= グラフ画面 ================= */
  var graph = {
    mode: 'week',
    endDate: todayStr(),
    visibleDays: 7,
    selectedDate: null
  };

  function graphAllRange() {
    var recs = C.activeRecords(state.records);
    var minD = todayStr(), maxD = todayStr();
    recs.forEach(function (r) { if (r.date < minD) minD = r.date; });
    state.events.forEach(function (e) { if (e.date > maxD) maxD = e.date; });
    if (state.settings.examDate && state.settings.examDate > maxD) maxD = state.settings.examDate;
    var span = C.diffDays(minD, maxD) + 1;
    return { start: minD, end: maxD, span: Math.max(7, Math.min(240, span)) };
  }

  function setRangeMode(mode) {
    graph.mode = mode;
    if (mode === 'day') { graph.visibleDays = 1; graph.endDate = graph.selectedDate || todayStr(); }
    if (mode === 'week') { graph.visibleDays = 7; graph.endDate = todayStr(); }
    if (mode === 'month') { graph.visibleDays = 31; graph.endDate = todayStr(); }
    if (mode === 'all') {
      var r = graphAllRange();
      graph.visibleDays = r.span;
      graph.endDate = r.end;
    }
    document.querySelectorAll('.range-tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.range === mode);
    });
    renderGraphScreen();
  }
  document.querySelectorAll('.range-tab').forEach(function (t) {
    t.addEventListener('click', function () { setRangeMode(t.dataset.range); });
  });

  /* グラフの種類。'time' = 学習時間(従来どおり) / 'bp' = ポイント(APP-470)。
   * 学習時間のグラフには手を触れず、ポイントは別の描画関数で描く。 */
  var graphMode = 'time';

  Array.prototype.forEach.call(document.querySelectorAll('#graph-mode-tabs .range-tab'), function (btn) {
    btn.addEventListener('click', function () {
      graphMode = btn.getAttribute('data-mode');
      Array.prototype.forEach.call(document.querySelectorAll('#graph-mode-tabs .range-tab'), function (b) {
        b.classList.toggle('active', b === btn);
      });
      renderGraphScreen();
    });
  });

  function renderGraphScreen() {
    if (graphMode === 'bp') return renderBpGraphScreen();
    var days = graph.visibleDays;
    var start = C.addDays(graph.endDate, -(days - 1));
    var series = C.buildSeries(state.records, start, days);
    var sum = C.summarize(series);
    var unit = state.settings.axis.unit;
    var unitLabel = unit === 'hours' ? '時間' : '分';

    function fmtStat(min) {
      return unit === 'hours' ? (Math.round(min / 6) / 10) + unitLabel : min + unitLabel;
    }
    $('graph-stats').innerHTML =
      '<div class="stat-chip c-plan">計画合計<b>' + fmtStat(sum.planTotal) + '</b></div>' +
      '<div class="stat-chip c-act">実績合計<b>' + fmtStat(sum.actualTotal) + '</b></div>' +
      '<div class="stat-chip c-rate">達成率<b>' + (sum.rate != null ? sum.rate + '%' : '—') + '</b></div>' +
      '<div class="stat-chip c-cplan">累積計画<b>' + fmtStat(sum.cumPlan) + '</b></div>' +
      '<div class="stat-chip c-cact">累積実績<b>' + fmtStat(sum.cumActual) + '</b></div>';

    // 凡例
    var lg = '';
    state.settings.subjects.filter(function (s) { return s.visible; }).forEach(function (s) {
      lg += '<span class="lg"><span class="sw" style="background:' + s.color + '"></span>' + esc(s.name) + '</span>';
    });
    lg += '<span class="lg"><span class="ln" style="background:#3baa5c"></span>累積計画</span>';
    lg += '<span class="lg"><span class="ln" style="background:#3b82f6"></span>累積実績</span>';
    lg += '<span class="lg">左:計画(薄) / 右:実績(濃)</span>';
    $('chart-legend').innerHTML = lg;

    drawChart(series, start, days);

    // 今日へ戻る
    var todayIn = start <= todayStr() && todayStr() <= graph.endDate;
    $('btn-goto-today').style.display = todayIn ? 'none' : '';

    renderDayDetail();
    renderEventList();
  }

  $('btn-goto-today').addEventListener('click', function () {
    graph.endDate = todayStr();
    renderGraphScreen();
  });

  /* ポイントのグラフ(APP-470)。
   * 棒 = その日に獲得したポイント(学習ぶんとニュースぶんの積み上げ)、
   * 線 = 期間内の累積。日付の範囲・スワイプ操作は学習時間と同じものを使う。 */
  function renderBpGraphScreen() {
    var days = graph.visibleDays;
    var start = C.addDays(graph.endDate, -(days - 1));
    var series = C.buildBpSeries(state.records, state.news, start, days);
    var sum = C.summarizeBp(series);
    var n = function (v) { return (v | 0).toLocaleString('ja-JP'); };

    $('graph-stats').innerHTML =
      '<div class="stat-chip c-act">獲得合計<b>' + n(sum.total) + '</b></div>' +
      '<div class="stat-chip c-plan">学習から<b>' + n(sum.studyTotal) + '</b></div>' +
      '<div class="stat-chip c-rate">ニュースから<b>' + n(sum.newsTotal) + '</b></div>' +
      '<div class="stat-chip c-cact">最高の1日<b>' + n(sum.best) + '</b></div>' +
      '<div class="stat-chip c-cplan">記録した日の平均<b>' + n(sum.average) + '</b></div>';

    $('chart-legend').innerHTML =
      '<span class="lg"><span class="sw" style="background:#d9b24a"></span>学習でもらったBP</span>' +
      '<span class="lg"><span class="sw" style="background:#4A90D9"></span>ニュースでもらったBP</span>' +
      '<span class="lg"><span class="ln" style="background:#3b82f6"></span>この期間の累積</span>' +
      '<span class="lg">いまの残高は上の ⚡ をタップ</span>';

    drawBpChart(series, start, days);

    var todayIn = start <= todayStr() && todayStr() <= graph.endDate;
    $('btn-goto-today').style.display = todayIn ? 'none' : '';
    $('day-detail').style.display = 'none';
    renderEventList();
  }

  function drawBpChart(series, start, days) {
    var wrap = $('chart-svg-wrap');
    var W = Math.max(280, wrap.clientWidth || 340);
    var isLandscape = window.matchMedia('(orientation: landscape)').matches && window.innerHeight < 500;
    var H = isLandscape ? Math.max(220, window.innerHeight - 150) : 320;
    var padL = 44, padR = 44, padT = 14, padB = 34;
    var plotW = Math.max(10, W - padL - padR);
    var plotH = Math.max(10, H - padT - padB);

    var maxBar = 0, maxCum = 0;
    series.forEach(function (d) {
      if (d.total > maxBar) maxBar = d.total;
      if (d.cum > maxCum) maxCum = d.cum;
    });
    maxBar = niceCeil(maxBar || 100);
    maxCum = niceCeil(maxCum || 100);

    var slot = plotW / Math.max(1, series.length);
    var barW = Math.max(3, Math.min(26, slot * 0.6));
    var svg = '';

    // 目盛り(左=1日の獲得、右=累積)
    for (var g = 0; g <= 4; g++) {
      var y = padT + plotH - (plotH * g / 4);
      svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (padL + plotW) + '" y2="' + y +
        '" stroke="#2a2a36" stroke-width="1"/>';
      svg += '<text x="' + (padL - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="#9a978f">' +
        shortNum(maxBar * g / 4) + '</text>';
      svg += '<text x="' + (padL + plotW + 6) + '" y="' + (y + 4) + '" font-size="10" fill="#3b82f6">' +
        shortNum(maxCum * g / 4) + '</text>';
    }

    // 棒(学習ぶんの上にニュースぶんを積む)
    series.forEach(function (d, i) {
      var cx = padL + slot * i + slot / 2;
      var x = cx - barW / 2;
      var yBase = padT + plotH;
      var hStudy = maxBar ? (d.study / maxBar) * plotH : 0;
      var hNews = maxBar ? (d.news / maxBar) * plotH : 0;
      if (hStudy > 0) {
        svg += '<rect x="' + x + '" y="' + (yBase - hStudy) + '" width="' + barW + '" height="' + hStudy +
          '" rx="2" fill="#d9b24a"/>';
      }
      if (hNews > 0) {
        svg += '<rect x="' + x + '" y="' + (yBase - hStudy - hNews) + '" width="' + barW + '" height="' + hNews +
          '" rx="2" fill="#4A90D9"/>';
      }
    });

    // 累積の線
    var pts = series.map(function (d, i) {
      var cx = padL + slot * i + slot / 2;
      var y = padT + plotH - (maxCum ? (d.cum / maxCum) * plotH : 0);
      return cx.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    svg += '<polyline points="' + pts + '" fill="none" stroke="#3b82f6" stroke-width="2" ' +
      'stroke-linejoin="round" stroke-linecap="round"/>';

    // 「今日」の目印(学習時間のグラフと揃える)
    var todayIdx = -1;
    series.forEach(function (d, i) { if (d.date === todayStr()) todayIdx = i; });
    if (todayIdx >= 0) {
      var tx = padL + slot * todayIdx + slot / 2;
      svg += '<line x1="' + tx + '" y1="' + padT + '" x2="' + tx + '" y2="' + (padT + plotH) +
        '" stroke="#333" stroke-width="1" stroke-dasharray="4 3"/>';
      svg += '<rect x="' + (tx - 18) + '" y="' + (padT - 2) + '" width="36" height="15" rx="3" fill="#1b1b25"/>';
      svg += '<text x="' + tx + '" y="' + (padT + 9) + '" text-anchor="middle" font-size="9" fill="#f0c75e">今日</text>';
    }

    // 日付ラベル(間引く)
    var step = Math.max(1, Math.ceil(series.length / 7));
    series.forEach(function (d, i) {
      if (i % step !== 0 && i !== series.length - 1) return;
      var cx = padL + slot * i + slot / 2;
      svg += '<text x="' + cx + '" y="' + (padT + plotH + 16) + '" text-anchor="middle" font-size="9" fill="#9a978f">' +
        d.date.slice(5).replace('-', '/') + '</text>';
    });

    wrap.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H +
      '" role="img" aria-label="ポイントの推移">' + svg + '</svg>';
  }

  function niceCeil(v) {
    if (v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    return Math.ceil(v / mag) * mag;
  }

  function shortNum(v) {
    v = Math.round(v);
    return v >= 10000 ? (Math.round(v / 100) / 10) + '万' : v.toLocaleString('ja-JP');
  }

  function drawChart(series, start, days) {
    var ax = state.settings.axis;
    var unit = ax.unit;
    var wrap = $('chart-svg-wrap');
    var W = Math.max(280, wrap.clientWidth || 340);
    var isLandscape = window.matchMedia('(orientation: landscape)').matches && window.innerHeight < 500;
    var H = isLandscape ? Math.max(220, window.innerHeight - 150) : 320;

    var maxBar = 0, maxCum = 0;
    series.forEach(function (b) {
      maxBar = Math.max(maxBar, b.planTotal, b.actualTotal);
      maxCum = Math.max(maxCum, b.cumPlan, b.cumActual);
    });
    var barMax = (!ax.autoRange && ax.barMax) ? ax.barMax : C.niceMax(maxBar, unit);
    var lineMax = (!ax.autoRange && ax.lineMax) ? ax.lineMax : C.niceMax(maxCum, unit);

    var mTop = 16, mBottom = 44;
    var mLeft = ax.placement === 'left' ? 74 : 40;
    var mRight = ax.placement === 'left' ? 10 : 44;
    var plotW = W - mLeft - mRight, plotH = H - mTop - mBottom;
    var slot = plotW / days;
    var y0 = mTop + plotH;

    function yBar(min) { return y0 - (min / barMax) * plotH; }
    function yLine(min) { return y0 - (min / lineMax) * plotH; }
    function xCenter(i) { return mLeft + slot * (i + 0.5); }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" id="chart-svg">';

    // グリッドと左軸(棒)
    var gridN = 4;
    for (var gi = 0; gi <= gridN; gi++) {
      var gv = barMax * gi / gridN;
      var gy = yBar(gv);
      svg += '<line x1="' + mLeft + '" y1="' + gy + '" x2="' + (W - mRight) + '" y2="' + gy + '" stroke="#dedacd" stroke-width="1"/>';
      svg += '<text x="' + (mLeft - 5) + '" y="' + (gy + 3.5) + '" text-anchor="end" font-size="9" fill="#6d6a60">' + C.fmtMin(gv, unit) + '</text>';
    }
    // 軸単位
    var unitLabel = unit === 'hours' ? '時間' : '分';
    svg += '<text x="' + (mLeft - 5) + '" y="' + (mTop - 5) + '" text-anchor="end" font-size="8.5" fill="#6d6a60">(' + unitLabel + ')</text>';
    // 右軸(累積折れ線) — 配置設定: 左右分け or 左寄せ
    var lineAxisX = ax.placement === 'left' ? (mLeft - 34) : (W - mRight + 5);
    var lineAnchor = ax.placement === 'left' ? 'end' : 'start';
    for (var li = 0; li <= gridN; li++) {
      var lv = lineMax * li / gridN;
      svg += '<text x="' + lineAxisX + '" y="' + (yLine(lv) + 3.5) + '" text-anchor="' + lineAnchor + '" font-size="9" fill="#2e7d46">' + C.fmtMin(lv, unit) + '</text>';
    }
    svg += '<text x="' + lineAxisX + '" y="' + (mTop - 5) + '" text-anchor="' + lineAnchor + '" font-size="8.5" fill="#2e7d46">(累積' + unitLabel + ')</text>';

    // 0ライン
    if (ax.showZeroLine) {
      svg += '<line x1="' + mLeft + '" y1="' + y0 + '" x2="' + (W - mRight) + '" y2="' + y0 + '" stroke="#8a877c" stroke-width="1.4"/>';
    }

    var visibleSubjects = state.settings.subjects.filter(function (s) { return s.visible; });
    var barW = Math.min(slot * 0.34, 30);
    var gap = Math.min(3, slot * 0.05);
    var today = todayStr();

    // 棒(左=計画・薄 / 右=実績・濃)
    series.forEach(function (b, i) {
      var cx = xCenter(i);
      var px = cx - gap / 2 - barW;
      var ay = cx + gap / 2;
      var acc = 0;
      visibleSubjects.forEach(function (s) {
        var v = b.plan[s.id] || 0;
        if (v > 0) {
          var top = yBar(acc + v), bot = yBar(acc);
          svg += '<rect x="' + px + '" y="' + top + '" width="' + barW + '" height="' + Math.max(0.5, bot - top) + '" fill="' + s.color + '" opacity="0.42"/>';
          acc += v;
        }
      });
      var acc2 = 0;
      visibleSubjects.forEach(function (s) {
        var v = b.actual[s.id] || 0;
        if (v > 0) {
          var top2 = yBar(acc2 + v), bot2 = yBar(acc2);
          svg += '<rect x="' + ay + '" y="' + top2 + '" width="' + barW + '" height="' + Math.max(0.5, bot2 - top2) + '" fill="' + s.color + '"/>';
          acc2 += v;
        }
      });
    });

    // 今日ライン
    var todayIdx = C.diffDays(start, today);
    if (todayIdx >= 0 && todayIdx < days) {
      var tx = xCenter(todayIdx);
      svg += '<line x1="' + tx + '" y1="' + (mTop - 2) + '" x2="' + tx + '" y2="' + y0 + '" stroke="#3a3a35" stroke-width="1" stroke-dasharray="3 3"/>';
      svg += '<rect x="' + (tx - 15) + '" y="0" width="30" height="13" rx="4" fill="#23221e"/>';
      svg += '<text x="' + tx + '" y="9.5" text-anchor="middle" font-size="8.5" fill="#f0c75e">今日</text>';
    }

    // 累積折れ線(第2軸)
    function linePath(key) {
      var pts = series.map(function (b, i) { return xCenter(i).toFixed(1) + ',' + yLine(b[key]).toFixed(1); });
      return pts.join(' ');
    }
    svg += '<polyline points="' + linePath('cumPlan') + '" fill="none" stroke="#3baa5c" stroke-width="2"/>';
    svg += '<polyline points="' + linePath('cumActual') + '" fill="none" stroke="#3b82f6" stroke-width="2"/>';
    if (days <= 40) {
      series.forEach(function (b, i) {
        svg += '<circle cx="' + xCenter(i) + '" cy="' + yLine(b.cumPlan) + '" r="2.6" fill="#fff" stroke="#3baa5c" stroke-width="1.6"/>';
        svg += '<circle cx="' + xCenter(i) + '" cy="' + yLine(b.cumActual) + '" r="2.6" fill="#fff" stroke="#3b82f6" stroke-width="1.6"/>';
      });
    }

    // X軸ラベル
    var labelStep = Math.max(1, Math.ceil(days / 7));
    series.forEach(function (b, i) {
      if (i % labelStep !== 0 && i !== days - 1) return;
      var d = C.parseDate(b.date);
      svg += '<text x="' + xCenter(i) + '" y="' + (y0 + 14) + '" text-anchor="middle" font-size="9" fill="#6d6a60">' + (d.getMonth() + 1) + '/' + d.getDate() + '</text>';
    });

    // イベントマーカー(未来の受験イベント)
    state.events.forEach(function (ev) {
      var idx = C.diffDays(start, ev.date);
      if (idx < 0 || idx >= days) return;
      var ex = xCenter(idx), ey = y0 + 26;
      svg += '<g class="ev-marker" data-event="' + esc(ev.id) + '" style="cursor:pointer">' +
        '<path d="M' + ex + ' ' + (ey - 6) + ' l6 6 l-6 6 l-6 -6 z" fill="#d9b24a" stroke="#a8862e" stroke-width="1"/>' +
        '<rect x="' + (ex - 12) + '" y="' + (ey - 12) + '" width="24" height="24" fill="transparent"/></g>';
    });

    // 選択中の日ハイライト + タップ領域
    series.forEach(function (b, i) {
      var sx = mLeft + slot * i;
      if (graph.selectedDate === b.date) {
        svg += '<rect x="' + sx + '" y="' + mTop + '" width="' + slot + '" height="' + plotH + '" fill="rgba(217,178,74,0.14)"/>';
      }
      svg += '<rect class="day-hit" data-date="' + b.date + '" x="' + sx + '" y="' + mTop + '" width="' + slot + '" height="' + (plotH + 20) + '" fill="transparent"/>';
    });

    svg += '</svg>';
    wrap.innerHTML = svg;

    // タップ: 日選択 / イベント詳細
    wrap.querySelectorAll('.day-hit').forEach(function (r) {
      r.addEventListener('click', function () {
        graph.selectedDate = graph.selectedDate === r.dataset.date ? null : r.dataset.date;
        renderGraphScreen();
      });
    });
    wrap.querySelectorAll('.ev-marker').forEach(function (g) {
      g.addEventListener('click', function (e) {
        e.stopPropagation();
        openEventDetail(g.dataset.event);
      });
    });
  }

  function renderDayDetail() {
    var el = $('day-detail');
    if (!graph.selectedDate) { el.style.display = 'none'; return; }
    var date = graph.selectedDate;
    var recs = C.activeRecords(state.records).filter(function (r) { return r.date === date; });
    var html = '<h2>' + fmtDateJa(date) + ' の詳細</h2>';
    if (recs.length === 0) {
      html += '<p class="muted">この日の記録はありません。</p>';
    } else {
      html += '<table><tr><th>科目</th><th>内容</th><th style="text-align:right">計画</th><th style="text-align:right">実績</th></tr>';
      var pt = 0, at = 0;
      recs.forEach(function (r) {
        var sub = subjectById(r.subjectId);
        pt += r.planMin; at += r.actualMin;
        html += '<tr><td><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + sub.color + ';margin-right:4px"></span>' + esc(sub.name) + '</td>' +
          '<td>' + esc(r.content) + (r.reflection ? '<div class="muted small">' + esc(r.reflection) + '</div>' : '') + '</td>' +
          '<td class="num">' + r.planMin + '分</td><td class="num">' + r.actualMin + '分</td></tr>';
      });
      html += '<tr><td colspan="2"><b>合計</b></td><td class="num"><b>' + pt + '分</b></td><td class="num"><b>' + at + '分</b></td></tr></table>';
    }
    el.innerHTML = html;
    el.style.display = '';
  }

  /* --- チャートのタッチ操作 --- */
  (function setupChartTouch() {
    var panel = $('chart-panel');
    var startX = 0, startY = 0, startEnd = null, startDays = 0, pinchDist = 0;
    var mode = null, longTimer = null, movedFar = false;

    function dist(t) {
      var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    panel.addEventListener('touchstart', function (e) {
      movedFar = false;
      startEnd = graph.endDate;
      startDays = graph.visibleDays;
      if (e.touches.length === 1) {
        mode = 'pan';
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        clearTimeout(longTimer);
        longTimer = setTimeout(function () {
          if (!movedFar) openAxisModal();
        }, 600);
      } else if (e.touches.length === 2) {
        mode = 'pinch';
        clearTimeout(longTimer);
        pinchDist = dist(e.touches);
      }
    }, { passive: true });
    panel.addEventListener('touchmove', function (e) {
      if (mode === 'pan' && e.touches.length === 1) {
        var dx = e.touches[0].clientX - startX;
        var dy = e.touches[0].clientY - startY;
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) { movedFar = true; clearTimeout(longTimer); }
        if (Math.abs(dx) > Math.abs(dy)) {
          e.preventDefault();
          var slotPx = (panel.clientWidth - 80) / graph.visibleDays;
          var shift = Math.round(-dx / Math.max(8, slotPx));
          var newEnd = C.addDays(startEnd, shift);
          if (newEnd !== graph.endDate) {
            graph.endDate = newEnd;
            renderGraphScreen();
          }
        }
      } else if (mode === 'pinch' && e.touches.length === 2) {
        e.preventDefault();
        movedFar = true;
        clearTimeout(longTimer);
        var scale = dist(e.touches) / pinchDist;
        var nd = Math.round(startDays / scale);
        nd = Math.max(3, Math.min(180, nd));
        if (nd !== graph.visibleDays) {
          graph.visibleDays = nd;
          graph.mode = 'custom';
          document.querySelectorAll('.range-tab').forEach(function (t) { t.classList.remove('active'); });
          renderGraphScreen();
        }
      }
    }, { passive: false });
    panel.addEventListener('touchend', function () {
      clearTimeout(longTimer);
      mode = null;
    });
    panel.addEventListener('touchcancel', function () {
      clearTimeout(longTimer);
      mode = null;
    });
    // マウス操作(開発・PC用): ドラッグでパン、ホイールでズーム
    var mouseDown = false, mStartX = 0, mStartEnd = null;
    panel.addEventListener('mousedown', function (e) {
      mouseDown = true; mStartX = e.clientX; mStartEnd = graph.endDate;
    });
    window.addEventListener('mousemove', function (e) {
      if (!mouseDown) return;
      var dx = e.clientX - mStartX;
      if (Math.abs(dx) < 8) return;
      var slotPx = (panel.clientWidth - 80) / graph.visibleDays;
      var shift = Math.round(-dx / Math.max(8, slotPx));
      var newEnd = C.addDays(mStartEnd, shift);
      if (newEnd !== graph.endDate) { graph.endDate = newEnd; renderGraphScreen(); }
    });
    window.addEventListener('mouseup', function () { mouseDown = false; });
  })();

  window.addEventListener('resize', function () {
    if (currentScreen === 'graph') renderGraphScreen();
  });
  window.addEventListener('orientationchange', function () {
    setTimeout(function () { if (currentScreen === 'graph') renderGraphScreen(); }, 250);
  });

  /* --- 軸設定 --- */
  $('btn-axis-setting').addEventListener('click', openAxisModal);
  function openAxisModal() {
    var ax = state.settings.axis;
    var unitLabel = ax.unit === 'hours' ? '時間' : '分';
    function fmtAxisVal(v) {
      if (v == null) return '自動';
      return ax.unit === 'hours' ? (Math.round(v / 6) / 10) + '時間' : v + '分';
    }
    openModal(
      '<h3>軸設定メニュー<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<div class="field"><label>Y軸(左: 棒グラフ)の最大値 <span id="m-barmax-val">' + fmtAxisVal(ax.barMax) + '</span></label>' +
      '<div class="btn-row"><button class="btn" id="m-bar-minus">−</button><button class="btn" id="m-bar-auto">自動</button><button class="btn" id="m-bar-plus">＋</button></div></div>' +
      '<div class="field"><label>Y軸(右: 累積折れ線)の最大値 <span id="m-linemax-val">' + fmtAxisVal(ax.lineMax) + '</span></label>' +
      '<div class="btn-row"><button class="btn" id="m-line-minus">−</button><button class="btn" id="m-line-auto">自動</button><button class="btn" id="m-line-plus">＋</button></div></div>' +
      '<div class="field"><label>単位</label><select id="m-unit">' +
      '<option value="hours"' + (ax.unit === 'hours' ? ' selected' : '') + '>時間</option>' +
      '<option value="minutes"' + (ax.unit === 'minutes' ? ' selected' : '') + '>分</option></select></div>' +
      '<div class="field"><label>Y軸の配置</label><select id="m-placement">' +
      '<option value="split"' + (ax.placement === 'split' ? ' selected' : '') + '>左右分け(おすすめ)</option>' +
      '<option value="left"' + (ax.placement === 'left' ? ' selected' : '') + '>左側に寄せる</option></select></div>' +
      '<div class="field" style="display:flex;justify-content:space-between;align-items:center"><label style="margin:0">0ラインを表示</label>' +
      '<button class="toggle' + (ax.showZeroLine ? ' on' : '') + '" id="m-zero" aria-label="0ライン"></button></div>' +
      '<div class="field" style="display:flex;justify-content:space-between;align-items:center"><label style="margin:0">範囲を自動調整</label>' +
      '<button class="toggle' + (ax.autoRange ? ' on' : '') + '" id="m-auto" aria-label="自動調整"></button></div>' +
      '<p class="muted small">最大値の＋/−は自動調整オフのときに使えます。設定はすぐ保存されます。</p>'
    );
    $('m-close').onclick = closeModal;
    var step = ax.unit === 'hours' ? 60 : 10;
    function currentAutoBarMax() {
      var days = graph.visibleDays;
      var start = C.addDays(graph.endDate, -(days - 1));
      var series = C.buildSeries(state.records, start, days);
      var mx = 0, mc = 0;
      series.forEach(function (b) { mx = Math.max(mx, b.planTotal, b.actualTotal); mc = Math.max(mc, b.cumPlan, b.cumActual); });
      return { bar: C.niceMax(mx, ax.unit), line: C.niceMax(mc, ax.unit) };
    }
    function adjust(key, dir) {
      var auto = currentAutoBarMax();
      var cur = ax[key] || (key === 'barMax' ? auto.bar : auto.line);
      var next = Math.max(step, cur + dir * step);
      ax[key] = next;
      ax.autoRange = false;
      save(); openAxisModal(); renderGraphScreen();
    }
    $('m-bar-minus').onclick = function () { adjust('barMax', -1); };
    $('m-bar-plus').onclick = function () { adjust('barMax', 1); };
    $('m-bar-auto').onclick = function () { ax.barMax = null; save(); openAxisModal(); renderGraphScreen(); };
    $('m-line-minus').onclick = function () { adjust('lineMax', -1); };
    $('m-line-plus').onclick = function () { adjust('lineMax', 1); };
    $('m-line-auto').onclick = function () { ax.lineMax = null; save(); openAxisModal(); renderGraphScreen(); };
    $('m-unit').onchange = function () { ax.unit = this.value; save(); openAxisModal(); renderGraphScreen(); };
    $('m-placement').onchange = function () { ax.placement = this.value; save(); renderGraphScreen(); };
    $('m-zero').onclick = function () { ax.showZeroLine = !ax.showZeroLine; this.classList.toggle('on'); save(); renderGraphScreen(); };
    $('m-auto').onclick = function () {
      ax.autoRange = !ax.autoRange;
      if (ax.autoRange) { ax.barMax = null; ax.lineMax = null; }
      save(); openAxisModal(); renderGraphScreen();
    };
  }

  /* --- 受験イベント --- */
  function renderEventList() {
    var evs = state.events.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var future = evs.filter(function (e) { return e.date >= todayStr(); });
    var past = evs.filter(function (e) { return e.date < todayStr(); });
    var html = '';
    if (evs.length === 0) {
      html = '<p class="muted">受験イベントを追加すると、グラフの未来側に◆マークで表示されます。</p>';
    }
    future.concat(past).forEach(function (ev) {
      var dd = C.diffDays(todayStr(), ev.date);
      html += '<div class="event-item" data-id="' + ev.id + '">' +
        '<span class="e-date">' + fmtDateJa(ev.date) + '</span>' +
        '<div class="e-main"><div class="e-title">' + esc(ev.title) + '</div>' +
        '<div class="e-sub">' + esc([ev.faculty, ev.method].filter(Boolean).join('・')) + '</div></div>' +
        '<span class="e-days">' + (dd > 0 ? 'あと' + dd + '日' : dd === 0 ? '今日！' : '終了') + '</span></div>';
    });
    $('event-list').innerHTML = html;
    document.querySelectorAll('#event-list .event-item').forEach(function (el) {
      var pressTimer = null, pressed = false;
      el.addEventListener('click', function () {
        if (pressed) { pressed = false; return; }
        openEventDetail(el.dataset.id);
      });
      el.addEventListener('touchstart', function () {
        pressTimer = setTimeout(function () {
          pressed = true;
          openEventForm(el.dataset.id);
        }, 550);
      }, { passive: true });
      el.addEventListener('touchmove', function () { clearTimeout(pressTimer); }, { passive: true });
      el.addEventListener('touchend', function () { clearTimeout(pressTimer); });
    });
  }

  function openEventDetail(id) {
    var ev = state.events.find(function (e) { return e.id === id; });
    if (!ev) return;
    var dd = C.diffDays(todayStr(), ev.date);
    openModal(
      '<h3>' + esc(ev.title) + '<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<table style="width:100%;font-size:0.85rem;border-collapse:collapse">' +
      '<tr><td class="muted" style="padding:6px 0;width:80px">日付</td><td>' + fmtDateJa(ev.date) + '(' + (dd > 0 ? 'あと' + dd + '日' : dd === 0 ? '今日' : '終了') + ')</td></tr>' +
      (ev.faculty ? '<tr><td class="muted" style="padding:6px 0">学部</td><td>' + esc(ev.faculty) + '</td></tr>' : '') +
      (ev.method ? '<tr><td class="muted" style="padding:6px 0">入試方式</td><td>' + esc(ev.method) + '</td></tr>' : '') +
      (ev.memo ? '<tr><td class="muted" style="padding:6px 0">メモ</td><td>' + esc(ev.memo) + '</td></tr>' : '') +
      '</table>' +
      (ev.url ? '<a class="btn block" style="margin-top:12px;text-decoration:none" href="' + esc(ev.url) + '" target="_blank" rel="noopener noreferrer">🌐 公式ページを開く</a>' : '') +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn" id="m-edit">✏️ 編集</button>' +
      '<button class="btn danger" id="m-del">削除</button></div>'
    );
    $('m-close').onclick = closeModal;
    $('m-edit').onclick = function () { openEventForm(id); };
    $('m-del').onclick = function () {
      if (this.dataset.confirmed) {
        state.events = state.events.filter(function (e) { return e.id !== id; });
        save(); closeModal(); renderEventList(); renderGraphScreen();
        toast('イベントを削除しました');
      } else {
        this.dataset.confirmed = '1';
        this.textContent = 'もう一度タップで削除';
      }
    };
  }

  $('btn-add-event').addEventListener('click', function () { openEventForm(null); });
  function openEventForm(id) {
    var ev = id ? state.events.find(function (e) { return e.id === id; }) : null;
    ev = ev || { date: '', title: '', faculty: '', method: '', url: '', memo: '' };
    openModal(
      '<h3>' + (id ? 'イベントを編集' : 'イベントを追加') + '<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<div class="field"><label>大学名・イベント名</label><input type="text" id="m-title" maxlength="40" placeholder="例: 近畿大学 公募推薦" value="' + esc(ev.title) + '"></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>日付</label><input type="date" id="m-date" value="' + ev.date + '"></div>' +
      '<div class="field"><label>入試方式</label><input type="text" id="m-method" maxlength="40" placeholder="公募推薦" value="' + esc(ev.method) + '"></div>' +
      '</div>' +
      '<div class="field"><label>学部・学科</label><input type="text" id="m-faculty" maxlength="40" placeholder="例: 経営学部" value="' + esc(ev.faculty) + '"></div>' +
      '<div class="field"><label>公式ページURL</label><input type="url" id="m-url" maxlength="500" placeholder="https://..." value="' + esc(ev.url) + '"></div>' +
      '<div class="field"><label>メモ</label><textarea id="m-memo" maxlength="300">' + esc(ev.memo) + '</textarea></div>' +
      '<button class="btn primary block" id="m-save">保存する ✓</button>'
    );
    $('m-close').onclick = closeModal;
    $('m-save').onclick = function () {
      var cand = {
        id: id || nextId('e'),
        date: $('m-date').value,
        title: $('m-title').value.trim(),
        faculty: $('m-faculty').value.trim(),
        method: $('m-method').value.trim(),
        url: $('m-url').value.trim(),
        memo: $('m-memo').value.trim()
      };
      var v = C.validateEvent(cand);
      if (!v.ok) { toast(v.errors[0], true); return; }
      if (id) {
        var idx = state.events.findIndex(function (e) { return e.id === id; });
        state.events[idx] = cand;
      } else {
        state.events.push(cand);
      }
      save(); closeModal(); renderEventList(); renderGraphScreen();
      checkPoseUnlocks();
      toast(id ? '更新したよ！' : 'イベントを追加したよ！');
    };
  }

  /* ================= 世界(時事ニュース)画面 =================
   * アプリはニュース本文を取得・保存しない。本人が読んで自分の言葉で
   * 見出しと一言だけを記録する(著作権対応・外部通信ゼロの原則に合わせる)。 */
  function todayNews() {
    var today = todayStr();
    return state.news.filter(function (n) { return n.date === today; });
  }

  function facultyLabel(id) {
    return { economics: '経済学部', law: '法学部', international: '国際学部' }[id] || id;
  }
  function selectedFacultyIds() {
    var f = state.settings.faculties || {};
    return C.FACULTY_IDS.filter(function (id) { return f[id]; });
  }

  function genreOptions(selected) {
    return C.NEWS_GENRES.map(function (g) {
      return '<option value="' + g.id + '"' + (g.id === selected ? ' selected' : '') + '>' + esc(g.name) + '</option>';
    }).join('');
  }

  function renderWorldScreen() {
    var today = todayNews();
    $('world-today-count').textContent = today.length + '/' + C.NEWS_DAILY_LIMIT;
    var recordedGenres = {};
    state.news.forEach(function (n) { recordedGenres[n.genreId] = true; });
    $('world-genre-count').textContent = Object.keys(recordedGenres).length + '/' + C.NEWS_GENRES.length;
    renderNewsList();
  }

  function renderNewsList() {
    var items = state.news.slice().sort(function (a, b) {
      return a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt - a.createdAt);
    });
    if (items.length === 0) {
      $('news-list').innerHTML = '<p class="muted">まだ記録がありません。今日読んだニュースを1つ記録してみよう。</p>';
      return;
    }
    var html = '';
    items.slice(0, 120).forEach(function (n) {
      var genre = C.newsGenreById(n.genreId);
      html += '<div class="news-item" data-id="' + n.id + '">' +
        '<div class="n-main">' +
        '<span class="genre-chip">' + esc(genre ? genre.name : n.genreId) + '</span> ' +
        (n.bp > 0 ? '<span class="bp-chip">+' + n.bp + 'BP</span>' : '') +
        '<div class="n-title" style="margin-top:4px">' + esc(n.headline) + '</div>' +
        '<div class="n-sub">' + fmtDateJa(n.date) + '</div>' +
        (n.comment ? '<div class="n-comment">' + esc(n.comment) + '</div>' : '') +
        '</div>' +
        '<div class="n-actions">' +
        '<button class="icon-btn" data-act="ask" aria-label="AIに聞く">🤖</button>' +
        '<button class="icon-btn danger" data-act="del" aria-label="削除">🗑</button>' +
        '</div></div>';
    });
    $('news-list').innerHTML = html;
    document.querySelectorAll('#news-list .icon-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = btn.closest('.news-item').dataset.id;
        var entry = state.news.find(function (n) { return n.id === id; });
        if (!entry) return;
        if (btn.dataset.act === 'ask') askNewsAI(entry);
        else deleteNews(id);
      });
    });
  }

  function deleteNews(id) {
    var idx = state.news.findIndex(function (n) { return n.id === id; });
    if (idx === -1) return;
    var removed = state.news[idx];
    state.news.splice(idx, 1);
    save(); renderWorldScreen();
    toast('削除しました', false, '元に戻す', function () {
      state.news.splice(idx, 0, removed);
      save(); renderWorldScreen();
    });
  }

  $('btn-add-news').addEventListener('click', openNewsFormModal);

  function openNewsFormModal() {
    var today = todayNews();
    var remaining = Math.max(0, C.NEWS_DAILY_LIMIT - today.length);
    openModal(
      '<h3>今日のニュースを記録<button class="icon-btn" id="m-close">✕</button></h3>' +
      (remaining > 0
        ? '<p class="small muted" style="margin-bottom:10px">今日はあと' + remaining + '本記録できます(1日' + C.NEWS_DAILY_LIMIT + '本まで)。</p>'
        : '<p class="small muted" style="margin-bottom:10px">今日はもう' + C.NEWS_DAILY_LIMIT + '本記録済みです。記録は保存されますが、ポイントは付きません。</p>') +
      '<div class="field"><label for="m-genre">ジャンル</label><select id="m-genre">' + genreOptions() + '</select></div>' +
      '<div class="field"><label for="m-headline">見出し(自分の言葉で)</label>' +
      '<input type="text" id="m-headline" maxlength="60" placeholder="例: 円安が1ドル160円台に"></div>' +
      '<div class="field"><label for="m-comment">一言(なぜ気になったか・任意)</label>' +
      '<textarea id="m-comment" maxlength="120" placeholder="輸入品が高くなる理由が分かった気がする"></textarea></div>' +
      '<button class="btn primary block big" id="m-save">記録する ✓</button>'
    );
    $('m-close').onclick = closeModal;
    $('m-save').onclick = function () {
      var entry = {
        id: nextId('n'),
        date: todayStr(),
        genreId: $('m-genre').value,
        headline: $('m-headline').value.trim(),
        comment: $('m-comment').value.trim(),
        bp: 0,
        createdAt: Date.now()
      };
      var v = C.validateNewsEntry(entry);
      if (!v.ok) { toast(v.errors[0], true); return; }
      var result = C.calcNewsBP({
        genreId: entry.genreId,
        faculties: selectedFacultyIds(),
        todayCount: today.length
      });
      entry.bp = result.bp;
      state.news.push(entry);
      save();
      closeModal();
      renderWorldScreen();
      if (result.overLimit) {
        toast('記録したよ！(今日はもう' + C.NEWS_DAILY_LIMIT + '本記録済みのためポイントは付きません)');
      } else if (result.facultyMatched) {
        toast('記録したよ！+' + result.bp + 'BP(志望学部ボーナスで1.5倍！)');
      } else {
        toast('記録したよ！+' + result.bp + 'BP');
      }
      askNewsAI(entry);
    };
  }

  /**
   * ニュース1件についてAIに聞くための質問文(FEATURE_SPEC_v4.md C章の型)。
   * コーチのAI連携(askAI)とは別に、志望学部を踏まえた小論文対策の質問を組み立てる。
   */
  function buildNewsAIPrompt(entry) {
    var faculties = selectedFacultyIds().map(facultyLabel);
    var facultyText = faculties.length ? faculties.join('・') : '経済学部・法学部・国際学部';
    var genre = C.newsGenreById(entry.genreId);
    var parts = [
      '私は' + facultyText + 'を志望する高校生です。',
      '次のニュースについて、①背景を中学生にも分かるように、',
      '②入試小論文で書くならどんな論点があるか、',
      '③賛成/反対の両方の立場を、それぞれ3行で教えてください。',
      '',
      '【ジャンル】' + (genre ? genre.name : entry.genreId),
      '【ニュース】' + entry.headline
    ];
    if (entry.comment) parts.push('【気になった理由】' + entry.comment);
    return parts.join('\n');
  }

  function askNewsAI(entry) {
    var target = aiTargetUrl();
    if (!target.url && state.settings.ai.appId === 'custom') {
      toast('先に「設定 → AI連携設定」でURLを入れてね', true);
      return;
    }
    var prompt = buildNewsAIPrompt(entry);
    state.coach.messages.push({ id: nextId('m'), role: 'ibuki', text: '「' + entry.headline + '」についてAIに聞く', ts: Date.now() });
    state.coach.messages.push({
      id: nextId('m'), role: 'beat',
      text: '「' + (target.name || 'AIアプリ') + '」に聞いてみよう！質問をコピーしたよ。',
      ts: Date.now()
    });
    state.coach.messages = state.coach.messages.slice(-200);
    save();
    copyToClipboard(prompt).then(function (copied) {
      if (!target.url) { openAIResultModal(prompt, copied, null); return; }
      var url = target.url;
      if (target.prefill) {
        var withQ = url + encodeURIComponent(prompt);
        if (withQ.length > 1800) {
          var shortQ = url + encodeURIComponent(entry.headline);
          url = shortQ.length <= 1800 ? shortQ : url;
        } else {
          url = withQ;
        }
      }
      openAIResultModal(prompt, copied, url);
    });
  }

  function openFacultyPanel() {
    var f = state.settings.faculties;
    var html = '<h3>志望学部<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<p class="small muted" style="margin-bottom:12px">選んだ学部に関係するニュースはポイントが1.5倍になり、AIへの質問文もこの学部に合わせて変わります。複数選べます。</p>';
    C.FACULTY_IDS.forEach(function (id) {
      html += '<div class="setting-row" style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)">' +
        '<span>' + esc(facultyLabel(id)) + '</span>' +
        '<button class="toggle' + (f[id] ? ' on' : '') + '" data-id="' + id + '" aria-label="' + esc(facultyLabel(id)) + '"></button></div>';
    });
    openModal(html);
    $('m-close').onclick = closeModal;
    document.querySelectorAll('#modal-body .toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.id;
        f[id] = !f[id];
        btn.classList.toggle('on', f[id]);
        save();
      });
    });
  }

  /* ================= コーチ画面 ================= */
  function renderCoach() {
    var pose = poseById(currentPose);
    $('coach-beat').innerHTML = charImg(pose.img, pose.name);
    $('coach-name').textContent = state.settings.characterName;
    $('coach-bubble-name').textContent = state.settings.characterName;
    $('coach-pose-name').textContent = pose.name;
    $('coach-bubble-text').textContent = coachComment();
    renderPoseGrid();
    renderChatLog();
    renderEquipCard();
  }

  function coachComment() {
    var streak = C.streakDays(state.records, todayStr(), state.shop.streakGuardDates);
    var total = 0;
    todayRecords().forEach(function (r) { total += r.actualMin; });
    var all = 0;
    C.activeRecords(state.records).forEach(function (r) { all += r.actualMin; });
    if (total >= state.settings.dailyGoalMin) return '今日の目標達成！最高のビートだったよ！';
    if (streak >= 7) return streak + '日連続！積み重ねが未来を変えるよ！';
    if (total > 0) return 'いいビートだったね！あと' + C.fmtDuration(Math.max(0, state.settings.dailyGoalMin - total)) + 'で今日の目標だ！';
    if (all >= 20 * 60) return '累計' + Math.floor(all / 60) + '時間。ここまでの積み上げは本物だよ。今日も1曲いこう！';
    return '今日もステージは君のもの。まずは小さく始めよう！';
  }

  function renderPoseGrid() {
    var html = '';
    POSES.forEach(function (p) {
      var unlocked = poseUnlocked(p);
      html += '<button class="pose-cell' + (currentPose === p.id ? ' active' : '') + '" data-pose="' + p.id + '"' + (unlocked ? '' : ' disabled style="opacity:0.45"') + '>' +
        charImg(p.img, p.name) +
        '<span class="nm">' + (unlocked ? p.name : '🔒 ' + p.cond) + '</span></button>';
    });
    $('pose-grid').innerHTML = html;
    document.querySelectorAll('.pose-cell').forEach(function (cell) {
      cell.addEventListener('click', function () {
        if (cell.disabled) return;
        currentPose = cell.dataset.pose;
        renderCoach();
      });
    });
  }

  /* ================= 装備・ショップ (ver.4.1.0) =================
   * 仕様: docs/design/FEATURE_SPEC_v4.md B章 / GUI_SPEC_v4.md 2.5 */
  var SHOP_TABS = [
    { id: 'costume', label: '衣装', items: function () { return C.COSTUME_ITEMS; } },
    { id: 'skill', label: 'スキル', items: function () { return C.SKILL_ITEMS; } },
    { id: 'stage', label: 'ステージ', items: function () { return C.STAGE_ITEMS; } },
    { id: 'consumable', label: '消費', items: function () { return C.CONSUMABLE_ITEMS; } }
  ];

  function ownedItemCount() {
    var shop = state.shop;
    var n = shop.owned.costume.length + shop.owned.skill.length + (shop.owned.stage.length - 1);
    Object.keys(shop.owned.consumable).forEach(function (id) { n += shop.owned.consumable[id]; });
    return n;
  }

  /* 安全装置(FEATURE_SPEC_v4.md): 受験30日前になったら装備・ショップを自動でOFFにする。 */
  function focusModeActive() {
    return C.isFocusModeActive(state.settings.examDate, todayStr());
  }

  function renderEquipCard() {
    var focus = focusModeActive();
    $('equip-card').style.display = focus ? 'none' : '';
    $('btn-open-shop').style.display = focus ? 'none' : '';
    $('focus-mode-card').style.display = focus ? '' : 'none';
    if (focus) return;
    var shop = state.shop;
    var costume = shop.equipped.costume ? C.costumeById(shop.equipped.costume) : null;
    var skill = shop.equipped.skill ? C.skillById(shop.equipped.skill) : null;
    var stage = C.stageById(shop.equipped.stage);
    var total = (costume ? costume.bonus : 0) + (skill ? skill.bonus : 0) + (stage ? stage.bonus : 0);
    $('equip-total-mult').textContent = '合計+' + C.roundAmount(total, 2).toFixed(2);
    $('equip-slots').innerHTML =
      '<div class="equip-slot"><span class="es-label">衣装</span><span class="es-val">' + esc(costume ? costume.name : '未装備') + '</span></div>' +
      '<div class="equip-slot"><span class="es-label">スキル</span><span class="es-val">' + esc(skill ? skill.name : '未装備') + (skill ? '(条件付き)' : '') + '</span></div>' +
      '<div class="equip-slot"><span class="es-label">ステージ</span><span class="es-val">' + esc(stage.name) + '</span></div>';
    $('shop-summary').textContent = 'BP ' + C.calcBpBalance(state).toLocaleString('ja-JP') + ' / 所持' + ownedItemCount();
  }

  $('btn-equip-change').addEventListener('click', function () { openShopModal('costume'); });
  $('btn-open-shop').addEventListener('click', function () { openShopModal('costume'); });

  function openShopModal(tab) {
    if (focusModeActive()) { toast('受験が近いので、ショップは今お休み中だよ', true); return; }
    var html = '<h3>ショップ<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<p class="small muted">BP残高 <b id="shop-balance" style="color:var(--gold-bright)">' + C.calcBpBalance(state).toLocaleString('ja-JP') + '</b></p>' +
      '<div class="shop-tabs" id="shop-tabs">' + SHOP_TABS.map(function (t) {
        return '<button class="shop-tab' + (t.id === tab ? ' active' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>';
      }).join('') + '</div>' +
      '<div class="shop-items" id="shop-items"></div>';
    openModal(html);
    $('m-close').onclick = closeModal;
    document.querySelectorAll('#shop-tabs .shop-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { openShopModal(btn.dataset.tab); });
    });
    renderShopItems(tab);
  }

  function itemBonusLabel(item) {
    if (item.desc) return item.desc;
    return item.bonus > 0 ? '+' + item.bonus.toFixed(1) + '倍' : '±0(初期装備)';
  }

  function renderShopItems(category) {
    var shop = state.shop;
    if ($('shop-balance')) $('shop-balance').textContent = C.calcBpBalance(state).toLocaleString('ja-JP');
    var tabDef = SHOP_TABS.filter(function (t) { return t.id === category; })[0];
    var html = '';
    tabDef.items().forEach(function (item) {
      var owned, statusHtml;
      if (category === 'consumable') {
        var avail = C.consumableAvailable(shop, item.id);
        owned = (shop.owned.consumable[item.id] || 0) > 0;
        statusHtml = '<button class="btn compact" data-buy="' + item.id + '">購入する</button>' +
          (avail > 0 ? '<button class="btn compact primary" data-use="' + item.id + '">使う(残' + avail + ')</button>' : '');
      } else {
        owned = shop.owned[category].indexOf(item.id) !== -1;
        var equipped = shop.equipped[category] === item.id;
        if (equipped) statusHtml = '<span class="chip on">装備中</span>';
        else if (owned) statusHtml = '<button class="btn compact" data-equip="' + item.id + '" data-cat="' + category + '">装備する</button>';
        else statusHtml = '<button class="btn compact" data-buy="' + item.id + '">購入する</button>';
      }
      html += '<div class="shop-item' + (owned ? ' owned' : '') + '">' +
        '<div class="si-main"><div class="si-name">' + esc(item.name) + '</div>' +
        '<div class="si-desc">' + esc(itemBonusLabel(item)) + '</div></div>' +
        '<div class="si-side"><div class="si-price">' + (item.price > 0 ? item.price.toLocaleString('ja-JP') + 'BP' : '') + '</div>' + statusHtml + '</div>' +
        '</div>';
    });
    $('shop-items').innerHTML = html;
    document.querySelectorAll('#shop-items [data-buy]').forEach(function (btn) {
      btn.addEventListener('click', function () { buyShopItem(btn.dataset.buy, category); });
    });
    document.querySelectorAll('#shop-items [data-equip]').forEach(function (btn) {
      btn.addEventListener('click', function () { equipShopItem(btn.dataset.cat, btn.dataset.equip, category); });
    });
    document.querySelectorAll('#shop-items [data-use]').forEach(function (btn) {
      btn.addEventListener('click', function () { useConsumable(btn.dataset.use, category); });
    });
  }

  function buyShopItem(itemId, category) {
    if (focusModeActive()) { toast('受験が近いので、ショップは今お休み中だよ', true); return; }
    var balance = C.calcBpBalance(state);
    var v = C.validatePurchase(state.shop, itemId, balance);
    if (!v.ok) { toast(v.errors[0], true); return; }
    if (v.category === 'consumable') {
      state.shop.owned.consumable[itemId] = (state.shop.owned.consumable[itemId] || 0) + 1;
    } else {
      state.shop.owned[v.category].push(itemId);
    }
    save();
    toast(v.item.name + ' を購入したよ！');
    renderShopItems(category);
    renderEquipCard();
    renderBoostCard();
  }

  function equipShopItem(category, itemId, tabCategory) {
    if (focusModeActive()) { toast('受験が近いので、ショップは今お休み中だよ', true); return; }
    var v = C.validateEquip(state.shop, category, itemId);
    if (!v.ok) { toast(v.errors[0], true); return; }
    state.shop.equipped[category] = itemId;
    save();
    toast('装備したよ！');
    renderShopItems(tabCategory);
    renderEquipCard();
    renderBoostCard();
  }

  function useConsumable(itemId, category) {
    if (focusModeActive()) { toast('受験が近いので、ショップは今お休み中だよ', true); return; }
    var avail = C.consumableAvailable(state.shop, itemId);
    if (avail <= 0) { toast('所持していません', true); return; }
    var item = C.consumableById(itemId);
    if (item.kind === 'fever') {
      if (!C.canUseFever(state.shop.feverLastUsedDate, todayStr())) {
        toast('フィーバータイムは週1回までだよ', true); return;
      }
      state.shop.feverLastUsedDate = todayStr();
      state.shop.activeBoosts.push({ id: nextId('ab'), itemId: itemId, kind: 'fever', expiresAt: Date.now() + item.durationMin * 60000 });
    } else if (item.kind === 'timed') {
      state.shop.activeBoosts.push({ id: nextId('ab'), itemId: itemId, kind: 'timed', expiresAt: Date.now() + item.durationMin * 60000 });
    } else if (item.kind === 'day') {
      var endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      state.shop.activeBoosts.push({ id: nextId('ab'), itemId: itemId, kind: 'day', expiresAt: endOfDay.getTime() });
    } else if (item.kind === 'streak-guard') {
      if (state.shop.streakGuardDates.indexOf(todayStr()) !== -1) {
        toast('今日はすでに連続記録を守っているよ', true); return;
      }
      state.shop.streakGuardDates.push(todayStr());
    }
    state.shop.used.consumable[itemId] = (state.shop.used.consumable[itemId] || 0) + 1;
    save();
    toast(item.name + ' を使ったよ！');
    renderShopItems(category);
    renderEquipCard();
    renderBoostCard();
  }

  /* 開いたパネルを画面内に送る(APP-461)。
   * パネルはボタンより下、装備・ショップカードのさらに後ろに置かれているため、
   * 画面の外で開いていた。ボタンを押しても何も変わらないように見え、
   * 「ボタンが反応しない」「メッセージが入力できない」という不具合になっていた。 */
  function revealPanel(el) {
    if (!el || el.style.display === 'none') return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    } catch (e) {
      el.scrollIntoView(true);   // 古いブラウザ向け
    }
  }

  $('btn-pose').addEventListener('click', function () {
    var p = $('pose-panel');
    p.style.display = p.style.display === 'none' ? '' : 'none';
    $('chat-panel').style.display = 'none';
    revealPanel(p);
  });
  $('btn-chat').addEventListener('click', function () {
    var p = $('chat-panel');
    p.style.display = p.style.display === 'none' ? '' : 'none';
    $('pose-panel').style.display = 'none';
    revealPanel(p);
    if (p.style.display !== 'none') {
      renderChatLog();
      renderQuickAsks();
      $('chat-ai-name').textContent = aiTargetUrl().name;
      var log = $('chat-log');
      log.scrollTop = log.scrollHeight;
    }
  });
  $('btn-coach-rename').addEventListener('click', openRenameModal);

  function renderChatLog() {
    var msgs = state.coach.messages;
    var html = '';
    if (msgs.length === 0) {
      html = '<p class="muted small">ここでの発言は端末に保存されます。ひとことどうぞ！</p>';
    }
    msgs.forEach(function (m) {
      html += '<div class="chat-msg ' + m.role + '">' +
        '<span class="who">' + (m.role === 'ibuki' ? esc(state.settings.userName) : esc(state.settings.characterName)) + '</span>' +
        esc(m.text) + '</div>';
    });
    $('chat-log').innerHTML = html;
  }

  function coachReply(text) {
    var streak = C.streakDays(state.records, todayStr(), state.shop.streakGuardDates);
    var total = 0;
    todayRecords().forEach(function (r) { total += r.actualMin; });
    var rules = [
      [/疲れ|しんど|つかれ|眠い|ねむ/, '疲れたら休むのも戦略のうち。5分だけ目を閉じて、また1曲いこう。'],
      [/無理|できない|むり|不安|こわい|落ち/, '「できない」じゃなくて「まだできてない」だけ。一歩ずつで大丈夫だよ。'],
      [/やった|できた|終わっ|達成|完了/, 'ナイスビート！その積み重ねが未来のステージをつくるんだ！'],
      [/英語|英単語/, '英語は毎日のリズムが命。20語ずつでも1ヶ月で600語だよ！'],
      [/数学/, '数学は手を動かした分だけ強くなる。1問ずつクリアしていこう！'],
      [/模試|テスト|試験/, '模試は本番のリハーサル。結果より「何を直すか」が宝物だよ。'],
      [/ありがと/, 'こちらこそ！君のビートを一番近くで聴けて嬉しいよ！'],
      [/おはよ/, 'おはよう！今日の最初の1曲、何から始める？'],
      [/おやすみ|寝る/, 'おやすみ！今日の積み上げは明日の力になるよ。いい夢を！']
    ];
    for (var i = 0; i < rules.length; i++) {
      if (rules[i][0].test(text)) return rules[i][1];
    }
    if (total > 0) return '今日は' + C.fmtDuration(total) + '積み上げたね！' + (streak > 1 ? streak + '日連続、' : '') + 'その調子！';
    return '聞かせてくれてありがとう！まずは30分、一緒にビートを刻もう！';
  }

  /* ---------- AIアプリ連携 ----------
   * Webアプリから他アプリのAIを直接呼ぶ手段はiOSに無いため、
   * 「プロンプトをクリップボードにコピー → AIアプリを開く」方式で橋渡しする。
   * URLに質問を載せられるアプリでは自動入力も試みる。 */

  function aiTargetUrl() {
    var ai = state.settings.ai;
    var app = C.aiAppById(ai.appId);
    if (ai.appId === 'custom') return { url: ai.customUrl, prefill: false, name: 'AIアプリ' };
    return { url: app.url, prefill: app.prefill, name: app.name };
  }

  function studyStatsText() {
    var today = 0;
    todayRecords().forEach(function (r) { today += r.actualMin; });
    var all = 0, subjTotals = {};
    C.activeRecords(state.records).forEach(function (r) {
      all += r.actualMin;
      if (r.actualMin > 0) subjTotals[r.subjectId] = (subjTotals[r.subjectId] || 0) + r.actualMin;
    });
    var lines = [
      '・今日の学習: ' + C.fmtDuration(today) + '(1日の目標 ' + C.fmtDuration(state.settings.dailyGoalMin) + ')',
      '・連続記録: ' + C.streakDays(state.records, todayStr(), state.shop.streakGuardDates) + '日',
      '・累計学習時間: ' + C.fmtDuration(all)
    ];
    var subjLine = Object.keys(subjTotals).map(function (id) {
      return subjectById(id).name + ' ' + C.fmtDuration(subjTotals[id]);
    }).join('、');
    if (subjLine) lines.push('・科目別の累計: ' + subjLine);
    if (state.settings.examDate) {
      var dd = C.diffDays(todayStr(), state.settings.examDate);
      if (dd >= 0) lines.push('・受験日まで: あと' + dd + '日');
    }
    var nextEv = state.events.filter(function (e) { return e.date >= todayStr(); })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
    if (nextEv) lines.push('・次の受験イベント: ' + nextEv.title + '(' + nextEv.date + ')');
    return lines.join('\n');
  }

  function buildAIPrompt(question, withManual) {
    var name = state.settings.userName || '伊吹';
    var parts = [
      'あなたは大学受験生「' + name + '」の学習コーチです。' +
      'やさしく、短く、具体的に、日本語で答えてください。',
      '',
      '【質問】',
      question
    ];
    if (withManual) {
      parts.push('', '【参考: 使っている学習記録アプリの説明】', window.ISBManual.MANUAL);
    }
    if (state.settings.ai.sendStats) {
      parts.push('', '【' + name + 'さんの今の学習状況】', studyStatsText());
    }
    return parts.join('\n');
  }

  function copyToClipboard(text) {
    // iOS Safariではユーザー操作の直後でないと失敗するため、同期的な方法も用意する
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; },
        function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function askAI(question, withManual) {
    var target = aiTargetUrl();
    if (!target.url) {
      if (state.settings.ai.appId === 'custom') {
        toast('先に「設定 → AI連携設定」でURLを入れてね', true);
        return;
      }
    }
    var prompt = buildAIPrompt(question, withManual);
    // 会話ログにも残す(あとで見返せるように)
    state.coach.messages.push({ id: nextId('m'), role: 'ibuki', text: question, ts: Date.now() });
    state.coach.messages.push({
      id: nextId('m'), role: 'beat',
      text: '「' + (target.name || 'AIアプリ') + '」に聞いてみよう！質問をコピーしたよ。',
      ts: Date.now()
    });
    state.coach.messages = state.coach.messages.slice(-200);
    save();
    renderChatLog();

    copyToClipboard(prompt).then(function (copied) {
      if (!target.url) {
        openAIResultModal(prompt, copied, null);
        return;
      }
      var url = target.url;
      if (target.prefill) {
        var withQ = url + encodeURIComponent(prompt);
        // URLが長すぎると開けないため、収まらない場合は質問だけを載せる
        if (withQ.length > 1800) {
          var shortQ = url + encodeURIComponent(question);
          url = shortQ.length <= 1800 ? shortQ : url;
        } else {
          url = withQ;
        }
      }
      openAIResultModal(prompt, copied, url);
    });
  }

  function openAIResultModal(prompt, copied, url) {
    var target = aiTargetUrl();
    openModal(
      '<h3>🤖 ' + esc(target.name) + 'に聞く<button class="icon-btn" id="m-close">✕</button></h3>' +
      (copied
        ? '<p class="small" style="margin-bottom:10px">質問をコピーしたよ！下のボタンでアプリを開いて、入力欄を<b>長押し→ペースト</b>して送ってね。</p>'
        : '<p class="small" style="margin-bottom:10px">下の文章を選んでコピーし、AIアプリに貼り付けて送ってね。</p>') +
      '<textarea id="m-prompt" readonly style="min-height:120px;font-size:0.8rem">' + esc(prompt) + '</textarea>' +
      '<div class="btn-row" style="margin-top:10px">' +
      '<button class="btn" id="m-copy">📋 もう一度コピー</button>' +
      (url ? '<a class="btn primary" style="text-decoration:none" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" id="m-open">' + esc(target.name) + 'を開く ▶</a>' : '') +
      '</div>' +
      '<p class="muted small" style="margin-top:10px">使うAIアプリは「設定 → AI連携設定」で変えられます。</p>'
    );
    $('m-close').onclick = closeModal;
    $('m-copy').onclick = function () {
      copyToClipboard(prompt).then(function (ok) {
        toast(ok ? 'コピーしたよ！' : 'コピーできませんでした。文章を選んでコピーしてね', !ok);
      });
    };
    if (url) $('m-open').onclick = function () { setTimeout(closeModal, 300); };
  }

  function sendChat() {
    var input = $('chat-input');
    var text = input.value.trim();
    if (!text) return;
    state.coach.messages.push({ id: nextId('m'), role: 'ibuki', text: text, ts: Date.now() });
    var reply = coachReply(text);
    state.coach.messages.push({ id: nextId('m'), role: 'beat', text: reply, ts: Date.now() });
    state.coach.messages = state.coach.messages.slice(-200);
    save();
    input.value = '';
    renderChatLog();
    var log = $('chat-log');
    log.scrollTop = log.scrollHeight;
  }
  $('chat-send').addEventListener('click', sendChat);
  $('chat-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !imeSafe(e)) { e.preventDefault(); sendChat(); }
  });

  $('chat-ask-ai').addEventListener('click', function () {
    var input = $('chat-input');
    var text = input.value.trim();
    if (!text) { toast('聞きたいことを入力してね', true); return; }
    input.value = '';
    // 使い方の質問かどうかを判定し、そうならアプリの説明も一緒に渡す
    var howTo = /使い方|操作|やり方|どうやって|どこ|方法|できない|わからない|分からない|グラフ|記録|設定|バックアップ|ポーズ/.test(text);
    askAI(text, howTo);
  });

  var QUICK_ASKS = [
    { label: '使い方を教えて', q: 'このアプリの使い方を、最初にやることから順に教えて。', manual: true },
    { label: 'グラフの見方', q: 'このアプリのグラフ画面の見方を教えて。計画と実績の棒や、累積の線が何を表しているのか知りたい。', manual: true },
    { label: '記録の直し方', q: '間違えて登録した学習記録を直したり消したりする方法を教えて。', manual: true },
    { label: '勉強の相談', q: '受験勉強のことで相談したいことがあります。今の学習状況を見て、アドバイスをください。', manual: false }
  ];

  function renderQuickAsks() {
    $('chat-quick').innerHTML = QUICK_ASKS.map(function (q, i) {
      return '<button class="quick-chip" data-i="' + i + '">' + esc(q.label) + '</button>';
    }).join('');
    document.querySelectorAll('#chat-quick .quick-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        var q = QUICK_ASKS[+b.dataset.i];
        askAI(q.q, q.manual);
      });
    });
  }

  /* ================= 設定画面 ================= */
  document.querySelectorAll('.settings-item').forEach(function (item) {
    item.addEventListener('click', function () { openSettingsPanel(item.dataset.panel); });
  });

  function openSettingsPanel(panel) {
    if (panel === 'profile') return openProfilePanel();
    if (panel === 'goal') return openGoalPanel();
    if (panel === 'exam') return openExamPanel();
    if (panel === 'faculty') return openFacultyPanel();
    if (panel === 'subjects') return openSubjectsPanel();
    if (panel === 'condition') return openConditionPanel();
    if (panel === 'ai') return openAIPanel();
    if (panel === 'axis') return openAxisModal();
    if (panel === 'data') return openDataPanel();
    if (panel === 'report') return openReportPanel();
    if (panel === 'about') return openAboutPanel();
  }

  var HABIT_LABELS = {
    sleepEarly: '24時前に就寝',
    breakfast: '朝ごはんを食べた',
    exercise: '運動30分',
    restTaken: '休憩をちゃんと取った',
    reading: '読書30分'
  };

  /**
   * コンディション記録(生活習慣)。本人が任意でON/OFFする(デフォルトOFF=未記録)。
   * 今日チェックした分が「翌日の倍率+0.05〜+0.3」に反映される(A章)。
   */
  function openConditionPanel() {
    var today = todayStr();
    var entry = state.habits[today] || {};
    var todayBP = C.calcHabitBP(entry);
    var html = '<h3>コンディション記録<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<p class="muted small" style="margin-bottom:10px">今日チェックした生活習慣は、明日の学習ポイントの倍率に+0.05〜+0.3として反映されます。無理せず、できた日だけでOK。</p>' +
      '<div class="habit-list">' + C.HABIT_KEYS.map(function (k) {
        var on = !!entry[k];
        return '<button class="habit-row' + (on ? ' on' : '') + '" data-k="' + k + '">' +
          '<span>' + esc(HABIT_LABELS[k]) + '</span>' +
          '<span class="habit-bp">+' + C.HABIT_BP[k] + 'BP</span>' +
          '<span class="toggle' + (on ? ' on' : '') + '"></span>' +
          '</button>';
      }).join('') + '</div>' +
      '<p class="small muted" style="margin-top:10px">今日の合計 <b id="cond-total" style="color:var(--gold-bright)">' + todayBP + 'BP</b>' +
      '　→ 明日の倍率 <b id="cond-bonus" style="color:var(--gold-bright)">+' + C.conditionBonusFromHabits(todayBP).toFixed(2) + '倍</b></p>';
    openModal(html);
    $('m-close').onclick = closeModal;
    document.querySelectorAll('#modal-body .habit-row').forEach(function (row) {
      row.addEventListener('click', function () {
        var k = row.dataset.k;
        entry[k] = !entry[k];
        state.habits[today] = entry;
        save();
        row.classList.toggle('on');
        row.querySelector('.toggle').classList.toggle('on');
        var bp = C.calcHabitBP(entry);
        $('cond-total').textContent = bp + 'BP';
        $('cond-bonus').textContent = '+' + C.conditionBonusFromHabits(bp).toFixed(2) + '倍';
      });
    });
  }

  function openProfilePanel() {
    openModal(
      '<h3>プロフィール<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<div class="field"><label>あなたの名前</label><input type="text" id="m-user" maxlength="10" value="' + esc(state.settings.userName) + '"></div>' +
      '<div class="field"><label>キャラクター(BEATスター)の名前</label><input type="text" id="m-char" maxlength="10" value="' + esc(state.settings.characterName) + '"></div>' +
      '<button class="btn primary block" id="m-save">保存する</button>'
    );
    $('m-close').onclick = closeModal;
    $('m-save').onclick = function () {
      var u = $('m-user').value.trim(), c = $('m-char').value.trim();
      if (!u || !c) { toast('名前を入力してください', true); return; }
      state.settings.userName = u.slice(0, 10);
      state.settings.characterName = c.slice(0, 10);
      save(); closeModal(); renderToday();
      toast('保存したよ！');
    };
  }

  function openGoalPanel() {
    var slogans = state.settings.slogans;
    var sloganFields = '';
    for (var i = 0; i < 3; i++) {
      sloganFields += '<div class="field"><label>スローガン' + (i + 1) + (i === 0 ? '(必須)' : '(任意)') + '</label>' +
        '<input type="text" id="m-slogan' + i + '" maxlength="30" value="' + esc(slogans[i] || '') + '"></div>';
    }
    openModal(
      '<h3>目標・スローガン<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<div class="field"><label>1日の目標学習時間(分)</label><input type="number" id="m-goal" min="10" max="1440" inputmode="numeric" value="' + state.settings.dailyGoalMin + '"></div>' +
      '<div class="field"><label>受験日(カウントダウン表示用)</label><input type="date" id="m-exam" value="' + (state.settings.examDate || '') + '"></div>' +
      sloganFields +
      '<button class="btn primary block" id="m-save">保存する</button>'
    );
    $('m-close').onclick = closeModal;
    $('m-save').onclick = function () {
      var goal = parseIntSafe($('m-goal').value);
      if (!(goal >= 10 && goal <= 1440)) { toast('目標時間は10〜1440分で入力してください', true); return; }
      var newSlogans = [];
      for (var i = 0; i < 3; i++) {
        var v = $('m-slogan' + i).value.trim();
        if (v) newSlogans.push(v.slice(0, 30));
      }
      if (newSlogans.length === 0) { toast('スローガンを1つは入力してください', true); return; }
      state.settings.dailyGoalMin = goal;
      state.settings.slogans = newSlogans;
      var ex = $('m-exam').value;
      state.settings.examDate = C.isDateStr(ex) ? ex : null;
      save(); closeModal(); renderToday();
      toast('保存したよ！');
    };
  }

  function openExamPanel() {
    var evs = state.events.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var html = '<h3>受験情報<button class="icon-btn" id="m-close">✕</button></h3>';
    if (evs.length === 0) html += '<p class="muted small" style="margin-bottom:10px">模試・出願・入試日などを登録しよう。</p>';
    evs.forEach(function (ev) {
      html += '<div class="event-item" data-id="' + ev.id + '">' +
        '<span class="e-date">' + fmtDateJa(ev.date) + '</span>' +
        '<div class="e-main"><div class="e-title">' + esc(ev.title) + '</div>' +
        '<div class="e-sub">' + esc([ev.faculty, ev.method].filter(Boolean).join('・')) + '</div></div>✏️</div>';
    });
    html += '<button class="btn primary block" id="m-add" style="margin-top:8px">＋ イベントを追加</button>';
    openModal(html);
    $('m-close').onclick = closeModal;
    $('m-add').onclick = function () { openEventForm(null); };
    document.querySelectorAll('#modal-body .event-item').forEach(function (el) {
      el.addEventListener('click', function () { openEventForm(el.dataset.id); });
    });
  }

  function openSubjectsPanel() {
    var html = '<h3>科目設定<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<p class="muted small" style="margin-bottom:10px">色・表示・並び順を変えられます。記録がある科目は削除できません(非表示にできます)。「受験」は受験科目チェック(OFFの科目は1日100BPまで)。</p>';
    state.settings.subjects.forEach(function (s, i) {
      html += '<div class="subject-row" data-id="' + esc(s.id) + '">' +
        '<div class="subject-row-top">' +
        '<input type="color" value="' + s.color + '" data-f="color" aria-label="色">' +
        '<div class="nm"><input type="text" value="' + esc(s.name) + '" maxlength="12" data-f="name" aria-label="科目名"></div>' +
        '<button class="icon-btn danger" data-f="del" aria-label="削除">✕</button>' +
        '</div>' +
        '<div class="subject-row-bottom">' +
        '<button class="icon-btn" data-f="up"' + (i === 0 ? ' disabled style="opacity:0.3"' : '') + '>↑</button>' +
        '<button class="icon-btn" data-f="down"' + (i === state.settings.subjects.length - 1 ? ' disabled style="opacity:0.3"' : '') + '>↓</button>' +
        '<button class="mini-toggle-btn' + (s.examSubject ? ' on' : '') + '" data-f="exam" aria-label="受験科目"><span class="toggle-dot"></span>受験</button>' +
        '<button class="mini-toggle-btn' + (s.visible ? ' on' : '') + '" data-f="vis" aria-label="表示"><span class="toggle-dot"></span>表示</button>' +
        '</div>' +
        '</div>';
    });
    html += '<button class="btn block" id="m-add">＋ 科目を追加</button>';
    openModal(html);
    $('m-close').onclick = closeModal;
    $('m-add').onclick = function () {
      var newId = 's' + Date.now().toString(36);
      state.settings.subjects.push({ id: newId, name: '新しい科目', color: '#7f8fa6', visible: true, examSubject: true });
      save(); openSubjectsPanel();
    };
    document.querySelectorAll('#modal-body .subject-row').forEach(function (row) {
      var id = row.dataset.id;
      var subj = state.settings.subjects.find(function (s) { return s.id === id; });
      var idx = state.settings.subjects.indexOf(subj);
      row.querySelector('[data-f="color"]').addEventListener('change', function () {
        subj.color = this.value; save(); if (currentScreen === 'graph') renderGraphScreen();
      });
      row.querySelector('[data-f="name"]').addEventListener('change', function () {
        var v = this.value.trim();
        if (!v) { this.value = subj.name; toast('科目名は空にできません', true); return; }
        subj.name = v.slice(0, 12); save();
      });
      row.querySelector('[data-f="up"]').addEventListener('click', function () {
        if (idx <= 0) return;
        state.settings.subjects.splice(idx, 1);
        state.settings.subjects.splice(idx - 1, 0, subj);
        save(); openSubjectsPanel();
      });
      row.querySelector('[data-f="down"]').addEventListener('click', function () {
        if (idx >= state.settings.subjects.length - 1) return;
        state.settings.subjects.splice(idx, 1);
        state.settings.subjects.splice(idx + 1, 0, subj);
        save(); openSubjectsPanel();
      });
      row.querySelector('[data-f="vis"]').addEventListener('click', function () {
        subj.visible = !subj.visible;
        this.classList.toggle('on');
        save();
      });
      row.querySelector('[data-f="exam"]').addEventListener('click', function () {
        subj.examSubject = !subj.examSubject;
        this.classList.toggle('on');
        save();
      });
      row.querySelector('[data-f="del"]').addEventListener('click', function () {
        var used = state.records.some(function (r) { return r.subjectId === id; });
        if (used) { toast('この科目には記録があるため削除できません。非表示にしてね。', true); return; }
        if (state.settings.subjects.length <= 1) { toast('科目は1つ以上必要です', true); return; }
        if (this.dataset.confirmed) {
          state.settings.subjects = state.settings.subjects.filter(function (s) { return s.id !== id; });
          save(); openSubjectsPanel();
        } else {
          this.dataset.confirmed = '1';
          this.textContent = '確定?';
        }
      });
    });
  }

  function openDataPanel() {
    openModal(
      '<h3>データ管理<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<div class="field"><button class="btn block" id="m-export">📤 JSONを書き出す(バックアップ)</button></div>' +
      '<div class="field"><label>読み込み(書き出したJSONファイル)</label>' +
      '<input type="file" id="m-import-file" accept=".json,application/json"></div>' +
      '<div class="field"><button class="btn block" id="m-restore">🕘 自動バックアップから復元</button></div>' +
      '<div class="field" style="margin-top:18px"><button class="btn danger block" id="m-wipe">⚠️ 全データを消去する</button></div>' +
      '<p class="muted small">データはこの端末のブラウザ内(localStorage)にのみ保存されます。機種変更前に書き出しを。</p>'
    );
    $('m-close').onclick = closeModal;
    $('m-export').onclick = function () {
      var payload = { app: 'IBUKI_STUDY_BEAT', schemaVersion: C.SCHEMA_VERSION, exportedAt: new Date().toISOString(), state: state };
      var blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ibuki_study_beat_' + todayStr() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('書き出したよ！ファイルを保存してね。');
    };
    $('m-import-file').addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        importJSON(String(reader.result));
      };
      reader.readAsText(file);
    });
    $('m-restore').onclick = function () {
      var bak = null;
      try { bak = localStorage.getItem(BACKUP_KEY); } catch (e) {}
      if (!bak) { toast('自動バックアップが見つかりません', true); return; }
      try {
        var parsed = JSON.parse(bak);
        var sane = C.sanitizeState(parsed.state, todayStr());
        if (!sane) { toast('バックアップが読めませんでした', true); return; }
        state = sane;
        save(); closeModal(); renderAll();
        toast('バックアップ(' + (parsed.backedUpAt || '').slice(0, 10) + ')から復元しました');
      } catch (e) {
        toast('バックアップが読めませんでした', true);
      }
    };
    $('m-wipe').onclick = openWipeConfirm;
  }

  function importJSON(text) {
    var parsed = null;
    try { parsed = JSON.parse(text); } catch (e) {
      toast('JSONが読み込めません。ファイルを確認してください。', true);
      return;
    }
    var target = (parsed && parsed.app === 'IBUKI_STUDY_BEAT') ? parsed.state : parsed;
    var sane = C.sanitizeState(target, todayStr());
    if (!sane || (sane.records.length === 0 && Array.isArray(target && target.records) && target.records.length > 0)) {
      toast('このファイルは復元できませんでした。既存データは変更していません。', true);
      return;
    }
    // 取り込み前に現状を自動バックアップ
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ backedUpAt: new Date().toISOString(), state: state })); } catch (e) {}
    state = sane;
    save(); closeModal(); renderAll();
    toast('読み込みました！(記録' + state.records.length + '件)');
  }

  function openWipeConfirm() {
    openModal(
      '<h3>全データ消去(1/2)<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<p class="small" style="margin-bottom:12px">記録・イベント・設定・メッセージのすべてが消えます。先にJSON書き出しをおすすめします。</p>' +
      '<div class="btn-row"><button class="btn" id="m-cancel">やめる</button>' +
      '<button class="btn danger" id="m-next">次へ進む</button></div>'
    );
    $('m-close').onclick = $('m-cancel').onclick = closeModal;
    $('m-next').onclick = function () {
      openModal(
        '<h3>全データ消去(2/2)<button class="icon-btn" id="m-close">✕</button></h3>' +
        '<p class="small" style="margin-bottom:12px">最終確認: 下に「<b>消去</b>」と入力すると実行できます。</p>' +
        '<div class="field"><input type="text" id="m-confirm-text" placeholder="消去"></div>' +
        '<div class="btn-row"><button class="btn" id="m-cancel">やめる</button>' +
        '<button class="btn danger" id="m-wipe-final">すべて消去する</button></div>'
      );
      $('m-close').onclick = $('m-cancel').onclick = closeModal;
      $('m-wipe-final').onclick = function () {
        if ($('m-confirm-text').value.trim() !== '消去') {
          toast('「消去」と入力してください', true);
          return;
        }
        try {
          localStorage.removeItem(KEY);
          localStorage.removeItem(BACKUP_KEY);
        } catch (e) {}
        state = C.defaultState(todayStr());
        storageWarning = null;
        save(); closeModal(); renderAll();
        toast('すべてのデータを消去しました');
      };
    };
  }

  function openAIPanel() {
    var ai = state.settings.ai;
    var opts = C.AI_APPS.map(function (a) {
      return '<option value="' + a.id + '"' + (a.id === ai.appId ? ' selected' : '') + '>' + esc(a.name) + '</option>';
    }).join('');
    openModal(
      '<h3>AI連携設定<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<p class="small muted" style="margin-bottom:12px">コーチ画面の「🤖 AIに聞く」で使うAIアプリを選べます。質問は自動でコピーされ、選んだアプリが開きます(インストール済みならアプリが、無ければブラウザ版が開きます)。</p>' +
      '<div class="field"><label>使うAIアプリ</label><select id="m-aiapp">' + opts + '</select></div>' +
      '<div class="field" id="m-custom-row" style="display:' + (ai.appId === 'custom' ? '' : 'none') + '">' +
      '<label>アプリを開くURL(https://...)</label>' +
      '<input type="url" id="m-aiurl" maxlength="500" placeholder="https://..." value="' + esc(ai.customUrl) + '"></div>' +
      '<div class="field" style="display:flex;justify-content:space-between;align-items:center">' +
      '<label style="margin:0">学習データも一緒に送る<br><span class="muted" style="font-size:0.7rem">今日の時間・連続日数・累計・受験日など</span></label>' +
      '<button class="toggle' + (ai.sendStats ? ' on' : '') + '" id="m-aistats" aria-label="学習データを送る"></button></div>' +
      '<button class="btn primary block" id="m-save" style="margin-top:6px">保存する</button>' +
      '<p class="muted small" style="margin-top:12px">※ アプリが自動でAIと通信することはありません。質問を送るかどうかは、AIアプリの画面で自分で決められます。</p>'
    );
    $('m-close').onclick = closeModal;
    $('m-aiapp').onchange = function () {
      $('m-custom-row').style.display = this.value === 'custom' ? '' : 'none';
    };
    $('m-aistats').onclick = function () { this.classList.toggle('on'); };
    $('m-save').onclick = function () {
      var appId = $('m-aiapp').value;
      var customUrl = $('m-aiurl') ? $('m-aiurl').value.trim() : '';
      if (appId === 'custom' && !/^https?:\/\//.test(customUrl)) {
        toast('URLはhttps://から入力してね', true);
        return;
      }
      ai.appId = appId;
      ai.customUrl = customUrl;
      ai.sendStats = $('m-aistats').classList.contains('on');
      save(); closeModal();
      if (currentScreen === 'coach') $('chat-ai-name').textContent = aiTargetUrl().name;
      toast('AIアプリを「' + aiTargetUrl().name + '」にしたよ！');
    };
  }

  /* ================= 不具合の報告(APP-461) =================
   * 外部通信ゼロのため、アプリから送信はしない。
   * 状況が分かる定型文を組み立ててコピーし、親がLINEやGitHubへ貼れるようにする。 */

  function buildReportText(userText) {
    var lines = [];
    lines.push('【IBUKI STUDY BEAT 不具合レポート】');
    lines.push('');
    lines.push('■ 何が起きたか');
    lines.push(userText && userText.trim() ? userText.trim() : '(未記入)');
    lines.push('');
    lines.push('■ 環境(自動で入ります)');
    lines.push('アプリ版: ver.' + APP_VERSION + ' (' + BUILD_DATE + ')');
    lines.push('発生日時: ' + new Date().toLocaleString('ja-JP'));
    lines.push('画面幅: ' + window.innerWidth + ' x ' + window.innerHeight);
    lines.push('ホーム画面から起動: ' +
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ? 'はい' : 'いいえ'));
    lines.push('端末: ' + (navigator.userAgent || '不明').slice(0, 160));
    lines.push('オフライン対応: ' + ('serviceWorker' in navigator ? '有効' : '無効'));
    lines.push('');
    lines.push('■ データの規模(中身は含みません)');
    try {
      lines.push('学習記録: ' + (state.records || []).filter(function (r) { return !r.deletedAt; }).length + '件');
      lines.push('ニュース: ' + (state.news || []).length + '件');
      lines.push('受験イベント: ' + (state.events || []).length + '件');
      lines.push('科目: ' + (state.settings.subjects || []).length + '件');
      lines.push('保存容量: 約' + Math.round((localStorage.getItem(KEY) || '').length / 1024) + ' KB');
    } catch (e) {
      lines.push('(データの読み取りに失敗しました)');
    }
    lines.push('');
    lines.push('※ 学習内容・振り返りの本文は含めていません。');
    return lines.join('\n');
  }

  function openReportPanel() {
    openModal(
      '<h3>不具合を報告する<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<div class="small" style="line-height:1.8;margin-bottom:10px">' +
      'うまく動かないところを書いて「コピーする」を押すと、報告用の文章ができます。' +
      'LINEやメールに貼って送ってね。<br>' +
      '<b>学習の内容や振り返りの中身は入りません。</b>' +
      '</div>' +
      '<div class="field"><label>どこで、何が起きた?</label>' +
      '<textarea id="rp-text" maxlength="500" rows="4" ' +
      'placeholder="例: コーチのメッセージボタンを押しても何も出てこない"></textarea></div>' +
      '<div class="field"><label>送られる内容(自動)</label>' +
      '<pre id="rp-preview" class="report-preview"></pre></div>' +
      '<button class="btn primary block" id="rp-send">📤 LINEなどで送る</button>' +
      '<button class="btn block" id="rp-copy" style="margin-top:8px">📋 コピーする</button>' +
      '<div class="small" style="margin-top:10px;line-height:1.8">' +
      '「送る」を押すと共有画面が出るので、LINEを選んでね。' +
      '出てこないときは「コピーする」で写して、LINEに貼り付けてね。' +
      '</div>'
    );
    $('m-close').onclick = closeModal;
    function refresh() { $('rp-preview').textContent = buildReportText($('rp-text').value); }
    $('rp-text').addEventListener('input', refresh);
    refresh();
    $('rp-copy').onclick = function () {
      copyToClipboard(buildReportText($('rp-text').value)).then(function (okCopy) {
        toast(okCopy ? 'コピーしたよ！LINEなどに貼り付けてね' : 'コピーできなかった。長押しで選んでコピーしてね', !okCopy);
      });
    };
    $('rp-send').onclick = function () { shareReport(buildReportText($('rp-text').value)); };
  }

  /* 報告文を端末の共有画面へ渡す(APP-470)。
   * アプリ自身は通信しない。文章をiOSの共有シートへ渡すだけで、
   * どこへ送るかは本人がその場で選ぶ(LINE・メールなど)。
   * 共有が使えない環境ではコピーに落とす。 */
  function shareReport(text) {
    if (navigator.share) {
      navigator.share({ title: 'IBUKI STUDY BEAT 不具合レポート', text: text })
        .catch(function (e) {
          // 本人が共有画面を閉じただけのときは何も言わない
          if (e && e.name === 'AbortError') return;
          fallbackShare(text);
        });
      return;
    }
    fallbackShare(text);
  }

  function fallbackShare(text) {
    copyToClipboard(text).then(function (okCopy) {
      toast(okCopy
        ? 'この端末では共有画面が使えないよ。コピーしたからLINEに貼り付けてね'
        : 'コピーできなかった。長押しで選んでコピーしてね', !okCopy);
    });
  }

  /* ================= アップデートのお知らせ(APP-461) =================
   * 新しい版が届いたら、設定タブに赤い点を出す。
   * ホーム画面のアイコン自体へのバッジは、iOSでは通知の許可が要るため
   * 使える場合だけ静かに付ける(許可は求めない)。 */

  var updateWaiting = false;
  var pendingUpdateWorker = null;

  function setUpdateBadge(on) {
    updateWaiting = !!on;
    var btn = document.querySelector('.nav-btn[data-screen="settings"]');
    if (btn) btn.classList.toggle('has-update', updateWaiting);
    var item = document.querySelector('.settings-item[data-panel="about"] .dot');
    if (item) item.remove();
    if (updateWaiting) {
      var about = document.querySelector('.settings-item[data-panel="about"]');
      if (about) {
        var d = document.createElement('span');
        d.className = 'dot';
        about.insertBefore(d, about.querySelector('.chev'));
      }
    }
    /* setAppBadge は Promise を返す。許可の無い環境では拒否されるため、
     * 同期の try だけでは拾えない。両方で握りつぶす。 */
    try {
      var op = updateWaiting
        ? (navigator.setAppBadge && navigator.setAppBadge(1))
        : (navigator.clearAppBadge && navigator.clearAppBadge());
      if (op && typeof op.catch === 'function') op.catch(function () { /* 許可なし */ });
    } catch (e) { /* 使えない環境では何もしない */ }
  }

  function openAboutPanel() {
    var updateBlock = updateWaiting
      ? '<div class="field" style="margin-bottom:12px">' +
        '<button class="btn primary block" id="ab-update">🔄 いますぐ更新する</button>' +
        '<div class="small" style="margin-top:6px">新しいバージョンが届いています。学習の記録は消えません。</div>' +
        '</div>'
      : '';
    openModal(
      '<h3>サポート・ヘルプ<button class="icon-btn" id="m-close">✕</button></h3>' +
      updateBlock +
      '<div class="small" style="line-height:1.9">' +
      '<b>IBUKI STUDY BEAT</b> ver. ' + APP_VERSION + '<br>' +
      '一歩一歩が、未来のステージをつくる。<br><br>' +
      '・「今日」で予定を立てて学習開始 → 終了で自動記録<br>' +
      '・「記録」で後から追加・編集・削除(ごみ箱つき)<br>' +
      '・「グラフ」は左=計画(薄)・右=実績(濃)の科目別積み上げ。緑線=累積計画、青線=累積実績(右軸)<br>' +
      '・グラフは左右スワイプで移動、ピンチで拡大縮小、⚙️か長押しで軸設定<br>' +
      '・コーチの返答は端末内の定型ロジックです(外部AI接続なし)<br>' +
      '・データはこの端末内にのみ保存。設定→データ管理から書き出し/読み込み<br>' +
      '</div>'
    );
    $('m-close').onclick = closeModal;
    if (updateWaiting && $('ab-update')) {
      $('ab-update').onclick = function () {
        if (!pendingUpdateWorker) { toast('更新の準備ができていないよ。少し待ってね', true); return; }
        // 待機していた版が失効していることがある。その場合は赤い点を残し、
        // 画面を閉じずに次の手順を伝える(更新できないまま行き止まりにしない)。
        try {
          pendingUpdateWorker.postMessage({ type: 'SKIP_WAITING' });
        } catch (e) {
          pendingUpdateWorker = null;
          toast('更新できなかったよ。アプリを閉じてもう一度開いてね', true);
          return;
        }
        toast('更新中…少し待ってね');
        setUpdateBadge(false);
        closeModal();
      };
    }
  }

  /* ================= 起動 ================= */
  function renderAll() {
    renderBpBalance();
    renderToday();
    renderRecordScreen();
    if (currentScreen === 'graph') renderGraphScreen();
    if (currentScreen === 'world') renderWorldScreen();
    if (currentScreen === 'coach') renderCoach();
  }

  /* --- 起動時のあいさつ(画面中央) --- */
  var LAST_SEEN_VERSION_KEY = 'ibukiStudyBeat.lastSeenVersion';

  function showWelcomeMessage() {
    var lastSeen = null;
    try { lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY); } catch (e) {}
    try { localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION); } catch (e) {}

    // 前回と違うバージョンで開いた = 更新後の初回起動
    if (lastSeen && lastSeen !== APP_VERSION) {
      showCenterMessage({
        img: 'cele_nicebeat.png',
        title: 'アプリが新しくなったよ！',
        body: 'ver. ' + lastSeen + ' → ' + APP_VERSION + ' に更新できたよ。',
        sub: '記録はぜんぶそのまま残っているから安心してね。',
        buttonLabel: '今日も始める ▶',
        onConfirm: function () { showScreen('today'); }
      });
      return;
    }

    var recs = todayRecords();
    var total = 0;
    recs.forEach(function (r) { total += r.actualMin; });
    var streak = C.streakDays(state.records, todayStr(), state.shop.streakGuardDates);
    var name = state.settings.userName || '伊吹';
    var sub = '';
    if (state.settings.examDate) {
      var dd = C.diffDays(todayStr(), state.settings.examDate);
      if (dd > 0) sub = '受験まであと ' + dd + '日';
      else if (dd === 0) sub = 'いよいよ今日が本番！';
    }
    if (!sub && streak > 0) sub = streak + '日連続で積み上げ中！';
    if (total > 0) sub = '今日はここまで ' + C.fmtDuration(total) + '。' + (sub ? ' / ' + sub : '');

    showCenterMessage({
      img: 'coach_stage.png',
      title: (lastSeen ? 'おかえり、' : 'ようこそ、') + name + '！',
      body: greeting(),
      sub: sub,
      buttonLabel: '今日も始める ▶',
      autoCloseMs: 4000
    });
  }

  /* --- アップデート検知(Service Worker) --- */

  /* 受け入れ試験から更新バッジの表示を確認するための入口。
   * Service Workerの更新は試験環境で再現しづらいため、ここだけ公開する。 */
  window.__isbSetUpdateBadge = setUpdateBadge;

  function setupServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;

    // 新しい版が有効になったら画面を読み込み直す(データはそのまま)
    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return;
      reloading = true;
      location.reload();
    });

    navigator.serviceWorker.register('sw.js').then(function (reg) {
      function offerUpdate(worker) {
        if (!worker) return;
        setUpdateBadge(true);
        pendingUpdateWorker = worker;
        showCenterMessage({
          img: 'cele_streak7.png',
          title: '新しいバージョンがあるよ！',
          body: 'アップデートを入れると、追加された機能が使えるようになるよ。',
          sub: '学習の記録は消えないから大丈夫！',
          buttonLabel: '🔄 いますぐ更新する',
          onConfirm: function () {
            toast('更新中…少し待ってね');
            setUpdateBadge(false);
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      }
      // すでに新しい版が待機している場合
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      // 新しい版が届いた場合
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(nw);
        });
      });
      // アプリを開いたとき・前面に戻したとき、および定期的に新版を確認
      function checkUpdate() { try { reg.update(); } catch (e) {} }
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) checkUpdate();
      });
      setInterval(checkUpdate, 30 * 60 * 1000);
    }).catch(function () {});
  }

  function init() {
    state = loadState();
    save();
    checkPoseUnlocks();
    $('app-version').textContent = 'ver. ' + APP_VERSION;
    $('app-build').textContent = '更新日 ' + BUILD_DATE + ' ・ 更新 ' + BUILD_UPDATER + ' ・ モデル ' + BUILD_MODEL;
    $('rf-date').value = todayStr();
    $('rf-subject').innerHTML = subjectOptions();
    $('rf-kind').innerHTML = kindOptions(
      C.defaultStudyKindFor($('rf-subject').value), $('rf-subject').value);
    rfKindSubjectId = $('rf-subject').value;
    /* 前回の更新通知が残っていることがあるため、起動時にいったん消す。
     * 本当に待機中の版があれば、この直後の setupServiceWorker が付け直す。 */
    setUpdateBadge(false);
    renderToday();
    showWelcomeMessage();
    if (storageWarning) toast(storageWarning, true);
    setupServiceWorker();
  }

  init();
})();
