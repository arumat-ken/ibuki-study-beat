/* IBUKI STUDY BEAT — アプリ本体 */
(function () {
  'use strict';
  var C = window.ISBCalc;

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

  /* ================= キャラクター(BEATスター) ================= */
  function beatstarSVG(poseClass, opts) {
    opts = opts || {};
    var glow = opts.glow ? '<ellipse cx="60" cy="146" rx="34" ry="7" fill="rgba(217,178,74,0.35)"/>' : '<ellipse cx="60" cy="146" rx="30" ry="6" fill="rgba(0,0,0,0.35)"/>';
    return '' +
      '<svg class="beatstar ' + poseClass + (opts.groove ? ' groove' : '') + '" viewBox="0 0 120 152" role="img" aria-label="BEATスター">' +
      glow +
      // 脚
      '<g class="limb leg-l"><rect x="47" y="106" width="12" height="32" rx="4" fill="#141418"/><rect x="45" y="132" width="16" height="8" rx="3" fill="#0c0c0f"/></g>' +
      '<g class="limb leg-r"><rect x="61" y="106" width="12" height="32" rx="4" fill="#141418"/><rect x="59" y="132" width="16" height="8" rx="3" fill="#0c0c0f"/></g>' +
      '<g class="part body-g">' +
      // 腰
      '<rect x="45" y="98" width="30" height="12" rx="3" fill="#101014"/>' +
      // 胴体(黒ジャケット+白シャツ+金ライン)
      '<path d="M44 62 L76 62 L79 100 L41 100 Z" fill="#17171d" stroke="#26262e" stroke-width="1"/>' +
      '<path d="M56 62 L64 62 L62 88 L58 88 Z" fill="#f5f2ea"/>' +
      '<path d="M52 62 L58 62 L56 84 Z" fill="#101014"/>' +
      '<path d="M68 62 L62 62 L64 84 Z" fill="#101014"/>' +
      '<circle cx="60" cy="90" r="1.6" fill="#d9b24a"/>' +
      '<path d="M45 64 L48 96" stroke="#d9b24a" stroke-width="0.8" opacity="0.7"/>' +
      '<path d="M75 64 L72 96" stroke="#d9b24a" stroke-width="0.8" opacity="0.7"/>' +
      // 腕
      '<g class="limb arm-l"><rect x="38" y="63" width="10" height="30" rx="5" fill="#17171d"/><circle cx="43" cy="95" r="5" fill="#f0c75e"/><rect x="38" y="84" width="10" height="4" fill="#f5f2ea"/></g>' +
      '<g class="limb arm-r"><rect x="72" y="63" width="10" height="30" rx="5" fill="#17171d"/><circle cx="77" cy="95" r="5" fill="#f0c75e"/><rect x="72" y="84" width="10" height="4" fill="#f5f2ea"/></g>' +
      '</g>' +
      // 頭
      '<g class="part head-g">' +
      '<rect x="56" y="54" width="8" height="8" fill="#f0c75e"/>' +
      '<rect x="46" y="26" width="28" height="30" rx="9" fill="#f7d269"/>' +
      // 顔
      '<circle cx="54" cy="41" r="2.2" fill="#1a1a1e"/>' +
      '<circle cx="66" cy="41" r="2.2" fill="#1a1a1e"/>' +
      '<path d="M54 48 Q60 52 66 48" stroke="#1a1a1e" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      // カーリーヘア
      '<g fill="#15151a">' +
      '<circle cx="48" cy="27" r="6"/><circle cx="55" cy="23" r="6.5"/><circle cx="62" cy="22" r="6.5"/><circle cx="69" cy="24" r="6"/>' +
      '<circle cx="73" cy="30" r="5"/><circle cx="45" cy="33" r="5"/><circle cx="74" cy="37" r="4"/><circle cx="45" cy="39" r="3.5"/>' +
      '</g>' +
      '</g>' +
      (opts.star ? '<path d="M97 22 l3.2 6.6 7.2 1-5.2 5 1.2 7.2-6.4-3.4-6.4 3.4 1.2-7.2-5.2-5 7.2-1z" fill="#f0c75e"/>' : '') +
      '</svg>';
  }

  var POSES = [
    { id: 'smooth', name: 'スムーズ', cls: 'pose-idle', cond: null },
    { id: 'start', name: 'スタート', cls: 'pose-start', cond: null },
    { id: 'guts', name: 'ガッツポーズ', cls: 'pose-done', cond: null },
    { id: 'moonwalk', name: 'ムーンウォーク', cls: 'pose-moonwalk', cond: '7日連続記録で解放' },
    { id: 'zerogravity', name: 'ゼロ・グラビティ', cls: 'pose-lean', cond: '累計20時間で解放' },
    { id: 'spin', name: 'スピンターン', cls: 'pose-spin', cond: 'テストを記録して解放' },
    { id: 'heel', name: 'ヒール・トゥ', cls: 'pose-heel', cond: '受験イベント登録で解放' }
  ];
  var currentPose = 'smooth';

  function poseUnlocked(p) {
    if (!p.cond) return true;
    return state.poseUnlocks.indexOf(p.id) !== -1;
  }
  function checkPoseUnlocks() {
    var recs = C.activeRecords(state.records);
    var unlocked = [];
    if (C.streakDays(state.records, todayStr()) >= 7) unlocked.push('moonwalk');
    var total = 0;
    recs.forEach(function (r) { total += r.actualMin; });
    if (total >= 20 * 60) unlocked.push('zerogravity');
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
    $('today-char-name').textContent = state.settings.characterName;
    $('today-greeting').textContent = greeting();
    $('today-beat').innerHTML = beatstarSVG(state.activeSession ? 'pose-study' : 'pose-idle', { groove: !state.activeSession });

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
    $('today-streak').textContent = C.streakDays(state.records, todayStr());
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
    var banner = $('today-banner');
    if (storageWarning) {
      banner.innerHTML = '<div class="banner">' + esc(storageWarning) + '</div>';
    } else {
      banner.innerHTML = '';
    }
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
  function kindOptions(selected) {
    return C.STUDY_KINDS.map(function (k) {
      return '<option value="' + k + '"' + (k === selected ? ' selected' : '') + '>' + k + '</option>';
    }).join('');
  }

  $('btn-add-plan').addEventListener('click', function () { openPlanModal(null); });
  function openPlanModal(thenStart) {
    openModal(
      '<h3>今日の予定を追加<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<div class="field-row">' +
      '<div class="field"><label>科目</label><select id="m-subject">' + subjectOptions() + '</select></div>' +
      '<div class="field"><label>学習種別</label><select id="m-kind">' + kindOptions('暗記') + '</select></div>' +
      '</div>' +
      '<div class="field"><label>内容</label><input type="text" id="m-content" placeholder="例: 英単語 20語" maxlength="100"></div>' +
      '<div class="field"><label>計画時間(分)</label><input type="number" id="m-plan" min="1" max="720" inputmode="numeric" value="30"></div>' +
      '<button class="btn primary block big" id="m-save">' + (thenStart ? 'この内容で開始する ▶' : '予定に追加する') + '</button>'
    );
    $('m-close').onclick = closeModal;
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
      save(); closeModal();
      celebrateAfterSave(rec);
      renderToday();
    };
  }

  /* --- お祝い演出 --- */
  function celebrateAfterSave(rec) {
    checkPoseUnlocks();
    var total = 0;
    todayRecords().forEach(function (r) { total += r.actualMin; });
    var all = 0;
    C.activeRecords(state.records).forEach(function (r) { all += r.actualMin; });
    var streak = C.streakDays(state.records, todayStr());
    var msg = 'ナイスビート！', sub = C.fmtDuration(rec.actualMin) + ' 積み上げたよ', pose = 'pose-done';
    if (all >= 20 * 60 && all - rec.actualMin < 20 * 60) {
      msg = '累計20時間達成！'; sub = '積み重ねが力になってるよ！'; pose = 'pose-lean';
    } else if (streak === 7) {
      msg = '7日連続達成！'; sub = 'すごい！その調子！'; pose = 'pose-moonwalk';
    } else if (total >= state.settings.dailyGoalMin && total - rec.actualMin < state.settings.dailyGoalMin) {
      msg = '今日の目標達成！'; sub = '君がチャンピオンだ！'; pose = 'pose-done';
    }
    $('celebrate-beat').innerHTML = beatstarSVG(pose, { glow: true, star: true });
    $('celebrate-msg').textContent = msg;
    $('celebrate-sub').textContent = sub;
    $('celebrate').classList.add('open');
  }
  $('celebrate-close').addEventListener('click', function () {
    $('celebrate').classList.remove('open');
  });

  /* ================= 学習記録画面 ================= */
  function renderRecordScreen() {
    // フォーム初期化(選択肢だけ更新、入力中の値は保持)
    var subjSel = $('rf-subject');
    var cur = subjSel.value;
    subjSel.innerHTML = subjectOptions(cur);
    if ($('rf-kind').options.length === 0) $('rf-kind').innerHTML = kindOptions('暗記');
    if (!$('rf-date').value) $('rf-date').value = todayStr();
    $('rf-score-row').style.display = $('rf-kind').value === 'テスト' ? '' : 'none';
    renderRecordList();
  }

  $('rf-kind').addEventListener('change', function () {
    $('rf-score-row').style.display = this.value === 'テスト' ? '' : 'none';
  });

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
    save();
    $('rf-content').value = ''; $('rf-plan').value = ''; $('rf-actual').value = '';
    $('rf-score').value = ''; $('rf-maxscore').value = ''; $('rf-reflection').value = '';
    renderRecordList();
    checkPoseUnlocks();
    if (rec.actualMin > 0) celebrateAfterSave(rec);
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
      '<div class="field-row">' +
      '<div class="field"><label>学習種別</label><select id="m-kind">' + kindOptions(rec.kind) + '</select></div>' +
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
      $('m-score-row').style.display = this.value === 'テスト' ? 'flex' : 'none';
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

  function renderGraphScreen() {
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

  /* ================= コーチ画面 ================= */
  function renderCoach() {
    var pose = poseById(currentPose);
    $('coach-beat').innerHTML = beatstarSVG(pose.cls, { glow: true, groove: true });
    $('coach-name').textContent = state.settings.characterName;
    $('coach-bubble-name').textContent = state.settings.characterName;
    $('coach-pose-name').textContent = pose.name;
    $('coach-bubble-text').textContent = coachComment();
    renderPoseGrid();
    renderChatLog();
  }

  function coachComment() {
    var streak = C.streakDays(state.records, todayStr());
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
        '<div style="width:52px;margin:0 auto">' + beatstarSVG(p.cls) + '</div>' +
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

  $('btn-pose').addEventListener('click', function () {
    var p = $('pose-panel');
    p.style.display = p.style.display === 'none' ? '' : 'none';
    $('chat-panel').style.display = 'none';
  });
  $('btn-chat').addEventListener('click', function () {
    var p = $('chat-panel');
    p.style.display = p.style.display === 'none' ? '' : 'none';
    $('pose-panel').style.display = 'none';
    if (p.style.display !== 'none') {
      renderChatLog();
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
    var streak = C.streakDays(state.records, todayStr());
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

  /* ================= 設定画面 ================= */
  document.querySelectorAll('.settings-item').forEach(function (item) {
    item.addEventListener('click', function () { openSettingsPanel(item.dataset.panel); });
  });

  function openSettingsPanel(panel) {
    if (panel === 'profile') return openProfilePanel();
    if (panel === 'goal') return openGoalPanel();
    if (panel === 'exam') return openExamPanel();
    if (panel === 'subjects') return openSubjectsPanel();
    if (panel === 'axis') return openAxisModal();
    if (panel === 'data') return openDataPanel();
    if (panel === 'about') return openAboutPanel();
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
      '<p class="muted small" style="margin-bottom:10px">色・表示・並び順を変えられます。記録がある科目は削除できません(非表示にできます)。</p>';
    state.settings.subjects.forEach(function (s, i) {
      html += '<div class="subject-row" data-id="' + esc(s.id) + '">' +
        '<input type="color" value="' + s.color + '" data-f="color" aria-label="色">' +
        '<div class="nm"><input type="text" value="' + esc(s.name) + '" maxlength="12" data-f="name" aria-label="科目名"></div>' +
        '<button class="icon-btn" data-f="up"' + (i === 0 ? ' disabled style="opacity:0.3"' : '') + '>↑</button>' +
        '<button class="icon-btn" data-f="down"' + (i === state.settings.subjects.length - 1 ? ' disabled style="opacity:0.3"' : '') + '>↓</button>' +
        '<button class="toggle' + (s.visible ? ' on' : '') + '" data-f="vis" aria-label="表示"></button>' +
        '<button class="icon-btn danger" data-f="del" aria-label="削除">✕</button>' +
        '</div>';
    });
    html += '<button class="btn block" id="m-add">＋ 科目を追加</button>';
    openModal(html);
    $('m-close').onclick = closeModal;
    $('m-add').onclick = function () {
      var newId = 's' + Date.now().toString(36);
      state.settings.subjects.push({ id: newId, name: '新しい科目', color: '#7f8fa6', visible: true });
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

  function openAboutPanel() {
    openModal(
      '<h3>サポート・ヘルプ<button class="icon-btn" id="m-close">✕</button></h3>' +
      '<div class="small" style="line-height:1.9">' +
      '<b>IBUKI STUDY BEAT</b> v3.0<br>' +
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
  }

  /* ================= 起動 ================= */
  function renderAll() {
    renderToday();
    renderRecordScreen();
    if (currentScreen === 'graph') renderGraphScreen();
    if (currentScreen === 'coach') renderCoach();
  }

  function init() {
    state = loadState();
    save();
    checkPoseUnlocks();
    $('rf-date').value = todayStr();
    $('rf-kind').innerHTML = kindOptions('暗記');
    $('rf-subject').innerHTML = subjectOptions();
    renderToday();
    if (storageWarning) toast(storageWarning, true);
    // Service Worker (PWA)
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  init();
})();
