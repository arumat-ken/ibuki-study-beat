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
    { id: 'eng', name: '英語', color: '#4A90D9', visible: true },
    { id: 'math', name: '数学', color: '#58B368', visible: true },
    { id: 'jpn', name: '国語', color: '#F5A623', visible: true },
    { id: 'sci', name: '理科', color: '#9B59B6', visible: true },
    { id: 'soc', name: '社会', color: '#E8604C', visible: true },
    { id: 'other', name: 'その他', color: '#9AA0A6', visible: true }
  ];

  var STUDY_KINDS = ['暗記', '演習', '読解', '講義', '復習', 'テスト', 'その他'];

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
    if (rec.kind !== undefined && rec.kind !== '' && STUDY_KINDS.indexOf(rec.kind) === -1) errors.push('学習種別が不正です');
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

  /** 連続記録日数(今日または昨日を終端とした実績>0の連続日数) */
  function streakDays(records, todayStr_) {
    var recs = activeRecords(records).filter(function (r) { return r.actualMin > 0; });
    var dates = {};
    recs.forEach(function (r) { dates[r.date] = true; });
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
        subjects: DEFAULT_SUBJECTS.map(function (s) { return { id: s.id, name: s.name, color: s.color, visible: s.visible }; })
      },
      records: [],
      events: [],
      coach: {
        members: [{ id: 'beat', label: 'BEATスター' }],
        messages: []
      },
      activeSession: null,
      poseUnlocks: [],
      seq: 1
    };
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
          visible: x.visible !== false
        };
      });
      if (subs.length > 0) out.settings.subjects = subs;
    }
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
          kind: STUDY_KINDS.indexOf(r.kind) !== -1 ? r.kind : 'その他',
          planMin: r.planMin | 0,
          actualMin: r.actualMin | 0,
          score: isIntInRange(r.score, 0, 10000) ? r.score : null,
          maxScore: isIntInRange(r.maxScore, 1, 10000) ? r.maxScore : null,
          reflection: typeof r.reflection === 'string' ? r.reflection.slice(0, 300) : '',
          createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
          updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
          deletedAt: typeof r.deletedAt === 'number' ? r.deletedAt : null
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
    if (typeof parsed.createdAt === 'string') out.createdAt = parsed.createdAt;
    out.seq = isIntInRange(parsed.seq, 1, 1e9) ? parsed.seq : (out.records.length + out.events.length + 10);
    return out;
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
    applyCreditEvents: applyCreditEvents
  };
});
