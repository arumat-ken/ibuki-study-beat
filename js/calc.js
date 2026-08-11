/*
 * IBUKI STUDY BEAT — 純粋計算ロジック
 * ブラウザ(window.ISBCalc)とNode(module.exports)の両方から利用できる。
 * DOM・localStorageに依存しないこと(単体テスト対象)。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ISBCalc = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCHEMA_VERSION = 3;
  var MAX_MIN_PER_RECORD = 720; // 1レコードあたりの上限(12時間)

  var DEFAULT_SUBJECTS = [
    { id: 'eng', name: '英語', color: '#4A90D9', visible: true, examSubject: true },
    { id: 'math', name: '数学', color: '#58B368', visible: true, examSubject: true },
    { id: 'jpn', name: '国語', color: '#F5A623', visible: true, examSubject: true },
    { id: 'sci', name: '理科', color: '#9B59B6', visible: true, examSubject: true },
    { id: 'soc', name: '社会', color: '#E8604C', visible: true, examSubject: true },
    { id: 'other', name: 'その他', color: '#9AA0A6', visible: true, examSubject: false }
  ];

  /* 学習種別。科目ごとに、その科目で実際にやる勉強の言い方を出す。
   * 全科目で同じ7つを出していたため、社会に「読解」、数学に「暗記」といった
   * 噛み合わない語が並び、始める前に気持ちが削がれていた(APP-460)。
   *
   * STUDY_KINDS は「その他」と自作科目の既定であり、旧データの値でもある。
   * 過去の記録を無効にしないため、検証は全リストの和集合で行う。 */
  var STUDY_KINDS = ['暗記', '演習', '読解', '講義', '復習', 'テスト', 'その他'];

  var SUBJECT_STUDY_KINDS = {
    eng:  ['単語・熟語', '文法', '長文読解', 'リスニング', '英作文', '音読', '復習・解き直し', 'テスト'],
    math: ['公式・定理の確認', '例題で解法を確認', '問題演習', '解き直し', '計算練習', 'テスト'],
    jpn:  ['漢字・語彙', '現代文読解', '古文', '漢文', '記述練習', '復習・解き直し', 'テスト'],
    sci:  ['用語・原理の暗記', '計算問題', '実験・図表の読み取り', '問題演習', '解き直し', 'テスト'],
    soc:  ['用語の暗記', '流れ・つながりの整理', '資料・地図・グラフ', '一問一答', '論述練習', '解き直し', 'テスト']
  };

  /* 科目を選んだときの初期値。いちばんよくやる勉強を置く。 */
  var DEFAULT_STUDY_KINDS = {
    eng:  '単語・熟語',
    math: '問題演習',
    jpn:  '現代文読解',
    sci:  '問題演習',
    soc:  '用語の暗記'
  };

  /* 点数入力欄の出し分けに使うため、どの科目にも必ず含める。 */
  var TEST_KIND = 'テスト';

  /* 科目idは利用者が作った科目や、読み込んだバックアップ由来の任意の文字列でありうる。
   * 'toString' や 'constructor' のようなキーで Object.prototype の中身を掴まないよう、
   * 自分自身が持つキーかどうかを必ず確かめる。 */
  function ownList(map, key) {
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
  }

  function studyKindsFor(subjectId) {
    var list = ownList(SUBJECT_STUDY_KINDS, subjectId);
    return (Array.isArray(list) ? list : STUDY_KINDS).slice();
  }

  function defaultStudyKindFor(subjectId) {
    var d = ownList(DEFAULT_STUDY_KINDS, subjectId);
    if (typeof d === 'string' && d) return d;
    return studyKindsFor(subjectId)[0];
  }

  /* 検証用の和集合。旧データの値も、科目を変えた記録も無効にしない。 */
  var ALL_STUDY_KINDS = (function () {
    var seen = {}, out = [];
    function add(k) { if (!seen[k]) { seen[k] = true; out.push(k); } }
    STUDY_KINDS.forEach(add);
    Object.keys(SUBJECT_STUDY_KINDS).forEach(function (id) {
      SUBJECT_STUDY_KINDS[id].forEach(add);
    });
    return out;
  })();

  function isValidStudyKind(kind) {
    return ALL_STUDY_KINDS.indexOf(kind) !== -1;
  }

  /* ---------- 日付ユーティリティ ---------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function toDateStr(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function isDateStr(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = parseDate(s);
    return !!d && toDateStr(d) === s;
  }

  function parseDate(s) {
    if (typeof s !== 'string') return null;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  }

  function addDays(dateStr, n) {
    var d = parseDate(dateStr);
    d.setDate(d.getDate() + n);
    return toDateStr(d);
  }

  function diffDays(a, b) {
    var da = parseDate(a), db = parseDate(b);
    return Math.round((db.getTime() - da.getTime()) / 86400000);
  }

  /* 旧パイロット版の日付 '2025/8/4' → '2025-08-04' */
  function parseJaDate(s) {
    if (typeof s !== 'string') return null;
    var m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!m) return null;
    return m[1] + '-' + pad2(+m[2]) + '-' + pad2(+m[3]);
  }

  /* ---------- バリデーション ---------- */

  /**
   * 記録1件を検証する。
   * @returns {ok:boolean, errors:string[]}
   */
  function validateRecord(rec, subjects) {
    var errors = [];
    if (!rec || typeof rec !== 'object') return { ok: false, errors: ['記録データが不正です'] };
    if (!isDateStr(rec.date)) errors.push('日付が正しくありません');
    var subjectIds = (subjects || []).map(function (s) { return s.id; });
    if (subjectIds.indexOf(rec.subjectId) === -1) errors.push('科目を選択してください');
    if (typeof rec.content !== 'string' || rec.content.trim() === '') errors.push('内容を入力してください');
    var plan = rec.planMin, actual = rec.actualMin;
    if (!isIntInRange(plan, 0, MAX_MIN_PER_RECORD)) errors.push('計画時間は0〜' + MAX_MIN_PER_RECORD + '分で入力してください');
    if (!isIntInRange(actual, 0, MAX_MIN_PER_RECORD)) errors.push('実績時間は0〜' + MAX_MIN_PER_RECORD + '分で入力してください');
    if (isIntInRange(plan, 0, MAX_MIN_PER_RECORD) && isIntInRange(actual, 0, MAX_MIN_PER_RECORD) && plan === 0 && actual === 0) {
      errors.push('計画時間か実績時間のどちらかを入力してください');
    }
    if (rec.kind !== undefined && rec.kind !== '' && !isValidStudyKind(rec.kind)) errors.push('学習種別が不正です');
    if (rec.kind === 'テスト' && (rec.score !== null && rec.score !== undefined && rec.score !== '')) {
      var score = rec.score, max = rec.maxScore;
      if (!isIntInRange(max, 1, 10000)) errors.push('満点は1以上で入力してください');
      else if (!isIntInRange(score, 0, max)) errors.push('得点は0〜満点(' + max + '点)の範囲で入力してください');
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function isIntInRange(v, min, max) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= min && v <= max;
  }

  /** 配列から重複を除く(順序は保持)。 */
  function uniqueList(ids) {
    var seen = {}, out = [];
    ids.forEach(function (id) { if (!seen[id]) { seen[id] = true; out.push(id); } });
    return out;
  }
  /** 重複を除いた上で、defaultId が含まれていなければ先頭に補う(ステージの'street'用)。 */
  function uniqueWithDefault(ids, defaultId) {
    var out = uniqueList(ids);
    if (out.indexOf(defaultId) === -1) out.unshift(defaultId);
    return out;
  }

  function validateEvent(ev) {
    var errors = [];
    if (!ev || typeof ev !== 'object') return { ok: false, errors: ['イベントデータが不正です'] };
    if (!isDateStr(ev.date)) errors.push('日付が正しくありません');
    if (typeof ev.title !== 'string' || ev.title.trim() === '') errors.push('大学名・イベント名を入力してください');
    if (ev.url && !/^https?:\/\//.test(ev.url)) errors.push('URLはhttps://から入力してください');
    return { ok: errors.length === 0, errors: errors };
  }

  /* ---------- 集計 ---------- */

  function activeRecords(records) {
    return (records || []).filter(function (r) { return !r.deletedAt; });
  }

  /**
   * startDateからdays日分の日次バケットを作る。
   * 各バケット: {date, plan:{subjectId:分}, actual:{}, planTotal, actualTotal, cumPlan, cumActual}
   * 累積は表示範囲内での積み上げ。
   */
  function buildSeries(records, startDate, days) {
    var recs = activeRecords(records);
    var byDate = {};
    recs.forEach(function (r) {
      (byDate[r.date] = byDate[r.date] || []).push(r);
    });
    var series = [];
    var cumPlan = 0, cumActual = 0;
    for (var i = 0; i < days; i++) {
      var date = addDays(startDate, i);
      var bucket = { date: date, plan: {}, actual: {}, planTotal: 0, actualTotal: 0 };
      (byDate[date] || []).forEach(function (r) {
        if (r.planMin > 0) {
          bucket.plan[r.subjectId] = (bucket.plan[r.subjectId] || 0) + r.planMin;
          bucket.planTotal += r.planMin;
        }
        if (r.actualMin > 0) {
          bucket.actual[r.subjectId] = (bucket.actual[r.subjectId] || 0) + r.actualMin;
          bucket.actualTotal += r.actualMin;
        }
      });
      cumPlan += bucket.planTotal;
      cumActual += bucket.actualTotal;
      bucket.cumPlan = cumPlan;
      bucket.cumActual = cumActual;
      series.push(bucket);
    }
    return series;
  }

  /** 表示範囲のサマリー(計画合計・実績合計・達成率・累積) */
  function summarize(series) {
    var planTotal = 0, actualTotal = 0;
    series.forEach(function (b) { planTotal += b.planTotal; actualTotal += b.actualTotal; });
    return {
      planTotal: planTotal,
      actualTotal: actualTotal,
      rate: planTotal > 0 ? Math.round(actualTotal / planTotal * 1000) / 10 : null,
      cumPlan: series.length ? series[series.length - 1].cumPlan : 0,
      cumActual: series.length ? series[series.length - 1].cumActual : 0
    };
  }

  /**
   * 連続記録日数(今日または昨日を終端とした実績>0の連続日数)。
   * guardedDates(消費アイテム「リカバリー」を使った日)は実績0でも連続扱いにする。
   */
  function streakDays(records, todayStr_, guardedDates) {
    var recs = activeRecords(records).filter(function (r) { return r.actualMin > 0; });
    var dates = {};
    recs.forEach(function (r) { dates[r.date] = true; });
    (guardedDates || []).forEach(function (d) { dates[d] = true; });
    var start = dates[todayStr_] ? todayStr_ : addDays(todayStr_, -1);
    if (!dates[start]) return 0;
    var n = 0, d = start;
    while (dates[d]) { n++; d = addDays(d, -1); }
    return n;
  }

  /** 軸の最大値をきりのいい値に丸める(分単位で受け取り分単位で返す) */
  function niceMax(value, unit) {
    if (!isFinite(value) || value <= 0) return unit === 'hours' ? 60 : 30;
    if (unit === 'hours') {
      var hours = value / 60;
      var steps = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 30, 40, 50, 60, 80, 100, 120, 160, 200, 240, 300, 400, 500, 600, 800, 1000];
      for (var i = 0; i < steps.length; i++) {
        if (hours <= steps[i]) return steps[i] * 60;
      }
      return Math.ceil(hours / 100) * 100 * 60;
    }
    var steps2 = [10, 15, 20, 30, 40, 50, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720, 960, 1200];
    for (var j = 0; j < steps2.length; j++) {
      if (value <= steps2[j]) return steps2[j];
    }
    return Math.ceil(value / 600) * 600;
  }

  /** 分→表示文字列 */
  function fmtMin(min, unit) {
    if (unit === 'hours') {
      var h = min / 60;
      return (Math.round(h * 100) / 100) + '';
    }
    return min + '';
  }

  function fmtDuration(min) {
    var h = Math.floor(min / 60), m = min % 60;
    if (h > 0 && m > 0) return h + '時間' + m + '分';
    if (h > 0) return h + '時間';
    return m + '分';
  }

  /* ---------- 状態のサニタイズ(壊れたデータでも例外を出さない) ---------- */

  function defaultAxis() {
    return {
      placement: 'split',      // 'split'(左右分け) | 'left'(左寄せ)
      unit: 'hours',           // 'hours' | 'minutes'
      barMax: null,            // null=自動 / 分
      lineMax: null,           // null=自動 / 分
      showZeroLine: true,
      autoRange: true
    };
  }

  /* 連携できるAIアプリ。iOSではユニバーサルリンクで、インストール済みなら
   * アプリが、無ければブラウザ版が開く。prefill=trueはURLに質問を載せられるもの。 */
  var AI_APPS = [
    { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/?q=', prefill: true },
    { id: 'claude', name: 'Claude', url: 'https://claude.ai/new?q=', prefill: true },
    { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app', prefill: false },
    { id: 'copilot', name: 'Copilot', url: 'https://copilot.microsoft.com/?q=', prefill: true },
    { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai/search?q=', prefill: true },
    { id: 'clipboard', name: 'コピーだけする(Gemmaなど)', url: '', prefill: false },
    { id: 'custom', name: 'その他(URLを自分で設定)', url: '', prefill: false }
  ];

  function defaultAI() {
    return {
      appId: 'chatgpt',
      customUrl: '',
      sendStats: true   // 今の学習状況をプロンプトに添えるか
    };
  }

  function aiAppById(id) {
    for (var i = 0; i < AI_APPS.length; i++) {
      if (AI_APPS[i].id === id) return AI_APPS[i];
    }
    return AI_APPS[0];
  }

  /* 志望学部。ニュースの学部ボーナス(×1.5)とAI質問文の分岐に使う。
   * 現時点の想定進路(経済/法/国際)に合わせ、デフォルトはすべてON。 */
  function defaultFaculties() {
    return { economics: true, law: true, international: true };
  }
  var FACULTY_IDS = ['economics', 'law', 'international'];

  function defaultState(todayStr_) {
    return {
      schemaVersion: SCHEMA_VERSION,
      createdAt: todayStr_ || null,
      settings: {
        characterName: 'ビート',
        userName: '伊吹',
        slogans: ['一日一歩、未来の自分へ'],
        dailyGoalMin: 180,
        examDate: null,
        ai: defaultAI(),
        axis: defaultAxis(),
        subjects: DEFAULT_SUBJECTS.map(function (s) { return { id: s.id, name: s.name, color: s.color, visible: s.visible, examSubject: s.examSubject }; }),
        faculties: defaultFaculties()
      },
      records: [],
      events: [],
      news: [],
      coach: {
        members: [{ id: 'beat', label: 'BEATスター' }],
        messages: []
      },
      activeSession: null,
      poseUnlocks: [],
      shop: defaultShopState(),
      habits: {},
      dailyBonuses: {},
      seq: 1
    };
  }

  /** ニュース記録1件を検証する(C章)。見出しは必須、一言は任意。 */
  function validateNewsEntry(entry) {
    var errors = [];
    if (!entry || typeof entry !== 'object') return { ok: false, errors: ['記録データが不正です'] };
    if (!isDateStr(entry.date)) errors.push('日付が正しくありません');
    if (!newsGenreById(entry.genreId)) errors.push('ジャンルを選択してください');
    if (typeof entry.headline !== 'string' || entry.headline.trim() === '') errors.push('見出しを入力してください');
    return { ok: errors.length === 0, errors: errors };
  }

  /**
   * パース済みオブジェクトを検証し、正しい形の状態に整える。
   * 復元不能なら null を返す(呼び出し側は既存データを消さないこと)。
   */
  function sanitizeState(parsed, todayStr_) {
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.schemaVersion !== 'number') return null;
    var base = defaultState(todayStr_);
    var out = base;
    var s = parsed.settings || {};
    if (typeof s.characterName === 'string' && s.characterName.trim()) out.settings.characterName = s.characterName.slice(0, 20);
    if (typeof s.userName === 'string' && s.userName.trim()) out.settings.userName = s.userName.slice(0, 20);
    if (Array.isArray(s.slogans)) {
      out.settings.slogans = s.slogans.filter(function (x) { return typeof x === 'string' && x.trim(); }).slice(0, 3);
      if (out.settings.slogans.length === 0) out.settings.slogans = base.settings.slogans;
    }
    if (isIntInRange(s.dailyGoalMin, 10, 1440)) out.settings.dailyGoalMin = s.dailyGoalMin;
    if (isDateStr(s.examDate)) out.settings.examDate = s.examDate;
    var ai = s.ai || {};
    if (typeof ai.appId === 'string' && AI_APPS.some(function (a) { return a.id === ai.appId; })) {
      out.settings.ai.appId = ai.appId;
    }
    if (typeof ai.customUrl === 'string' && /^https?:\/\//.test(ai.customUrl)) {
      out.settings.ai.customUrl = ai.customUrl.slice(0, 500);
    }
    if (typeof ai.sendStats === 'boolean') out.settings.ai.sendStats = ai.sendStats;
    var ax = s.axis || {};
    if (ax.placement === 'left' || ax.placement === 'split') out.settings.axis.placement = ax.placement;
    if (ax.unit === 'minutes' || ax.unit === 'hours') out.settings.axis.unit = ax.unit;
    if (isIntInRange(ax.barMax, 10, 100000)) out.settings.axis.barMax = ax.barMax;
    if (isIntInRange(ax.lineMax, 10, 1000000)) out.settings.axis.lineMax = ax.lineMax;
    if (typeof ax.showZeroLine === 'boolean') out.settings.axis.showZeroLine = ax.showZeroLine;
    if (typeof ax.autoRange === 'boolean') out.settings.axis.autoRange = ax.autoRange;
    if (Array.isArray(s.subjects)) {
      var subs = s.subjects.filter(function (x) {
        return x && typeof x.id === 'string' && x.id && typeof x.name === 'string' && x.name.trim();
      }).map(function (x) {
        return {
          id: x.id,
          name: x.name.slice(0, 12),
          color: /^#[0-9a-fA-F]{6}$/.test(x.color) ? x.color : '#9AA0A6',
          visible: x.visible !== false,
          examSubject: x.examSubject !== false
        };
      });
      if (subs.length > 0) out.settings.subjects = subs;
    }
    var fac = s.faculties || {};
    FACULTY_IDS.forEach(function (id) {
      if (typeof fac[id] === 'boolean') out.settings.faculties[id] = fac[id];
    });
    var subjectIds = out.settings.subjects.map(function (x) { return x.id; });
    if (Array.isArray(parsed.records)) {
      out.records = parsed.records.filter(function (r) {
        return r && typeof r === 'object' && isDateStr(r.date) &&
          subjectIds.indexOf(r.subjectId) !== -1 &&
          typeof r.content === 'string' &&
          isIntInRange(r.planMin | 0, 0, MAX_MIN_PER_RECORD) &&
          isIntInRange(r.actualMin | 0, 0, MAX_MIN_PER_RECORD);
      }).map(function (r) {
        return {
          id: typeof r.id === 'string' ? r.id : 'r' + Math.random().toString(36).slice(2, 10),
          date: r.date,
          subjectId: r.subjectId,
          content: r.content.slice(0, 100),
          kind: isValidStudyKind(r.kind) ? r.kind : 'その他',
          planMin: r.planMin | 0,
          actualMin: r.actualMin | 0,
          score: isIntInRange(r.score, 0, 10000) ? r.score : null,
          maxScore: isIntInRange(r.maxScore, 1, 10000) ? r.maxScore : null,
          reflection: typeof r.reflection === 'string' ? r.reflection.slice(0, 300) : '',
          createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
          updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
          deletedAt: typeof r.deletedAt === 'number' ? r.deletedAt : null,
          bp: isIntInRange(r.bp, 0, DAILY_BP_CAP) ? r.bp : 0
        };
      });
    }
    if (Array.isArray(parsed.events)) {
      out.events = parsed.events.filter(function (e) {
        return e && typeof e === 'object' && isDateStr(e.date) && typeof e.title === 'string' && e.title.trim();
      }).map(function (e) {
        return {
          id: typeof e.id === 'string' ? e.id : 'e' + Math.random().toString(36).slice(2, 10),
          date: e.date,
          title: e.title.slice(0, 40),
          faculty: typeof e.faculty === 'string' ? e.faculty.slice(0, 40) : '',
          method: typeof e.method === 'string' ? e.method.slice(0, 40) : '',
          url: (typeof e.url === 'string' && /^https?:\/\//.test(e.url)) ? e.url.slice(0, 500) : '',
          memo: typeof e.memo === 'string' ? e.memo.slice(0, 300) : ''
        };
      });
    }
    if (Array.isArray(parsed.news)) {
      out.news = parsed.news.filter(function (n) {
        return n && typeof n === 'object' && isDateStr(n.date) &&
          newsGenreById(n.genreId) && typeof n.headline === 'string' && n.headline.trim();
      }).map(function (n) {
        return {
          id: typeof n.id === 'string' ? n.id : 'n' + Math.random().toString(36).slice(2, 10),
          date: n.date,
          genreId: n.genreId,
          headline: n.headline.slice(0, 60),
          comment: typeof n.comment === 'string' ? n.comment.slice(0, 120) : '',
          bp: isIntInRange(n.bp, 0, 1000) ? n.bp : 0,
          createdAt: typeof n.createdAt === 'number' ? n.createdAt : 0
        };
      });
    }
    if (parsed.coach && Array.isArray(parsed.coach.messages)) {
      out.coach.messages = parsed.coach.messages.filter(function (m) {
        return m && typeof m.text === 'string' && (m.role === 'ibuki' || m.role === 'beat');
      }).map(function (m) {
        return { id: typeof m.id === 'string' ? m.id : 'm' + Math.random().toString(36).slice(2, 10), role: m.role, text: m.text.slice(0, 500), ts: typeof m.ts === 'number' ? m.ts : 0 };
      }).slice(-200);
    }
    if (parsed.activeSession && typeof parsed.activeSession === 'object' &&
      typeof parsed.activeSession.recordId === 'string' &&
      typeof parsed.activeSession.startTs === 'number') {
      out.activeSession = {
        recordId: parsed.activeSession.recordId,
        startTs: parsed.activeSession.startTs,
        pausedAccum: typeof parsed.activeSession.pausedAccum === 'number' ? parsed.activeSession.pausedAccum : 0,
        pausedAt: typeof parsed.activeSession.pausedAt === 'number' ? parsed.activeSession.pausedAt : null
      };
    }
    if (Array.isArray(parsed.poseUnlocks)) {
      out.poseUnlocks = parsed.poseUnlocks.filter(function (p) { return typeof p === 'string'; });
    }
    var sh = parsed.shop || {};
    var shOwned = sh.owned || {};
    ['costume', 'skill', 'stage'].forEach(function (cat) {
      if (Array.isArray(shOwned[cat])) {
        var validIds = { costume: COSTUME_ITEMS, skill: SKILL_ITEMS, stage: STAGE_ITEMS }[cat].map(function (x) { return x.id; });
        var ids = shOwned[cat].filter(function (id) { return typeof id === 'string' && validIds.indexOf(id) !== -1; });
        out.shop.owned[cat] = cat === 'stage' ? uniqueWithDefault(ids, 'street') : uniqueList(ids);
      }
    });
    if (shOwned.consumable && typeof shOwned.consumable === 'object') {
      var consOwned = {};
      Object.keys(shOwned.consumable).forEach(function (id) {
        if (consumableById(id) && isIntInRange(shOwned.consumable[id], 0, 999)) consOwned[id] = shOwned.consumable[id];
      });
      out.shop.owned.consumable = consOwned;
    }
    var shUsed = (sh.used && sh.used.consumable) || {};
    if (shUsed && typeof shUsed === 'object') {
      var consUsed = {};
      Object.keys(shUsed).forEach(function (id) {
        if (consumableById(id) && isIntInRange(shUsed[id], 0, 999)) consUsed[id] = shUsed[id];
      });
      out.shop.used.consumable = consUsed;
    }
    var shEq = sh.equipped || {};
    if (shEq.costume === null || (typeof shEq.costume === 'string' && out.shop.owned.costume.indexOf(shEq.costume) !== -1)) {
      out.shop.equipped.costume = shEq.costume;
    }
    if (shEq.skill === null || (typeof shEq.skill === 'string' && out.shop.owned.skill.indexOf(shEq.skill) !== -1)) {
      out.shop.equipped.skill = shEq.skill;
    }
    if (typeof shEq.stage === 'string' && out.shop.owned.stage.indexOf(shEq.stage) !== -1) {
      out.shop.equipped.stage = shEq.stage;
    }
    if (Array.isArray(sh.activeBoosts)) {
      out.shop.activeBoosts = sh.activeBoosts.filter(function (b) {
        return b && typeof b === 'object' && typeof b.itemId === 'string' && consumableById(b.itemId) &&
          typeof b.expiresAt === 'number';
      }).map(function (b) {
        return { id: typeof b.id === 'string' ? b.id : 'ab' + Math.random().toString(36).slice(2, 10), itemId: b.itemId, kind: typeof b.kind === 'string' ? b.kind : '', expiresAt: b.expiresAt };
      });
    }
    if (isDateStr(sh.feverLastUsedDate)) out.shop.feverLastUsedDate = sh.feverLastUsedDate;
    if (Array.isArray(sh.streakGuardDates)) {
      out.shop.streakGuardDates = uniqueList(sh.streakGuardDates.filter(function (d) { return isDateStr(d); }));
    }
    if (parsed.habits && typeof parsed.habits === 'object') {
      var habits = {};
      Object.keys(parsed.habits).forEach(function (date) {
        if (!isDateStr(date)) return;
        var entry = parsed.habits[date];
        if (!entry || typeof entry !== 'object') return;
        var clean = {};
        HABIT_KEYS.forEach(function (k) { if (typeof entry[k] === 'boolean') clean[k] = entry[k]; });
        habits[date] = clean;
      });
      out.habits = habits;
    }
    if (parsed.dailyBonuses && typeof parsed.dailyBonuses === 'object') {
      var dailyBonuses = {};
      Object.keys(parsed.dailyBonuses).forEach(function (date) {
        if (!isDateStr(date)) return;
        var entry = parsed.dailyBonuses[date];
        if (!entry || typeof entry !== 'object') return;
        var clean = {};
        Object.keys(entry).forEach(function (k) {
          if (Object.prototype.hasOwnProperty.call(ACTION_BONUS_BP, k) && entry[k] === true) clean[k] = true;
        });
        if (Object.keys(clean).length > 0) dailyBonuses[date] = clean;
      });
      out.dailyBonuses = dailyBonuses;
    }
    if (typeof parsed.createdAt === 'string') out.createdAt = parsed.createdAt;
    out.seq = isIntInRange(parsed.seq, 1, 1e9) ? parsed.seq : (out.records.length + out.events.length + 10);
    return out;
  }

  /* ==================================================================
   * ポイント(BP)の獲得 (ver.4)
   * 仕様: docs/design/FEATURE_SPEC_v4.md A章・B章・C章 / 決定事項 H-4
   * ================================================================== */

  var BP_PER_MINUTE = 1;
  var DAILY_BP_CAP = 1500;          // 1日の獲得上限(倍率込みの最終値)
  var NON_EXAM_DAILY_BP_CAP = 100;  // 非受験科目・読書・その他の1日上限

  /* 行動ボーナス。倍率の影響を受けない固定加算。 */
  var ACTION_BONUS_BP = {
    planAchieved: 50,     // 計画達成(達成率80〜120%)
    reflection: 10,       // 振り返りを書いた
    streak3: 30,
    streak7: 100,
    streak30: 500,
    allExamSubjects: 80,  // 1日で全受験科目に触れた
    unitCleared: 200,     // 単元クリア
    mockExamTaken: 300,   // 模試を受けた
    mockExamImproved: 500 // 前回より点数UP
  };

  /* 生活習慣。コンディションメーターに蓄積し、翌日の倍率に効く。 */
  var HABIT_BP = {
    sleepEarly: 20,   // 24時前に就寝
    breakfast: 15,    // 朝ごはんを食べた
    exercise: 30,     // 運動30分
    restTaken: 10,    // 休憩をちゃんと取った
    reading: 40       // 読書30分
  };

  /* 装備スロットの上限(B章)。買い集めても同時装備は各1個。 */
  var MULTIPLIER_LIMITS = {
    costume: 0.5,
    skill: 1.0,
    stage: 1.0,
    condition: 0.3
  };
  var MULTIPLIER_CAP = 3.0;
  var FEVER_MULTIPLIER = 10.0;

  /* 計画達成とみなす達成率の範囲。時間を水増しすると外れるので抑止になる。 */
  var PLAN_ACHIEVED_MIN_RATE = 80;
  var PLAN_ACHIEVED_MAX_RATE = 120;

  function clampBonus(value, limit) {
    if (value === undefined || value === null) return 0;
    assertNotNegative(value, 'ボーナス');
    return Math.min(value, limit);
  }

  /**
   * コンディションメーター(生活習慣の合計BP)から翌日の倍率加算を求める。
   * 満点は115BP。段階制にして「あと少しで上がる」が分かるようにする。
   */
  function conditionBonusFromHabits(habitBP) {
    assertNotNegative(habitBP, 'コンディション');
    if (habitBP >= 90) return 0.3;
    if (habitBP >= 60) return 0.2;
    if (habitBP >= 30) return 0.1;
    if (habitBP > 0) return 0.05;
    return 0;
  }

  /**
   * 最終倍率を求める。掛け算ではなく足し算(B章)。
   * フィーバー中は他の倍率をすべて無効化して10倍に置き換える(H-4の決定)。
   * 掛け算にすると30倍になり経済が壊れるため。
   */
  function composeMultiplier(opts) {
    var o = opts || {};
    if (o.feverActive) {
      return {
        multiplier: FEVER_MULTIPLIER,
        feverActive: true,
        capped: false,
        breakdown: { base: FEVER_MULTIPLIER, costume: 0, skill: 0, stage: 0, condition: 0, consumable: 0 }
      };
    }
    var costume = clampBonus(o.costumeBonus, MULTIPLIER_LIMITS.costume);
    var skill = clampBonus(o.skillBonus, MULTIPLIER_LIMITS.skill);
    var stage = clampBonus(o.stageBonus, MULTIPLIER_LIMITS.stage);
    var condition = clampBonus(o.conditionBonus, MULTIPLIER_LIMITS.condition);
    /* 消費アイテム(エナジードリンク・スポットライト)はスロットの上限とは別に加算する。
     * カテゴリ別の上限は持たないが、全体は他の加算分と同じく3.0倍の上限に従う。 */
    var consumable = (o.consumableBonus === undefined || o.consumableBonus === null) ? 0 : o.consumableBonus;
    assertNotNegative(consumable, '消費アイテムの倍率');
    var raw = 1.0 + costume + skill + stage + condition + consumable;
    var multiplier = Math.min(raw, MULTIPLIER_CAP);
    return {
      multiplier: roundAmount(multiplier, 2),
      feverActive: false,
      capped: raw > MULTIPLIER_CAP,
      breakdown: { base: 1.0, costume: costume, skill: skill, stage: stage, condition: condition, consumable: consumable }
    };
  }

  /** 達成率(%)が計画達成の範囲に入っているか */
  function isPlanAchieved(planMin, actualMin) {
    if (!planMin || planMin <= 0) return false;
    var rate = actualMin / planMin * 100;
    return rate >= PLAN_ACHIEVED_MIN_RATE && rate <= PLAN_ACHIEVED_MAX_RATE;
  }

  /** 行動ボーナスの合計。未知のキーは黙って無視せずエラーにする。 */
  function calcActionBonusBP(actions) {
    if (actions === undefined || actions === null) return 0;
    if (!Array.isArray(actions)) throw new TypeError('行動ボーナスは配列で指定してください');
    var total = 0;
    actions.forEach(function (a) {
      if (typeof a !== 'string') throw new RangeError('行動ボーナスの形式が不正です');
      if (!Object.prototype.hasOwnProperty.call(ACTION_BONUS_BP, a)) {
        throw new RangeError('未知の行動ボーナスです: ' + a);
      }
      total += ACTION_BONUS_BP[a];
    });
    return total;
  }

  /**
   * 学習1件のBP獲得を計算する。
   * 上限は2段階。まず非受験科目の1日100BP、次に全体の1日1,500BP。
   * どこで削られたかを返し、画面で「今日の上限に達したよ」と出せるようにする。
   */
  function calcStudyBP(opts) {
    var o = opts || {};
    assertNotNegative(o.minutes, '学習時間');
    var multiplier = (o.multiplier === undefined || o.multiplier === null) ? 1 : o.multiplier;
    assertNotNegative(multiplier, '倍率');
    var todayTotalBP = (o.todayTotalBP === undefined || o.todayTotalBP === null) ? 0 : o.todayTotalBP;
    var todayNonExamBP = (o.todayNonExamBP === undefined || o.todayNonExamBP === null) ? 0 : o.todayNonExamBP;
    assertNotNegative(todayTotalBP, '今日の獲得BP');
    assertNotNegative(todayNonExamBP, '今日の非受験科目BP');
    var isExamSubject = o.isExamSubject !== false;

    var baseBP = roundAmount(o.minutes * BP_PER_MINUTE, 0);
    var multipliedBP = roundAmount(baseBP * multiplier, 0);
    var bonusBP = calcActionBonusBP(o.actions);
    var subtotal = multipliedBP + bonusBP;

    /* 非受験科目・読書は1日100BPまで(受験勉強を押しのけないため) */
    var nonExamCapped = false;
    var afterNonExam = subtotal;
    if (!isExamSubject) {
      var roomNonExam = Math.max(0, NON_EXAM_DAILY_BP_CAP - todayNonExamBP);
      if (subtotal > roomNonExam) {
        afterNonExam = roomNonExam;
        nonExamCapped = true;
      }
    }

    /* 全体の1日上限 1,500BP */
    var dailyCapped = false;
    var roomDaily = Math.max(0, DAILY_BP_CAP - todayTotalBP);
    var granted = afterNonExam;
    if (afterNonExam > roomDaily) {
      granted = roomDaily;
      dailyCapped = true;
    }

    return {
      baseBP: baseBP,
      multiplierApplied: multiplier,
      multipliedBP: multipliedBP,
      bonusBP: bonusBP,
      subtotalBP: subtotal,
      grantedBP: granted,
      lostToCapBP: subtotal - granted,
      nonExamCapped: nonExamCapped,
      dailyCapped: dailyCapped,
      isExamSubject: isExamSubject,
      todayTotalAfter: todayTotalBP + granted,
      todayNonExamAfter: isExamSubject ? todayNonExamBP : todayNonExamBP + granted
    };
  }

  /* ==================================================================
   * APP-440: 時間の分離とBPの決定的な再計算
   *
   * 設計書 docs/design/APP-440_DESIGN.md の §1・§3・§5・§6 に対応する。
   * ここに置くのは純粋関数だけで、state も DOM も時計も触らない。
   * 「いま」が必要な計算は必ず引数で受け取る。
   * ================================================================== */

  var MS_PER_MINUTE = 60000;

  /* §6: 計画達成ボーナスの最低実績。「15分以上」で15分ちょうどを含む(親の確定)。
   * 単語10個・漢字20個・ミニテストのような、短時間で完結する勉強を弾かないため。 */
  var PLAN_ACHIEVED_MIN_ACTUAL_MIN = 15;

  /* §6: 1日1回だけ付く行動ボーナス。小分け記録で水増しできないようにする。 */
  var DAILY_ONCE_ACTIONS = ['planAchieved', 'reflection', 'mockExamTaken', 'allExamSubjects',
    'streak3', 'streak7', 'streak30'];

  /**
   * §5: BP再計算の並べ替え。
   * 上限は「先に来た記録から順に配る」ため、順序が変わると同じデータでもBPが変わる。
   * 配列順・updatedAt・画面の表示順に依存させてはならない。
   */
  function bpOrder(a, b) {
    var ac = (a && typeof a.createdAt === 'number') ? a.createdAt : 0;
    var bc = (b && typeof b.createdAt === 'number') ? b.createdAt : 0;
    if (ac !== bc) return ac < bc ? -1 : 1;
    var ai = (a && typeof a.id === 'string') ? a.id : '';
    var bi = (b && typeof b.id === 'string') ? b.id : '';
    return ai < bi ? -1 : (ai > bi ? 1 : 0);
  }

  /**
   * §3: 学習区間を [from, to] の組に正規化する。
   * to が null の区間は「いま進行中」を表すので nowTs で閉じる。
   * 壊れた区間(数値でない・逆転している)は捨てる。推測して補わない。
   */
  function normalizeSegments(segments, nowTs) {
    if (!Array.isArray(segments)) return [];
    var now = (typeof nowTs === 'number' && isFinite(nowTs)) ? nowTs : 0;
    var out = [];
    segments.forEach(function (s) {
      if (!s || typeof s !== 'object') return;
      if (typeof s.from !== 'number' || !isFinite(s.from)) return;
      var to = (typeof s.to === 'number' && isFinite(s.to)) ? s.to : now;
      if (to <= s.from) return;
      out.push({ from: s.from, to: to });
    });
    return out;
  }

  /**
   * §3: 学習区間とアイテムの有効区間が実際に重なったミリ秒。
   * 区間が重複していても二重に数えないよう、先に和集合をとる。
   */
  function segmentsOverlapMs(segments, fromTs, toTs, nowTs) {
    if (typeof fromTs !== 'number' || typeof toTs !== 'number') return 0;
    if (toTs <= fromTs) return 0;
    var clipped = [];
    normalizeSegments(segments, nowTs).forEach(function (s) {
      var a = Math.max(s.from, fromTs);
      var b = Math.min(s.to, toTs);
      if (b > a) clipped.push({ from: a, to: b });
    });
    clipped.sort(function (x, y) { return x.from - y.from; });
    var total = 0;
    var curFrom = null;
    var curTo = null;
    clipped.forEach(function (s) {
      if (curTo === null) { curFrom = s.from; curTo = s.to; return; }
      if (s.from <= curTo) { if (s.to > curTo) curTo = s.to; return; }
      total += curTo - curFrom;
      curFrom = s.from;
      curTo = s.to;
    });
    if (curTo !== null) total += curTo - curFrom;
    return total;
  }

  /**
   * §3: 時間制アイテムの倍率が乗る分数を決める。
   *
   *   availableMs = max(0, min(持ち時間の残り, まだ使っていない実学習の重なり))
   *   appliedMs   = availableMs から分未満を切り捨てた値
   *   consumedMs += appliedMs        ← availableMs ではない
   *
   * consumedMs に足すのを appliedMs にするのが要点。
   * availableMs を足すと59秒を消費して端数を失い、
   * 何も足さないと次回に同じ59秒を重ねて使えてしまう。
   *
   * 壁時計の経過ではなく実学習区間を基準にするため、
   * 一時停止して放置してもアイテムは減らない。
   */
  function applyTimedBoost(opts) {
    var o = opts || {};
    var durationMs = (typeof o.durationMs === 'number' && isFinite(o.durationMs)) ? o.durationMs : 0;
    var consumedMs = (typeof o.consumedMs === 'number' && isFinite(o.consumedMs)) ? o.consumedMs : 0;
    assertNotNegative(durationMs, 'アイテムの持ち時間');
    assertNotNegative(consumedMs, 'アイテムの消費済み時間');
    var startedAt = (typeof o.startedAt === 'number' && isFinite(o.startedAt)) ? o.startedAt : null;
    if (startedAt === null) {
      return { overlapMs: 0, availableMs: 0, appliedMs: 0, boostMinutes: 0, nextConsumedMs: consumedMs };
    }
    var overlapMs = segmentsOverlapMs(o.segments, startedAt, startedAt + durationMs, o.now);
    var availableMs = Math.max(0, Math.min(durationMs - consumedMs, overlapMs - consumedMs));
    var appliedMs = availableMs - (availableMs % MS_PER_MINUTE);
    return {
      overlapMs: overlapMs,
      availableMs: availableMs,
      appliedMs: appliedMs,
      boostMinutes: appliedMs / MS_PER_MINUTE,
      nextConsumedMs: consumedMs + appliedMs
    };
  }

  /**
   * §1: BP対象時間 D を決める。
   *
   *   C ≤ A + E   宣言していない時間は実績にも入らない
   *   D ≤ C       BP対象は確認済み実績を超えない
   *   D ≤ 初回保存時の D   編集でBPが増えることはない(§5)
   *
   * 「宣言済み時間」は計画A＋延長Eで、本人が先に意思表示した時間である。
   */
  function resolveBpMinutes(opts) {
    var o = opts || {};
    var actualMin = (typeof o.actualMin === 'number' && isFinite(o.actualMin)) ? o.actualMin : 0;
    assertNotNegative(actualMin, '実績時間');
    var planMin = (typeof o.planMin === 'number' && isFinite(o.planMin)) ? o.planMin : 0;
    var extendedMin = (typeof o.extendedMin === 'number' && isFinite(o.extendedMin)) ? o.extendedMin : 0;
    assertNotNegative(planMin, '計画時間');
    assertNotNegative(extendedMin, '延長時間');

    var declaredMin = planMin + extendedMin;
    /* 手入力の記録は宣言済み時間を持たない。本人の明示的な意思表示なので実績をそのまま使う。 */
    var byDeclared = o.manualEntry ? actualMin : Math.min(actualMin, declaredMin);
    var cappedByDeclared = byDeclared < actualMin;

    var bpMin = byDeclared;
    var cappedByPrevious = false;
    if (typeof o.previousBpMin === 'number' && isFinite(o.previousBpMin) && o.previousBpMin >= 0) {
      if (bpMin > o.previousBpMin) {
        bpMin = o.previousBpMin;
        cappedByPrevious = true;
      }
    }
    return {
      bpMin: bpMin,
      actualMin: actualMin,
      declaredMin: declaredMin,
      manualEntry: !!o.manualEntry,
      cappedByDeclared: cappedByDeclared,
      cappedByPrevious: cappedByPrevious
    };
  }

  /**
   * §6: その日の行動ボーナスを1日1回だけに束ねる。
   *
   * 1分の記録を10件作って +600BP という水増しを塞ぐ。
   * どの記録に付けるかは bpOrder で決まる最初の対象記録に固定し、
   * 何度計算しても同じ結果になるようにする。
   */
  function resolveDailyActionBonuses(records, opts) {
    var o = opts || {};
    var list = (Array.isArray(records) ? records : []).filter(function (r) {
      return r && !r.deletedAt;
    }).slice().sort(bpOrder);

    var assigned = {};   // recordId -> [actionKey]
    var owners = {};     // actionKey -> recordId
    function assign(key, rec) {
      if (!rec || owners[key]) return;
      owners[key] = rec.id;
      if (!assigned[rec.id]) assigned[rec.id] = [];
      assigned[rec.id].push(key);
    }

    list.forEach(function (rec) {
      var actualMin = (typeof rec.actualMin === 'number') ? rec.actualMin : 0;
      /* 計画達成: 1日1回。かつ実績15分以上(15分ちょうどを含む)。 */
      if (actualMin >= PLAN_ACHIEVED_MIN_ACTUAL_MIN && isPlanAchieved(rec.planMin, actualMin)) {
        assign('planAchieved', rec);
      }
      /* 振り返り: 1日1回。その日いずれかの記録に書かれていればよい。 */
      if (typeof rec.reflection === 'string' && rec.reflection.trim() !== '') {
        assign('reflection', rec);
      }
      /* 模試・テスト: 1日1回。得点と満点が両方入っている記録が対象。 */
      if (typeof rec.score === 'number' && typeof rec.maxScore === 'number' && rec.maxScore > 0) {
        assign('mockExamTaken', rec);
      }
    });

    /* 日単位で決まるボーナス(全受験科目・連続日数)は、その日の最初の記録に寄せる。 */
    var dayLevel = Array.isArray(o.dayLevelActions) ? o.dayLevelActions : [];
    if (dayLevel.length && list.length) {
      dayLevel.forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(ACTION_BONUS_BP, key)) {
          throw new RangeError('未知の行動ボーナスです: ' + key);
        }
        assign(key, list[0]);
      });
    }

    return { byRecordId: assigned, owners: owners };
  }

  /**
   * §5: その日のBPを決定的に再計算する。
   *
   * 同じ記録集合からは、何度計算しても同じBPが出ることを不変条件とする。
   * 編集で日付・科目・実績が変わったら、移動前と移動後の両方の日でこれを呼ぶ。
   */
  function recalcDayBP(records, opts) {
    var o = opts || {};
    var multiplierFor = typeof o.multiplierFor === 'function' ? o.multiplierFor : function () { return 1; };
    var isExamSubjectFor = typeof o.isExamSubjectFor === 'function' ? o.isExamSubjectFor : function () { return true; };

    var list = (Array.isArray(records) ? records : []).filter(function (r) {
      return r && !r.deletedAt;
    }).slice().sort(bpOrder);

    var bonuses = resolveDailyActionBonuses(list, { dayLevelActions: o.dayLevelActions });

    var todayTotalBP = 0;
    var todayNonExamBP = 0;
    var results = [];
    list.forEach(function (rec) {
      var resolved = resolveBpMinutes({
        actualMin: rec.actualMin,
        planMin: rec.planMin,
        extendedMin: rec.extendedMin,
        manualEntry: rec.manualEntry,
        previousBpMin: rec.bpMin
      });
      var actions = bonuses.byRecordId[rec.id] || [];
      var calc = calcStudyBP({
        minutes: resolved.bpMin,
        multiplier: multiplierFor(rec),
        actions: actions,
        isExamSubject: isExamSubjectFor(rec),
        todayTotalBP: todayTotalBP,
        todayNonExamBP: todayNonExamBP
      });
      todayTotalBP = calc.todayTotalAfter;
      todayNonExamBP = calc.todayNonExamAfter;
      results.push({
        id: rec.id,
        bpMin: resolved.bpMin,
        bp: calc.grantedBP,
        actions: actions,
        multiplier: calc.multiplierApplied,
        cappedByDeclared: resolved.cappedByDeclared,
        cappedByPrevious: resolved.cappedByPrevious,
        nonExamCapped: calc.nonExamCapped,
        dailyCapped: calc.dailyCapped
      });
    });

    return { records: results, totalBP: todayTotalBP, nonExamBP: todayNonExamBP };
  }

  /* ---------- 時事ニュース (C章) ---------- */

  /* faculty: 'economics'|'law'|'international' に一致すると×1.5。
   * '*' はどの学部でも加点(IT・AI)。null はボーナスなし。 */
  var NEWS_GENRES = [
    { id: 'economy', name: '経済・金融・為替', bp: 40, faculty: 'economics' },
    { id: 'politics', name: '政治・法律・裁判', bp: 40, faculty: 'law' },
    { id: 'international', name: '国際・外交', bp: 40, faculty: 'international' },
    { id: 'society', name: '社会・事件・教育', bp: 30, faculty: null },
    { id: 'tech', name: 'IT・AI', bp: 40, faculty: '*' },
    { id: 'environment', name: '環境・自然・災害', bp: 35, faculty: null },
    { id: 'rights', name: '人権・多様性', bp: 35, faculty: null },
    { id: 'local', name: '地域・ふるさと', bp: 30, faculty: null },
    { id: 'sports', name: 'スポーツ', bp: 20, faculty: null },
    { id: 'culture', name: '芸能・カルチャー', bp: 20, faculty: null }
  ];
  var NEWS_DAILY_LIMIT = 3;              // 受験勉強を圧迫しないため
  var NEWS_FACULTY_MULTIPLIER = 1.5;
  var NEWS_ALL_GENRES_BONUS_BP = 200;    // 全ジャンル制覇デー

  function newsGenreById(id) {
    for (var i = 0; i < NEWS_GENRES.length; i++) {
      if (NEWS_GENRES[i].id === id) return NEWS_GENRES[i];
    }
    return null;
  }

  /**
   * ニュース1本のBP。志望学部に一致するジャンルは×1.5。
   * 1日3本を超えた分は0BP(記録自体は残せる想定)。
   */
  function calcNewsBP(opts) {
    var o = opts || {};
    var genre = newsGenreById(o.genreId);
    if (!genre) throw new RangeError('未知のジャンルです: ' + o.genreId);
    var faculties = Array.isArray(o.faculties) ? o.faculties : [];
    var todayCount = (o.todayCount === undefined || o.todayCount === null) ? 0 : o.todayCount;
    assertWholeCount(todayCount, '今日の記録本数');

    var matched = genre.faculty === '*' ||
      (genre.faculty !== null && faculties.indexOf(genre.faculty) !== -1);
    var bp = matched ? roundAmount(genre.bp * NEWS_FACULTY_MULTIPLIER, 0) : genre.bp;
    var overLimit = todayCount >= NEWS_DAILY_LIMIT;

    return {
      genreId: genre.id,
      genreName: genre.name,
      baseBP: genre.bp,
      facultyMatched: matched,
      bp: overLimit ? 0 : bp,
      overLimit: overLimit,
      remainingToday: Math.max(0, NEWS_DAILY_LIMIT - todayCount)
    };
  }

  /** 今日その日に全ジャンルを記録したか(+200BP) */
  function calcAllGenresBonus(recordedGenreIds) {
    var ids = Array.isArray(recordedGenreIds) ? recordedGenreIds : [];
    var seen = {};
    ids.forEach(function (id) { if (newsGenreById(id)) seen[id] = true; });
    var count = Object.keys(seen).length;
    var complete = count >= NEWS_GENRES.length;
    return {
      recorded: count,
      total: NEWS_GENRES.length,
      complete: complete,
      bonusBP: complete ? NEWS_ALL_GENRES_BONUS_BP : 0
    };
  }

  /* ==================================================================
   * 金融シミュレーション (ver.4)
   * 仕様: docs/design/FEATURE_SPEC_v4.md D章 / 決定事項 H-4〜H-7
   * ================================================================== */

  /* アプリの1週間 = 現実の1年。年利をそのまま週次で付利する(52倍速)。 */
  var INTEREST_SPEED_MULTIPLIER = 52;

  /* 定期預金のロック期間(週)。H-7で確定。 */
  var DEPOSIT_LOCK_WEEKS = {
    ordinary: 0,        // 普通預金・いつでも引き出せる
    fixed1Month: 4,     // 1ヶ月定期
    fixed3Months: 12    // 3ヶ月定期
  };

  /* 分割払いの手数料率。FEATURE_SPEC_v4.md の実例(50,000BPに対して
   * 52,500 / 55,000 / 59,000)と一致する。 */
  var INSTALLMENT_FEE_RATES = { 1: 0, 3: 0.05, 6: 0.10, 12: 0.18 };
  var INSTALLMENT_OPTIONS = [1, 3, 6, 12];

  var INITIAL_CREDIT_SCORE = 500;
  var MAX_CREDIT_SCORE = 1000;
  var CREDIT_EVENT_DELTAS = {
    payment: 50,    // 返済を1回完了
    payoff: 100,    // 完済
    late: -150      // 返済日に残高不足(延滞)
  };

  function assertNumber(value, label) {
    if (typeof value !== 'number' || !isFinite(value)) {
      throw new TypeError(label + 'は数値で指定してください');
    }
  }

  function assertNotNegative(value, label) {
    assertNumber(value, label);
    if (value < 0) throw new RangeError(label + 'は0以上で指定してください');
  }

  function assertPositive(value, label) {
    assertNumber(value, label);
    if (value <= 0) throw new RangeError(label + 'は0より大きい値で指定してください');
  }

  function assertWholeCount(value, label) {
    assertNumber(value, label);
    if (value < 0 || Math.floor(value) !== value) {
      throw new RangeError(label + 'は0以上の整数で指定してください');
    }
  }

  /** 通貨額を桁数で丸める。BPは0桁、BDは1桁で扱う。 */
  function roundAmount(value, digits) {
    assertNumber(value, '金額');
    var d = (digits === undefined || digits === null) ? 0 : digits;
    assertWholeCount(d, '丸め桁数');
    var factor = Math.pow(10, d);
    return Math.round(value * factor) / factor;
  }

  /**
   * 週次で複利計算する(52倍速)。
   * 毎週の利息を通貨の桁数で丸めてから残高へ加えるため、
   * 画面に出る数字と計算結果が必ず一致する。
   */
  function accrueWeeklyInterest(principal, annualRatePct, weeks, digits) {
    assertNotNegative(principal, '元本');
    assertNotNegative(annualRatePct, '金利');
    assertWholeCount(weeks, '経過週数');
    var d = (digits === undefined || digits === null) ? 0 : digits;
    var weeklyRate = annualRatePct / 100;
    var balance = roundAmount(principal, d);
    var interest = 0;
    for (var w = 0; w < weeks; w++) {
      var gain = roundAmount(balance * weeklyRate, d);
      balance = roundAmount(balance + gain, d);
      interest = roundAmount(interest + gain, d);
    }
    return {
      principal: roundAmount(principal, d),
      interest: interest,
      balance: balance,
      weeks: weeks,
      annualRatePct: annualRatePct,
      speedMultiplier: INTEREST_SPEED_MULTIPLIER
    };
  }

  /**
   * 円建て預金(普通・定期)の評価。
   * 定期は満期前に解約すると利息が付かない(流動性 vs リターンの学習)。
   */
  function calculateDeposit(opts) {
    var o = opts || {};
    var lockWeeks = (o.lockWeeks === undefined || o.lockWeeks === null) ? 0 : o.lockWeeks;
    assertWholeCount(lockWeeks, 'ロック期間');
    assertWholeCount(o.elapsedWeeks, '経過週数');
    assertNotNegative(o.principal, '元本');
    assertNotNegative(o.annualRatePct, '金利');
    var digits = (o.currencyDigits === undefined || o.currencyDigits === null) ? 0 : o.currencyDigits;
    var matured = o.elapsedWeeks >= lockWeeks;
    var remainingWeeks = Math.max(0, lockWeeks - o.elapsedWeeks);
    if (!matured) {
      return {
        principal: roundAmount(o.principal, digits),
        interest: 0,
        balance: roundAmount(o.principal, digits),
        matured: false,
        earlyCancellation: true,
        elapsedWeeks: o.elapsedWeeks,
        lockWeeks: lockWeeks,
        remainingWeeks: remainingWeeks,
        speedMultiplier: INTEREST_SPEED_MULTIPLIER
      };
    }
    var accrued = accrueWeeklyInterest(o.principal, o.annualRatePct, o.elapsedWeeks, digits);
    return {
      principal: accrued.principal,
      interest: accrued.interest,
      balance: accrued.balance,
      matured: true,
      earlyCancellation: false,
      elapsedWeeks: o.elapsedWeeks,
      lockWeeks: lockWeeks,
      remainingWeeks: 0,
      speedMultiplier: INTEREST_SPEED_MULTIPLIER
    };
  }

  /**
   * 外貨預金(BD)の評価。この機能の目的は
   * 「金利で増えても為替で負けることがある」を体験させること。
   * したがって利息分と為替分を必ず分解して返す。
   * 内訳は interestGainBP + fxGainLossBP === netGainLossBP を常に満たす。
   */
  function calculateFxDeposit(opts) {
    var o = opts || {};
    assertNotNegative(o.principalBP, '元本');
    assertPositive(o.entryRateBPPerBD, '預入時のレート');
    assertPositive(o.exitRateBPPerBD, '評価時のレート');
    assertNotNegative(o.annualRatePct, '金利');
    assertWholeCount(o.elapsedWeeks, '経過週数');

    var initialBD = roundAmount(o.principalBP / o.entryRateBPPerBD, 1);
    var accrued = accrueWeeklyInterest(initialBD, o.annualRatePct, o.elapsedWeeks, 1);
    var finalBD = accrued.balance;
    var finalBP = roundAmount(finalBD * o.exitRateBPPerBD, 0);

    /* 利息は「預入時のレートで評価した増加分」として切り出す。
     * 残りをすべて為替の影響とすることで、内訳の合計が必ず実額に一致する。 */
    var interestGainBP = roundAmount(accrued.interest * o.entryRateBPPerBD, 0);
    var netGainLossBP = roundAmount(finalBP - o.principalBP, 0);
    var fxGainLossBP = roundAmount(netGainLossBP - interestGainBP, 0);

    return {
      principalBP: roundAmount(o.principalBP, 0),
      initialBD: initialBD,
      interestBD: accrued.interest,
      finalBD: finalBD,
      finalBP: finalBP,
      interestGainBP: interestGainBP,
      fxGainLossBP: fxGainLossBP,
      netGainLossBP: netGainLossBP,
      outcome: netGainLossBP > 0 ? 'gain' : (netGainLossBP < 0 ? 'loss' : 'even'),
      entryRateBPPerBD: o.entryRateBPPerBD,
      exitRateBPPerBD: o.exitRateBPPerBD,
      elapsedWeeks: o.elapsedWeeks,
      speedMultiplier: INTEREST_SPEED_MULTIPLIER
    };
  }

  /** 信用スコアの区分。700以上=手数料半額 / 300未満=分割払い停止。 */
  function creditScoreStatus(score) {
    assertNumber(score, '信用スコア');
    if (score >= 700) {
      return { id: 'preferred', label: '優遇', feeMultiplier: 0.5, installmentsAllowed: true };
    }
    if (score >= 300) {
      return { id: 'standard', label: '標準', feeMultiplier: 1, installmentsAllowed: true };
    }
    return { id: 'blocked', label: '利用停止', feeMultiplier: 1, installmentsAllowed: false };
  }

  /**
   * 分割払い1プランの計算。
   * 端数は最終回で調整し、支払い予定の合計が総額と必ず一致するようにする。
   */
  function calculateInstallmentPlan(principalBP, installments, creditScore) {
    assertNotNegative(principalBP, '価格');
    assertNumber(installments, '分割回数');
    if (!Object.prototype.hasOwnProperty.call(INSTALLMENT_FEE_RATES, installments)) {
      throw new RangeError('分割回数は ' + INSTALLMENT_OPTIONS.join('・') + ' のいずれかです');
    }
    var score = (creditScore === undefined || creditScore === null) ? INITIAL_CREDIT_SCORE : creditScore;
    var status = creditScoreStatus(score);

    /* 一括払いは借入ではないので、信用スコアでは止めない。 */
    if (installments > 1 && !status.installmentsAllowed) {
      return {
        installments: installments,
        available: false,
        reason: 'credit-score-below-300',
        principalBP: roundAmount(principalBP, 0),
        feeBP: null,
        totalBP: null,
        paymentBP: null,
        extraCostBP: null,
        paymentSchedule: [],
        feeMultiplier: status.feeMultiplier,
        creditScore: score,
        status: status
      };
    }

    var feeMultiplier = installments > 1 ? status.feeMultiplier : 1;
    var feeBP = roundAmount(principalBP * INSTALLMENT_FEE_RATES[installments] * feeMultiplier, 0);
    var totalBP = roundAmount(principalBP + feeBP, 0);
    var paymentBP = roundAmount(totalBP / installments, 0);
    var schedule = [];
    for (var i = 0; i < installments - 1; i++) schedule.push(paymentBP);
    schedule.push(roundAmount(totalBP - paymentBP * (installments - 1), 0));

    return {
      installments: installments,
      available: true,
      reason: null,
      principalBP: roundAmount(principalBP, 0),
      feeBP: feeBP,
      totalBP: totalBP,
      paymentBP: paymentBP,
      extraCostBP: feeBP,
      paymentSchedule: schedule,
      feeMultiplier: feeMultiplier,
      creditScore: score,
      status: status
    };
  }

  /** 一括・3回・6回・12回を並べて比較する(この画面を見せること自体が教育)。 */
  function compareInstallmentPlans(principalBP, creditScore) {
    return INSTALLMENT_OPTIONS.map(function (n) {
      return calculateInstallmentPlan(principalBP, n, creditScore);
    });
  }

  /**
   * 信用スコアに出来事を反映する。
   * events は 'payment' | 'payoff' | 'late' の文字列、
   * または {type, count} の形で回数をまとめて指定できる。
   */
  function applyCreditEvents(currentScore, events) {
    assertNumber(currentScore, '信用スコア');
    if (!Array.isArray(events)) throw new TypeError('出来事は配列で指定してください');
    var score = currentScore;
    var history = [];
    events.forEach(function (ev) {
      var type, count;
      if (typeof ev === 'string') {
        type = ev;
        count = 1;
      } else if (ev && typeof ev === 'object') {
        type = ev.type;
        count = (ev.count === undefined || ev.count === null) ? 1 : ev.count;
      } else {
        throw new RangeError('出来事の形式が不正です');
      }
      if (!Object.prototype.hasOwnProperty.call(CREDIT_EVENT_DELTAS, type)) {
        throw new RangeError('未知の出来事です: ' + type);
      }
      assertNumber(count, '回数');
      if (count < 1 || Math.floor(count) !== count) {
        throw new RangeError('回数は1以上の整数で指定してください');
      }
      var delta = CREDIT_EVENT_DELTAS[type] * count;
      score = Math.min(MAX_CREDIT_SCORE, Math.max(0, score + delta));
      history.push({ type: type, count: count, delta: delta, score: score });
    });
    return {
      score: score,
      delta: score - currentScore,
      history: history,
      status: creditScoreStatus(score)
    };
  }

  /* ---------- GT(ゴールドチケット)とPayPay交換 ---------- */

  var GT_BASE_YEN = 100;              // 基準: 1 GT = 100円 (H-5)
  var GT_FX_BAND = 0.2;               // 為替による変動は ±20% まで
  var FX_BASE_RATE = 150;             // 基準の為替(1ドル150円)
  var PAYPAY_MONTHLY_CAP_YEN = 2000;  // 月間上限。円建てで固定 (H-6)

  /* GTはBPでは絶対に買えない。マイルストーンでのみ発行される。 */
  var GT_MILESTONES = {
    weeklyGoal: 1,          // 週の学習目標を達成
    monthlyGoal: 3,         // 月の学習目標を達成
    unitMastered: 2,        // 単元を完全制覇
    mockExamImproved: 5,    // 模試で前回より点数UP
    allSubjectsMonth: 5,    // 全受験科目を1ヶ月継続
    gradeUp: 10,            // 志望校の判定がUP
    weekendSummary: 1,      // 週末のまとめを提出
    weekendSummary4x: 3     // 週末のまとめ4週連続
  };

  /**
   * 1 GT が何円になるかを求める。
   * 為替が動くのは「1枚あたりの価値」であって、月間上限(円)は動かない。
   * 円安ほど1枚の価値が上がり、少ない枚数で満額に届く。
   */
  function gtToYen(opts) {
    var o = opts || {};
    var baseRate = (o.baseFxRate === undefined || o.baseFxRate === null) ? FX_BASE_RATE : o.baseFxRate;
    assertPositive(baseRate, '基準レート');
    assertPositive(o.fxRate, '為替レート');
    var rawRatio = o.fxRate / baseRate;
    var ratio = Math.min(1 + GT_FX_BAND, Math.max(1 - GT_FX_BAND, rawRatio));
    var yenPerGT = roundAmount(GT_BASE_YEN * ratio, 0);
    var gtAmount = (o.gtAmount === undefined || o.gtAmount === null) ? 0 : o.gtAmount;
    assertWholeCount(gtAmount, 'GT枚数');
    return {
      yenPerGT: yenPerGT,
      gtAmount: gtAmount,
      totalYen: yenPerGT * gtAmount,
      fxRatio: roundAmount(ratio, 4),
      bandCapped: rawRatio !== ratio,
      trend: yenPerGT > GT_BASE_YEN ? 'weak-yen' : (yenPerGT < GT_BASE_YEN ? 'strong-yen' : 'neutral')
    };
  }

  /**
   * PayPay交換の申請内容を計算する。
   * 月間上限は円建てで固定。為替がどう動いても親の支出は上限を1円も超えない。
   * したがって枚数は必ず切り捨てる(端数分は翌月に持ち越さず、GTとして手元に残る)。
   */
  function calcPayPayRequest(opts) {
    var o = opts || {};
    var availableGT = (o.availableGT === undefined || o.availableGT === null) ? 0 : o.availableGT;
    assertWholeCount(availableGT, '保有GT');
    var usedYen = (o.usedYenThisMonth === undefined || o.usedYenThisMonth === null) ? 0 : o.usedYenThisMonth;
    assertNotNegative(usedYen, '今月の交換済み金額');
    var capYen = (o.monthlyCapYen === undefined || o.monthlyCapYen === null) ? PAYPAY_MONTHLY_CAP_YEN : o.monthlyCapYen;
    assertNotNegative(capYen, '月間上限');

    var rate = gtToYen({ fxRate: o.fxRate, baseFxRate: o.baseFxRate, gtAmount: 0 });
    var remainingCapYen = Math.max(0, capYen - usedYen);
    var affordableGT = Math.floor(remainingCapYen / rate.yenPerGT);
    var redeemableGT = Math.min(availableGT, affordableGT);
    var payoutYen = redeemableGT * rate.yenPerGT;

    return {
      yenPerGT: rate.yenPerGT,
      trend: rate.trend,
      availableGT: availableGT,
      redeemableGT: redeemableGT,
      leftoverGT: availableGT - redeemableGT,
      payoutYen: payoutYen,
      monthlyCapYen: capYen,
      usedYenThisMonth: usedYen,
      remainingCapYen: remainingCapYen - payoutYen,
      capReached: redeemableGT < availableGT,
      /* 円高のときは「待つ」判断が得になる。それを画面で伝えるための材料。 */
      advice: rate.trend === 'strong-yen' ? 'wait-recommended' : 'ok'
    };
  }

  /* ==================================================================
   * 装備とショップ (ver.4)
   * 仕様: docs/design/FEATURE_SPEC_v4.md B章 / 決定事項 H-4
   * ================================================================== */

  /* 👕 衣装。スロット1。買い集めても同時装備は1個だけ。 */
  var COSTUME_ITEMS = [
    { id: 'socks', name: '白いソックス', bonus: 0.1, price: 500 },
    { id: 'gloves', name: 'スパンコールのグローブ', bonus: 0.2, price: 1500 },
    { id: 'fedora', name: 'フェドーラハット', bonus: 0.3, price: 3000 },
    { id: 'belt', name: 'ゴールドベルト', bonus: 0.4, price: 6000 },
    { id: 'jacket', name: 'ライトアップジャケット', bonus: 0.5, price: 12000 }
  ];

  /* 💫 スキル。スロット2。学習パターンに応じた条件付きボーナス
   * (rhythm_keep のみ例外で、倍率ではなく連続日数ボーナスBPを2倍にする)。 */
  var SKILL_ITEMS = [
    { id: 'rhythm_keep', name: 'リズムキープ', desc: '連続日数ボーナスが2倍', bonus: 0, price: 2000 },
    { id: 'moonwalk', name: 'ムーンウォーク', desc: '最も遅れている科目のポイント +0.5倍', bonus: 0.5, price: 4000 },
    { id: 'spin_turn', name: 'スピンターン', desc: '1日に3科目以上やると +0.3倍', bonus: 0.3, price: 5000 },
    { id: 'zero_gravity', name: 'ゼロ・グラビティ', desc: '90分以上連続学習で +0.5倍', bonus: 0.5, price: 8000 },
    { id: 'anti_gravity_lean', name: 'アンチグラビティ・リーン', desc: '早朝(6〜8時)の学習 +1.0倍', bonus: 1.0, price: 10000 }
  ];

  /* 🎤 ステージ。スロット3。ストリートは初期装備・無料。 */
  var STAGE_ITEMS = [
    { id: 'street', name: 'ストリート', bonus: 0, price: 0 },
    { id: 'live_house', name: 'ライブハウス', bonus: 0.2, price: 3000 },
    { id: 'budokan', name: '武道館', bonus: 0.4, price: 10000 },
    { id: 'dome_tour', name: 'ドームツアー', bonus: 0.6, price: 25000 },
    { id: 'world_stage', name: 'ワールドステージ', bonus: 1.0, price: 50000 }
  ];

  /* ⚡ 消費アイテム。kind: 'timed'=分単位の期限 / 'day'=その日いっぱい /
   * 'fever'=10倍(週1回まで) / 'streak-guard'=連続記録の保険 */
  var CONSUMABLE_ITEMS = [
    { id: 'energy_drink', name: 'エナジードリンク', desc: '60分間 +1.0倍', price: 300, kind: 'timed', durationMin: 60, bonus: 1.0 },
    { id: 'spotlight', name: 'スポットライト', desc: 'その日1日 +0.5倍', price: 800, kind: 'day', bonus: 0.5 },
    { id: 'fever_time', name: 'フィーバータイム', desc: '30分間10倍(週1回まで)', price: 3000, kind: 'fever', durationMin: 30 },
    { id: 'recovery', name: 'リカバリー', desc: '連続記録を1日だけ守る(体調不良の日の保険)', price: 1000, kind: 'streak-guard' }
  ];

  function findById(list, id) {
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }
  function costumeById(id) { return findById(COSTUME_ITEMS, id); }
  function skillById(id) { return findById(SKILL_ITEMS, id); }
  function stageById(id) { return findById(STAGE_ITEMS, id); }
  function consumableById(id) { return findById(CONSUMABLE_ITEMS, id); }

  /** カテゴリを問わずアイテムIDから {item, category} を探す。 */
  function shopItemById(id) {
    var c = costumeById(id); if (c) return { item: c, category: 'costume' };
    var s = skillById(id); if (s) return { item: s, category: 'skill' };
    var g = stageById(id); if (g) return { item: g, category: 'stage' };
    var m = consumableById(id); if (m) return { item: m, category: 'consumable' };
    return null;
  }

  function defaultShopState() {
    return {
      owned: { costume: [], skill: [], stage: ['street'], consumable: {} },
      used: { consumable: {} },
      equipped: { costume: null, skill: null, stage: 'street' },
      activeBoosts: [],        // {id, itemId, kind, expiresAt(ms)}
      feverLastUsedDate: null, // 週1回制限の判定に使う日付文字列
      streakGuardDates: []     // リカバリーを使って連続記録を守った日付
    };
  }

  /* 安全装置(FEATURE_SPEC_v4.md「受験直前の集中モード」): 受験日の30日前になったら
   * 装備・ショップ・消費アイテムを自動でOFFにし、シンプルな学習記録に戻す。 */
  var FOCUS_MODE_DAYS_BEFORE_EXAM = 30;

  /** 集中モード(受験直前で装備・ショップを止める期間)かどうか。 */
  function isFocusModeActive(examDate, todayStr_) {
    if (!isDateStr(examDate) || !isDateStr(todayStr_)) return false;
    var dd = diffDays(todayStr_, examDate);
    return dd >= 0 && dd <= FOCUS_MODE_DAYS_BEFORE_EXAM;
  }

  /** 所持している消費アイテムのうち、まだ使っていない残数。 */
  function consumableAvailable(shop, itemId) {
    var owned = (shop.owned.consumable && shop.owned.consumable[itemId]) || 0;
    var used = (shop.used.consumable && shop.used.consumable[itemId]) || 0;
    return Math.max(0, owned - used);
  }

  /**
   * 購入できるか検証する(実際の残高減算・所持追加はapp.js側で行う)。
   * 衣装・スキル・ステージは同じアイテムを二重購入できない。消費アイテムは何個でも買える。
   */
  function validatePurchase(shop, itemId, balanceBP) {
    var found = shopItemById(itemId);
    if (!found) return { ok: false, errors: ['不明なアイテムです'] };
    assertNotNegative(balanceBP, 'BP残高');
    if (found.category !== 'consumable') {
      var owned = shop.owned[found.category] || [];
      if (owned.indexOf(itemId) !== -1) return { ok: false, errors: ['すでに所持しています'] };
    }
    if (balanceBP < found.item.price) return { ok: false, errors: ['BPが足りません'] };
    return { ok: true, errors: [], item: found.item, category: found.category };
  }

  /** 装備できるか検証する(所持していないものは装備できない)。 */
  function validateEquip(shop, category, itemId) {
    if (category !== 'costume' && category !== 'skill' && category !== 'stage') {
      return { ok: false, errors: ['不明なスロットです'] };
    }
    if (itemId !== null) {
      var owned = shop.owned[category] || [];
      if (owned.indexOf(itemId) === -1) return { ok: false, errors: ['そのアイテムは所持していません'] };
    } else if (category === 'stage') {
      return { ok: false, errors: ['ステージは未装備にできません'] };
    }
    return { ok: true, errors: [] };
  }

  /** その週の月曜日(YYYY-MM-DD)を求める。フィーバーの週1回制限に使う。 */
  function weekStartStr(dateStr) {
    var d = parseDate(dateStr);
    var day = d.getDay(); // 0=日 .. 6=土
    var diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return toDateStr(d);
  }

  /** フィーバータイムを今週まだ使っていないか。 */
  function canUseFever(feverLastUsedDate, todayStr_) {
    if (!feverLastUsedDate) return true;
    return weekStartStr(feverLastUsedDate) !== weekStartStr(todayStr_);
  }

  /**
   * 学習記録・ニュースに蓄積されたBPから現在の残高を求める(購入分は差し引く)。
   * 残高は保存済みのbpフィールドから毎回導出するため、購入・削除と矛盾しない。
   */
  function calcBpBalance(state) {
    var earned = 0;
    activeRecords(state.records).forEach(function (r) { earned += (r.bp | 0); });
    (state.news || []).forEach(function (n) { earned += (n.bp | 0); });
    var spent = 0;
    var shop = state.shop || defaultShopState();
    (shop.owned.costume || []).forEach(function (id) { var it = costumeById(id); if (it) spent += it.price; });
    (shop.owned.skill || []).forEach(function (id) { var it = skillById(id); if (it) spent += it.price; });
    (shop.owned.stage || []).forEach(function (id) { var it = stageById(id); if (it) spent += it.price; });
    var cons = shop.owned.consumable || {};
    Object.keys(cons).forEach(function (id) {
      var it = consumableById(id);
      if (it) spent += it.price * (cons[id] | 0);
    });
    return Math.max(0, earned - spent);
  }

  /* ---------- 生活習慣・コンディション ---------- */

  var HABIT_KEYS = Object.keys(HABIT_BP);

  /** 1日分の生活習慣フラグからその日のコンディションBPを求める。 */
  function calcHabitBP(habitFlags) {
    var h = habitFlags || {};
    var total = 0;
    HABIT_KEYS.forEach(function (k) { if (h[k]) total += HABIT_BP[k]; });
    return total;
  }

  /* ---------- スキルの発動条件 ---------- */

  /**
   * 装備中のスキルが、その学習記録の状況(ctx)で発動するか判定し、倍率加算を返す。
   * rhythm_keep は倍率ではなく行動ボーナスBPを2倍にするため、ここでは常に0を返す
   * (呼び出し側が別途、連続日数ボーナスの扱いを変える)。
   */
  function evaluateSkillBonus(skillId, ctx) {
    var skill = skillById(skillId);
    if (!skill) return 0;
    var c = ctx || {};
    switch (skillId) {
      case 'moonwalk': return c.isLaggingSubject ? skill.bonus : 0;
      case 'spin_turn': return (c.distinctSubjectsToday || 0) >= 3 ? skill.bonus : 0;
      case 'zero_gravity': return (c.actualMin || 0) >= 90 ? skill.bonus : 0;
      case 'anti_gravity_lean': return (c.hour !== undefined && c.hour >= 6 && c.hour < 8) ? skill.bonus : 0;
      default: return 0;
    }
  }

  /** 記録済み時間が最も少ない科目のIDを返す(ムーンウォークの判定に使う)。 */
  function laggingSubjectId(records, subjects) {
    var totals = {};
    (subjects || []).forEach(function (s) { totals[s.id] = 0; });
    activeRecords(records).forEach(function (r) {
      if (Object.prototype.hasOwnProperty.call(totals, r.subjectId)) totals[r.subjectId] += r.actualMin;
    });
    var minId = null, minVal = Infinity;
    (subjects || []).forEach(function (s) {
      if (totals[s.id] < minVal) { minVal = totals[s.id]; minId = s.id; }
    });
    return minId;
  }

  /** 旧パイロット版(ibuki_beat_state)からの移行 */
  function migrateOldPilot(oldParsed, subjects) {
    if (!oldParsed || !Array.isArray(oldParsed.sessionLog)) return [];
    var byName = {};
    (subjects || DEFAULT_SUBJECTS).forEach(function (s) { byName[s.name] = s.id; });
    var out = [];
    oldParsed.sessionLog.forEach(function (l, i) {
      if (!l || l.type !== 'study') return;
      var date = parseJaDate(l.date);
      var mins = (typeof l.mins === 'number' && l.mins > 0 && l.mins <= MAX_MIN_PER_RECORD) ? Math.round(l.mins) : null;
      if (!date || !mins) return;
      out.push({
        id: 'old' + i,
        date: date,
        subjectId: byName[l.subject] || 'other',
        content: '(旧アプリからの移行)',
        kind: 'その他',
        planMin: 0,
        actualMin: mins,
        score: null, maxScore: null,
        reflection: '', createdAt: 0, updatedAt: 0, deletedAt: null
      });
    });
    return out;
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    MAX_MIN_PER_RECORD: MAX_MIN_PER_RECORD,
    DEFAULT_SUBJECTS: DEFAULT_SUBJECTS,
    STUDY_KINDS: STUDY_KINDS,
    SUBJECT_STUDY_KINDS: SUBJECT_STUDY_KINDS,
    ALL_STUDY_KINDS: ALL_STUDY_KINDS,
    TEST_KIND: TEST_KIND,
    studyKindsFor: studyKindsFor,
    defaultStudyKindFor: defaultStudyKindFor,
    isValidStudyKind: isValidStudyKind,
    AI_APPS: AI_APPS,
    aiAppById: aiAppById,
    pad2: pad2,
    toDateStr: toDateStr,
    isDateStr: isDateStr,
    parseDate: parseDate,
    addDays: addDays,
    diffDays: diffDays,
    parseJaDate: parseJaDate,
    validateRecord: validateRecord,
    validateEvent: validateEvent,
    validateNewsEntry: validateNewsEntry,
    defaultFaculties: defaultFaculties,
    FACULTY_IDS: FACULTY_IDS,
    activeRecords: activeRecords,
    buildSeries: buildSeries,
    summarize: summarize,
    streakDays: streakDays,
    niceMax: niceMax,
    fmtMin: fmtMin,
    fmtDuration: fmtDuration,
    defaultState: defaultState,
    sanitizeState: sanitizeState,
    migrateOldPilot: migrateOldPilot,
    /* --- ポイント獲得 (ver.4) --- */
    BP_PER_MINUTE: BP_PER_MINUTE,
    DAILY_BP_CAP: DAILY_BP_CAP,
    NON_EXAM_DAILY_BP_CAP: NON_EXAM_DAILY_BP_CAP,
    ACTION_BONUS_BP: ACTION_BONUS_BP,
    HABIT_BP: HABIT_BP,
    MULTIPLIER_LIMITS: MULTIPLIER_LIMITS,
    MULTIPLIER_CAP: MULTIPLIER_CAP,
    FEVER_MULTIPLIER: FEVER_MULTIPLIER,
    conditionBonusFromHabits: conditionBonusFromHabits,
    composeMultiplier: composeMultiplier,
    isPlanAchieved: isPlanAchieved,
    calcActionBonusBP: calcActionBonusBP,
    calcStudyBP: calcStudyBP,
    /* --- APP-440: 時間の分離とBPの決定的な再計算 --- */
    MS_PER_MINUTE: MS_PER_MINUTE,
    PLAN_ACHIEVED_MIN_ACTUAL_MIN: PLAN_ACHIEVED_MIN_ACTUAL_MIN,
    DAILY_ONCE_ACTIONS: DAILY_ONCE_ACTIONS,
    bpOrder: bpOrder,
    normalizeSegments: normalizeSegments,
    segmentsOverlapMs: segmentsOverlapMs,
    applyTimedBoost: applyTimedBoost,
    resolveBpMinutes: resolveBpMinutes,
    resolveDailyActionBonuses: resolveDailyActionBonuses,
    recalcDayBP: recalcDayBP,
    /* --- 時事ニュース (ver.4) --- */
    NEWS_GENRES: NEWS_GENRES,
    NEWS_DAILY_LIMIT: NEWS_DAILY_LIMIT,
    NEWS_ALL_GENRES_BONUS_BP: NEWS_ALL_GENRES_BONUS_BP,
    newsGenreById: newsGenreById,
    calcNewsBP: calcNewsBP,
    calcAllGenresBonus: calcAllGenresBonus,
    /* --- GT / PayPay (ver.4) --- */
    GT_BASE_YEN: GT_BASE_YEN,
    GT_FX_BAND: GT_FX_BAND,
    FX_BASE_RATE: FX_BASE_RATE,
    PAYPAY_MONTHLY_CAP_YEN: PAYPAY_MONTHLY_CAP_YEN,
    GT_MILESTONES: GT_MILESTONES,
    gtToYen: gtToYen,
    calcPayPayRequest: calcPayPayRequest,
    /* --- 金融シミュレーション (ver.4) --- */
    INTEREST_SPEED_MULTIPLIER: INTEREST_SPEED_MULTIPLIER,
    DEPOSIT_LOCK_WEEKS: DEPOSIT_LOCK_WEEKS,
    INSTALLMENT_FEE_RATES: INSTALLMENT_FEE_RATES,
    INSTALLMENT_OPTIONS: INSTALLMENT_OPTIONS,
    INITIAL_CREDIT_SCORE: INITIAL_CREDIT_SCORE,
    CREDIT_EVENT_DELTAS: CREDIT_EVENT_DELTAS,
    roundAmount: roundAmount,
    accrueWeeklyInterest: accrueWeeklyInterest,
    calculateDeposit: calculateDeposit,
    calculateFxDeposit: calculateFxDeposit,
    creditScoreStatus: creditScoreStatus,
    calculateInstallmentPlan: calculateInstallmentPlan,
    compareInstallmentPlans: compareInstallmentPlans,
    applyCreditEvents: applyCreditEvents,
    /* --- 装備・ショップ (ver.4) --- */
    COSTUME_ITEMS: COSTUME_ITEMS,
    SKILL_ITEMS: SKILL_ITEMS,
    STAGE_ITEMS: STAGE_ITEMS,
    CONSUMABLE_ITEMS: CONSUMABLE_ITEMS,
    costumeById: costumeById,
    skillById: skillById,
    stageById: stageById,
    consumableById: consumableById,
    shopItemById: shopItemById,
    defaultShopState: defaultShopState,
    consumableAvailable: consumableAvailable,
    validatePurchase: validatePurchase,
    validateEquip: validateEquip,
    weekStartStr: weekStartStr,
    canUseFever: canUseFever,
    calcBpBalance: calcBpBalance,
    HABIT_KEYS: HABIT_KEYS,
    calcHabitBP: calcHabitBP,
    evaluateSkillBonus: evaluateSkillBonus,
    laggingSubjectId: laggingSubjectId,
    FOCUS_MODE_DAYS_BEFORE_EXAM: FOCUS_MODE_DAYS_BEFORE_EXAM,
    isFocusModeActive: isFocusModeActive
  };
});
