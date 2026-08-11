import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const C = require('../../js/calc.js');

const SUBJECTS = C.DEFAULT_SUBJECTS;

function rec(over) {
  return Object.assign({
    id: 'r1', date: '2026-08-01', subjectId: 'eng', content: '英単語 20語',
    kind: '暗記', planMin: 30, actualMin: 28, reflection: '', deletedAt: null
  }, over);
}

test('日付ユーティリティ', () => {
  assert.equal(C.addDays('2026-08-01', 6), '2026-08-07');
  assert.equal(C.addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(C.diffDays('2026-08-01', '2026-08-08'), 7);
  assert.ok(C.isDateStr('2026-02-28'));
  assert.ok(!C.isDateStr('2026-02-30'));
  assert.ok(!C.isDateStr('2026-8-1'));
  assert.equal(C.parseJaDate('2025/8/4'), '2025-08-04');
});

test('受け入れ1: 計画30分・実績28分の記録が有効', () => {
  const v = C.validateRecord(rec(), SUBJECTS);
  assert.ok(v.ok, v.errors.join());
});

test('受け入れ2: 7日連続30分 → 累積計画210分', () => {
  const records = [];
  for (let i = 0; i < 7; i++) {
    records.push(rec({ id: 'r' + i, date: C.addDays('2026-08-01', i), planMin: 30, actualMin: 25 + i }));
  }
  const series = C.buildSeries(records, '2026-08-01', 7);
  assert.equal(series.length, 7);
  assert.equal(series[6].cumPlan, 210);
  assert.equal(series[6].cumActual, 25 + 26 + 27 + 28 + 29 + 30 + 31);
  assert.equal(series[0].plan.eng, 30);
  assert.equal(series[0].actual.eng, 25);
  const sum = C.summarize(series);
  assert.equal(sum.planTotal, 210);
  assert.equal(sum.cumPlan, 210);
});

test('受け入れ3: 同日複数科目は科目別に積み上げ', () => {
  const records = [
    rec({ id: 'a', subjectId: 'eng', planMin: 30, actualMin: 30 }),
    rec({ id: 'b', subjectId: 'jpn', planMin: 40, actualMin: 20, content: '現代文' }),
    rec({ id: 'c', subjectId: 'soc', planMin: 50, actualMin: 60, content: '世界史' }),
    rec({ id: 'd', subjectId: 'eng', planMin: 10, actualMin: 5, content: '文法' })
  ];
  const series = C.buildSeries(records, '2026-08-01', 1);
  const b = series[0];
  assert.equal(b.plan.eng, 40);       // 同一科目は合算
  assert.equal(b.plan.jpn, 40);
  assert.equal(b.plan.soc, 50);
  assert.equal(b.planTotal, 130);
  assert.equal(b.actual.eng, 35);
  assert.equal(b.actualTotal, 115);
});

test('受け入れ4: 誤入力は拒否される', () => {
  assert.ok(!C.validateRecord(rec({ actualMin: 1200 }), SUBJECTS).ok, '実績1200分は拒否');
  assert.ok(!C.validateRecord(rec({ kind: 'テスト', score: 120, maxScore: 100 }), SUBJECTS).ok, '120/100点は拒否');
  assert.ok(!C.validateRecord(rec({ content: '   ' }), SUBJECTS).ok, '空内容は拒否');
  assert.ok(!C.validateRecord(rec({ planMin: 0, actualMin: 0 }), SUBJECTS).ok, '計画も実績も0は拒否');
  assert.ok(!C.validateRecord(rec({ subjectId: 'nope' }), SUBJECTS).ok, '未知の科目は拒否');
  assert.ok(!C.validateRecord(rec({ date: '2026-13-01' }), SUBJECTS).ok, '不正な日付は拒否');
  assert.ok(C.validateRecord(rec({ kind: 'テスト', score: 80, maxScore: 100 }), SUBJECTS).ok, '80/100点は有効');
});

test('受け入れ5: 削除済み(ごみ箱)の記録は集計から除外', () => {
  const records = [
    rec({ id: 'a', actualMin: 30 }),
    rec({ id: 'b', actualMin: 40, deletedAt: 123456 })
  ];
  const series = C.buildSeries(records, '2026-08-01', 1);
  assert.equal(series[0].actualTotal, 30);
  assert.equal(C.activeRecords(records).length, 1);
});

test('イベント検証', () => {
  assert.ok(C.validateEvent({ date: '2026-10-15', title: '近畿大学 公募推薦', url: 'https://www.kindai.ac.jp/' }).ok);
  assert.ok(!C.validateEvent({ date: '2026-10-15', title: '' }).ok);
  assert.ok(!C.validateEvent({ date: '2026-10-15', title: 'x', url: 'javascript:alert(1)' }).ok);
});

test('連続日数(ストリーク)', () => {
  const records = [];
  for (let i = 1; i <= 5; i++) records.push(rec({ id: 's' + i, date: C.addDays('2026-08-10', -i), actualMin: 10 }));
  assert.equal(C.streakDays(records, '2026-08-10'), 5, '昨日まで5日連続');
  records.push(rec({ id: 's0', date: '2026-08-10', actualMin: 10 }));
  assert.equal(C.streakDays(records, '2026-08-10'), 6, '今日を含め6日連続');
  assert.equal(C.streakDays([], '2026-08-10'), 0);
});

test('軸の最大値の丸め', () => {
  assert.equal(C.niceMax(0, 'hours'), 60);
  assert.equal(C.niceMax(70, 'hours'), 120);       // 70分 → 2時間
  assert.equal(C.niceMax(19 * 60, 'hours'), 20 * 60);
  assert.equal(C.niceMax(25, 'minutes'), 30);
  assert.equal(C.niceMax(130, 'minutes'), 180);
});

test('sanitizeState: 正常な状態は保持される', () => {
  const st = C.defaultState('2026-08-01');
  st.records.push(rec());
  st.events.push({ id: 'e1', date: '2026-10-15', title: '近畿大学', faculty: '経営学部', method: '公募推薦', url: 'https://www.kindai.ac.jp/', memo: '' });
  const out = C.sanitizeState(JSON.parse(JSON.stringify(st)), '2026-08-01');
  assert.ok(out);
  assert.equal(out.records.length, 1);
  assert.equal(out.records[0].actualMin, 28);
  assert.equal(out.events.length, 1);
  assert.equal(out.settings.subjects.length, 6);
});

test('sanitizeState: 破損データはnullを返し例外を出さない', () => {
  assert.equal(C.sanitizeState(null), null);
  assert.equal(C.sanitizeState('文字列'), null);
  assert.equal(C.sanitizeState({}), null);            // schemaVersionなし
  assert.equal(C.sanitizeState({ schemaVersion: 'x' }), null);
});

test('sanitizeState: 一部が壊れていても正常な記録は残す', () => {
  const st = C.defaultState('2026-08-01');
  st.records.push(rec());
  st.records.push({ garbage: true });
  st.records.push(rec({ id: 'bad', actualMin: 99999 }));
  st.settings.dailyGoalMin = -5;
  const out = C.sanitizeState(JSON.parse(JSON.stringify(st)), '2026-08-01');
  assert.ok(out);
  assert.equal(out.records.length, 1, '正常な1件のみ残る');
  assert.equal(out.settings.dailyGoalMin, 180, '不正な目標はデフォルトに戻る');
});

test('旧パイロット版からの移行', () => {
  const old = {
    sessionLog: [
      { type: 'study', subject: '英語', mins: 25, time: '10:00', date: '2025/8/4' },
      { type: 'break', subject: '英語', mins: 5, time: '10:25', date: '2025/8/4' },
      { type: 'study', subject: '謎科目', mins: 30, time: '11:00', date: '2025/8/4' },
      { type: 'study', subject: '数学', mins: 0, time: '12:00', date: '2025/8/4' }
    ]
  };
  const recs = C.migrateOldPilot(old, SUBJECTS);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].subjectId, 'eng');
  assert.equal(recs[0].date, '2025-08-04');
  assert.equal(recs[1].subjectId, 'other', '未知の科目はその他へ');
  assert.equal(C.migrateOldPilot(null, SUBJECTS).length, 0);
});

test('52倍速金利: アプリ1週で現実の年利1年分を付利する', () => {
  const oneWeek = C.accrueWeeklyInterest(5000, 0.2, 1, 0);
  assert.equal(oneWeek.interest, 10);
  assert.equal(oneWeek.balance, 5010);
  assert.equal(oneWeek.speedMultiplier, 52);

  const twoWeeks = C.accrueWeeklyInterest(5000, 0.2, 2, 0);
  assert.equal(twoWeeks.interest, 20, '週ごとに残高へ付利して複利にする');
  assert.equal(twoWeeks.balance, 5020);
});

test('52倍速金利: 定期預金は満期前の途中解約なら利息なし', () => {
  assert.equal(C.DEPOSIT_LOCK_WEEKS.fixed1Month, 4);
  assert.equal(C.DEPOSIT_LOCK_WEEKS.fixed3Months, 12);
  const early = C.calculateDeposit({
    principal: 10000,
    annualRatePct: 0.35,
    elapsedWeeks: 3,
    lockWeeks: 4,
    currencyDigits: 0
  });
  assert.equal(early.matured, false);
  assert.equal(early.earlyCancellation, true);
  assert.equal(early.interest, 0);
  assert.equal(early.balance, 10000);

  const matured = C.calculateDeposit({
    principal: 10000,
    annualRatePct: 0.35,
    elapsedWeeks: 4,
    lockWeeks: 4,
    currencyDigits: 0
  });
  assert.equal(matured.matured, true);
  assert.equal(matured.earlyCancellation, false);
  assert.equal(matured.interest, 140);
  assert.equal(matured.balance, 10140);

  const threeMonthEarly = C.calculateDeposit({
    principal: 10000,
    annualRatePct: 0.5,
    elapsedWeeks: 11,
    lockWeeks: C.DEPOSIT_LOCK_WEEKS.fixed3Months,
    currencyDigits: 0
  });
  assert.equal(threeMonthEarly.matured, false);
  assert.equal(threeMonthEarly.remainingWeeks, 1);
  assert.equal(threeMonthEarly.interest, 0);
});

test('外貨預金: 利息・為替差損益・合計を分解する', () => {
  const result = C.calculateFxDeposit({
    principalBP: 10000,
    entryRateBPPerBD: 150,
    exitRateBPPerBD: 140,
    annualRatePct: 4.5,
    elapsedWeeks: 1
  });
  assert.equal(result.initialBD, 66.7);
  assert.equal(result.interestBD, 3);
  assert.equal(result.finalBD, 69.7);
  assert.equal(result.finalBP, 9758);
  assert.equal(result.interestGainBP, 450);
  assert.equal(result.fxGainLossBP, -692);
  assert.equal(result.netGainLossBP, -242);
  assert.equal(result.interestGainBP + result.fxGainLossBP, result.netGainLossBP);
  assert.equal(result.outcome, 'loss');
});

test('外貨預金: 円安では為替差益、円高では為替差損になる', () => {
  const weakYen = C.calculateFxDeposit({
    principalBP: 10000,
    entryRateBPPerBD: 150,
    exitRateBPPerBD: 165,
    annualRatePct: 0,
    elapsedWeeks: 1
  });
  const strongYen = C.calculateFxDeposit({
    principalBP: 10000,
    entryRateBPPerBD: 150,
    exitRateBPPerBD: 135,
    annualRatePct: 0,
    elapsedWeeks: 1
  });
  assert.ok(weakYen.fxGainLossBP > 0);
  assert.ok(strongYen.fxGainLossBP < 0);
  assert.equal(weakYen.outcome, 'gain');
  assert.equal(strongYen.outcome, 'loss');
});

test('分割払い: 仕様例の一括・3回・6回・12回の総額を再現する', () => {
  const plans = C.compareInstallmentPlans(50000, 620);
  assert.deepEqual(plans.map(p => p.installments), [1, 3, 6, 12]);
  assert.deepEqual(plans.map(p => p.totalBP), [50000, 52500, 55000, 59000]);
  assert.deepEqual(plans.map(p => p.extraCostBP), [0, 2500, 5000, 9000]);
  assert.equal(plans[2].paymentBP, 9167);
  assert.equal(plans[3].paymentBP, 4917);
  assert.equal(plans[3].paymentSchedule.reduce((a, b) => a + b, 0), 59000);
});

test('分割払い: 700点以上は手数料半額、300点未満は利用停止', () => {
  const preferred = C.calculateInstallmentPlan(50000, 12, 700);
  assert.equal(preferred.available, true);
  assert.equal(preferred.feeBP, 4500);
  assert.equal(preferred.totalBP, 54500);
  assert.equal(preferred.feeMultiplier, 0.5);

  const blocked = C.calculateInstallmentPlan(50000, 3, 299);
  assert.equal(blocked.available, false);
  assert.equal(blocked.reason, 'credit-score-below-300');
  assert.equal(blocked.totalBP, null);

  const cash = C.calculateInstallmentPlan(50000, 1, 0);
  assert.equal(cash.available, true, '一括払いは信用スコアで停止しない');
});

test('信用スコア: 返済・完済・延滞を履歴付きで反映する', () => {
  assert.equal(C.INITIAL_CREDIT_SCORE, 500);
  const result = C.applyCreditEvents(C.INITIAL_CREDIT_SCORE, [
    'payment',
    { type: 'payment', count: 2 },
    'payoff',
    'late'
  ]);
  assert.equal(result.delta, 100);
  assert.equal(result.score, 600);
  assert.deepEqual(result.history.map(h => h.delta), [50, 100, 100, -150]);
  assert.equal(result.status.id, 'standard');
  assert.equal(result.status.installmentsAllowed, true);
});

test('信用スコア: 閾値700・300を正しく分類する', () => {
  assert.equal(C.creditScoreStatus(700).id, 'preferred');
  assert.equal(C.creditScoreStatus(700).feeMultiplier, 0.5);
  assert.equal(C.creditScoreStatus(300).id, 'standard');
  assert.equal(C.creditScoreStatus(300).installmentsAllowed, true);
  assert.equal(C.creditScoreStatus(299).id, 'blocked');
  assert.equal(C.creditScoreStatus(299).installmentsAllowed, false);
});

test('金融計算: 不正な数値・未対応の分割回数・未知イベントを拒否する', () => {
  assert.throws(() => C.accrueWeeklyInterest(-1, 0.2, 1, 0), RangeError);
  assert.throws(() => C.accrueWeeklyInterest(1000, -0.2, 1, 0), RangeError);
  assert.throws(() => C.calculateFxDeposit({
    principalBP: 10000,
    entryRateBPPerBD: 0,
    exitRateBPPerBD: 140,
    annualRatePct: 4.5,
    elapsedWeeks: 1
  }), RangeError);
  assert.throws(() => C.calculateInstallmentPlan(50000, 4, 500), RangeError);
  assert.throws(() => C.applyCreditEvents(500, ['unknown']), RangeError);
  assert.throws(() => C.applyCreditEvents(500, [null]), RangeError);
  assert.throws(() => C.roundAmount(Number.NaN, 0), TypeError);
});

test('倍率合成: 足し算で積み上がり、上限3.0倍で頭打ちになる', () => {
  const none = C.composeMultiplier({});
  assert.equal(none.multiplier, 1.0);
  assert.equal(none.capped, false);

  const mid = C.composeMultiplier({ costumeBonus: 0.3, skillBonus: 0.5, stageBonus: 0.4, conditionBonus: 0.1 });
  assert.equal(mid.multiplier, 2.3, '1.0+0.3+0.5+0.4+0.1');
  assert.equal(mid.capped, false);

  const full = C.composeMultiplier({ costumeBonus: 0.5, skillBonus: 1.0, stageBonus: 1.0, conditionBonus: 0.3 });
  assert.equal(full.multiplier, 3.0, '合計3.8だが上限3.0で頭打ち');
  assert.equal(full.capped, true);

  const over = C.composeMultiplier({ costumeBonus: 9.9, skillBonus: 0, stageBonus: 0, conditionBonus: 0 });
  assert.equal(over.breakdown.costume, 0.5, 'スロットごとの上限が先に効く');
});

test('倍率合成: フィーバーは掛け算ではなく10倍への置換(H-4)', () => {
  const fever = C.composeMultiplier({
    costumeBonus: 0.5, skillBonus: 1.0, stageBonus: 1.0, conditionBonus: 0.3, feverActive: true
  });
  assert.equal(fever.multiplier, 10.0, '3.0×10=30倍にはしない');
  assert.equal(fever.feverActive, true);
  assert.equal(fever.breakdown.costume, 0, '他の倍率は無効化される');
});

test('コンディション: 生活習慣の合計から翌日の倍率加算を段階で決める', () => {
  assert.equal(C.conditionBonusFromHabits(0), 0);
  assert.equal(C.conditionBonusFromHabits(20), 0.05);
  assert.equal(C.conditionBonusFromHabits(30), 0.1);
  assert.equal(C.conditionBonusFromHabits(60), 0.2);
  assert.equal(C.conditionBonusFromHabits(115), 0.3, '満点は115BP');
  assert.equal(C.conditionBonusFromHabits(115), C.conditionBonusFromHabits(999), '上限を超えても0.3');
});

test('BP獲得: 1分=1BP、倍率は学習時間だけに掛かり行動ボーナスには掛からない', () => {
  const plain = C.calcStudyBP({ minutes: 180, multiplier: 1 });
  assert.equal(plain.baseBP, 180, '1日3時間=180BP');
  assert.equal(plain.grantedBP, 180);

  const boosted = C.calcStudyBP({
    minutes: 100, multiplier: 2, actions: ['planAchieved', 'reflection']
  });
  assert.equal(boosted.multipliedBP, 200, '100分×2.0倍');
  assert.equal(boosted.bonusBP, 60, '+50 +10 は倍率の影響を受けない');
  assert.equal(boosted.grantedBP, 260);
});

test('BP獲得: 非受験科目は1日100BPまでに抑えられる', () => {
  const first = C.calcStudyBP({ minutes: 80, isExamSubject: false });
  assert.equal(first.grantedBP, 80);
  assert.equal(first.nonExamCapped, false);

  const second = C.calcStudyBP({ minutes: 80, isExamSubject: false, todayNonExamBP: 80 });
  assert.equal(second.subtotalBP, 80);
  assert.equal(second.grantedBP, 20, '残り20BPだけ');
  assert.equal(second.nonExamCapped, true);
  assert.equal(second.lostToCapBP, 60);

  const exam = C.calcStudyBP({ minutes: 300, isExamSubject: true, todayNonExamBP: 100 });
  assert.equal(exam.grantedBP, 300, '受験科目は非受験の上限に影響されない');
});

test('BP獲得: 1日の上限1,500BPで頭打ちになる', () => {
  const capped = C.calcStudyBP({ minutes: 300, multiplier: 3, todayTotalBP: 1400 });
  assert.equal(capped.subtotalBP, 900);
  assert.equal(capped.grantedBP, 100, '残り100BPだけ');
  assert.equal(capped.dailyCapped, true);
  assert.equal(capped.todayTotalAfter, 1500);

  const full = C.calcStudyBP({ minutes: 60, todayTotalBP: 1500 });
  assert.equal(full.grantedBP, 0, '上限到達後は0BP');
  assert.equal(full.dailyCapped, true);
});

test('計画達成の判定: 達成率80〜120%のときだけ成立する', () => {
  assert.equal(C.isPlanAchieved(60, 60), true, '100%');
  assert.equal(C.isPlanAchieved(60, 48), true, '80%');
  assert.equal(C.isPlanAchieved(60, 72), true, '120%');
  assert.equal(C.isPlanAchieved(60, 47), false, '79%は未達');
  assert.equal(C.isPlanAchieved(60, 73), false, '水増しすると外れる');
  assert.equal(C.isPlanAchieved(0, 60), false, '計画0分では成立しない');
});

test('ニュースBP: 志望学部に一致するジャンルは1.5倍', () => {
  const econ = C.calcNewsBP({ genreId: 'economy', faculties: ['economics'] });
  assert.equal(econ.baseBP, 40);
  assert.equal(econ.bp, 60, '40×1.5');
  assert.equal(econ.facultyMatched, true);

  const econNoMatch = C.calcNewsBP({ genreId: 'economy', faculties: ['law'] });
  assert.equal(econNoMatch.bp, 40);
  assert.equal(econNoMatch.facultyMatched, false);

  const tech = C.calcNewsBP({ genreId: 'tech', faculties: [] });
  assert.equal(tech.bp, 60, 'IT・AIはどの学部でも加点');

  const sports = C.calcNewsBP({ genreId: 'sports', faculties: ['economics', 'law', 'international'] });
  assert.equal(sports.bp, 20);
});

test('ニュースBP: 1日3本を超えると0BP、未知ジャンルは拒否', () => {
  assert.equal(C.calcNewsBP({ genreId: 'economy', todayCount: 2 }).remainingToday, 1);
  const over = C.calcNewsBP({ genreId: 'economy', todayCount: 3 });
  assert.equal(over.bp, 0);
  assert.equal(over.overLimit, true);
  assert.throws(() => C.calcNewsBP({ genreId: 'nope' }), RangeError);
});

test('ニュース: 全ジャンル制覇で+200BP', () => {
  const all = C.NEWS_GENRES.map(g => g.id);
  assert.equal(C.NEWS_GENRES.length, 10);
  const done = C.calcAllGenresBonus(all);
  assert.equal(done.complete, true);
  assert.equal(done.bonusBP, 200);

  const partial = C.calcAllGenresBonus(['economy', 'economy', 'sports']);
  assert.equal(partial.recorded, 2, '重複は数えない');
  assert.equal(partial.bonusBP, 0);
});

test('GT換算: 円安で1枚の価値が上がり、変動は±20%で止まる', () => {
  assert.equal(C.gtToYen({ fxRate: 150 }).yenPerGT, 100, '基準は1GT=100円');
  assert.equal(C.gtToYen({ fxRate: 165 }).yenPerGT, 110, '円安=お得');
  assert.equal(C.gtToYen({ fxRate: 135 }).yenPerGT, 90, '円高=損');
  assert.equal(C.gtToYen({ fxRate: 165 }).trend, 'weak-yen');
  assert.equal(C.gtToYen({ fxRate: 135 }).trend, 'strong-yen');

  const extreme = C.gtToYen({ fxRate: 300 });
  assert.equal(extreme.yenPerGT, 120, '±20%を超えて変動しない');
  assert.equal(extreme.bandCapped, true);
  assert.equal(C.gtToYen({ fxRate: 10 }).yenPerGT, 80);
});

test('PayPay交換: 月間上限2,000円を1円も超えない(切り捨て)', () => {
  const base = C.calcPayPayRequest({ availableGT: 50, fxRate: 150 });
  assert.equal(base.redeemableGT, 20, '100円×20枚=2,000円');
  assert.equal(base.payoutYen, 2000);
  assert.equal(base.capReached, true);

  const weakYen = C.calcPayPayRequest({ availableGT: 50, fxRate: 165 });
  assert.equal(weakYen.redeemableGT, 18, '110円×18枚=1,980円');
  assert.ok(weakYen.payoutYen <= 2000);

  const strongYen = C.calcPayPayRequest({ availableGT: 50, fxRate: 135 });
  assert.equal(strongYen.redeemableGT, 22, '90円×22枚=1,980円。23枚だと2,070円で上限超過');
  assert.ok(strongYen.payoutYen <= 2000);
  assert.equal(strongYen.advice, 'wait-recommended', '円高のときは待つよう促す');
});

test('PayPay交換: 今月の使用済み分を差し引き、繰り越さない', () => {
  const partial = C.calcPayPayRequest({ availableGT: 50, fxRate: 150, usedYenThisMonth: 1500 });
  assert.equal(partial.redeemableGT, 5, '残り500円分だけ');
  assert.equal(partial.payoutYen, 500);
  assert.equal(partial.remainingCapYen, 0);

  const exhausted = C.calcPayPayRequest({ availableGT: 50, fxRate: 150, usedYenThisMonth: 2000 });
  assert.equal(exhausted.redeemableGT, 0);
  assert.equal(exhausted.leftoverGT, 50, 'GTは手元に残る');

  const few = C.calcPayPayRequest({ availableGT: 3, fxRate: 150 });
  assert.equal(few.redeemableGT, 3, '保有枚数が上限を下回るときはそのまま');
  assert.equal(few.capReached, false);
});

test('ポイント計算: 不正な入力・未知の行動ボーナスを拒否する', () => {
  assert.throws(() => C.calcStudyBP({ minutes: -1 }), RangeError);
  assert.throws(() => C.calcStudyBP({ minutes: 60, multiplier: -1 }), RangeError);
  assert.throws(() => C.calcActionBonusBP(['unknown']), RangeError);
  assert.throws(() => C.calcActionBonusBP([123]), RangeError);
  assert.throws(() => C.calcActionBonusBP('planAchieved'), TypeError);
  assert.throws(() => C.conditionBonusFromHabits(-1), RangeError);
  assert.throws(() => C.gtToYen({ fxRate: 0 }), RangeError);
  assert.throws(() => C.calcPayPayRequest({ availableGT: 1.5, fxRate: 150 }), RangeError);
});

test('ニュース記録: 志望学部のデフォルトはすべてON、stateに news 配列がある', () => {
  const st = C.defaultState('2026-08-08');
  assert.deepEqual(st.settings.faculties, { economics: true, law: true, international: true });
  assert.deepEqual(st.news, []);
});

test('ニュース記録の検証: 見出し必須、ジャンルは既知のものだけ', () => {
  assert.ok(C.validateNewsEntry({ date: '2026-08-08', genreId: 'economy', headline: '円安が進んだ' }).ok);
  assert.ok(!C.validateNewsEntry({ date: '2026-08-08', genreId: 'economy', headline: '' }).ok, '見出し空は拒否');
  assert.ok(!C.validateNewsEntry({ date: '2026-08-08', genreId: 'nope', headline: 'x' }).ok, '未知ジャンルは拒否');
  assert.ok(!C.validateNewsEntry({ date: '2026-13-40', genreId: 'economy', headline: 'x' }).ok, '不正日付は拒否');
});

test('sanitizeState: news配列と志望学部の設定が壊れていても復元できる', () => {
  const st = C.defaultState('2026-08-08');
  st.news.push({ id: 'n1', date: '2026-08-08', genreId: 'economy', headline: '円安が進んだ', comment: '輸入品が高い', bp: 60, createdAt: 1 });
  st.news.push({ garbage: true });
  st.settings.faculties = { economics: false, law: 'not-a-bool' };
  const out = C.sanitizeState(JSON.parse(JSON.stringify(st)), '2026-08-08');
  assert.ok(out);
  assert.equal(out.news.length, 1, '壊れた1件は除外される');
  assert.equal(out.news[0].headline, '円安が進んだ');
  assert.equal(out.settings.faculties.economics, false, '正常なbooleanは反映される');
  assert.equal(out.settings.faculties.law, true, '不正な値はデフォルトのまま');
  assert.equal(out.settings.faculties.international, true, '未指定はデフォルトのまま');
});

/* ==================================================================
 * 装備・ショップ (ver.4.1.0)
 * ================================================================== */

test('defaultShopState: ステージはストリートを初期所持・装備している', () => {
  const shop = C.defaultShopState();
  assert.deepEqual(shop.owned.stage, ['street']);
  assert.equal(shop.equipped.stage, 'street');
  assert.equal(shop.equipped.costume, null);
  assert.equal(shop.equipped.skill, null);
});

test('calcBpBalance: 記録・ニュースのbp合計から購入済みアイテムの価格を差し引く', () => {
  const st = C.defaultState('2026-08-08');
  st.records.push({ id: 'r1', date: '2026-08-08', subjectId: 'eng', content: 'x', kind: '暗記', planMin: 30, actualMin: 30, reflection: '', deletedAt: null, bp: 500 });
  st.news.push({ id: 'n1', date: '2026-08-08', genreId: 'economy', headline: 'x', comment: '', bp: 60, createdAt: 1 });
  assert.equal(C.calcBpBalance(st), 560);
  st.shop.owned.costume.push('socks'); // 500 BP
  assert.equal(C.calcBpBalance(st), 60);
});

test('calcBpBalance: 削除済み記録のBPは残高に含めない', () => {
  const st = C.defaultState('2026-08-08');
  st.records.push({ id: 'r1', date: '2026-08-08', subjectId: 'eng', content: 'x', kind: '暗記', planMin: 30, actualMin: 30, reflection: '', deletedAt: Date.now(), bp: 500 });
  assert.equal(C.calcBpBalance(st), 0);
});

test('validatePurchase: 残高不足・二重購入を拒否する', () => {
  const shop = C.defaultShopState();
  assert.ok(!C.validatePurchase(shop, 'socks', 100).ok, '残高不足は拒否');
  const ok = C.validatePurchase(shop, 'socks', 500);
  assert.ok(ok.ok);
  assert.equal(ok.item.price, 500);
  shop.owned.costume.push('socks');
  assert.ok(!C.validatePurchase(shop, 'socks', 10000).ok, '所持済みは二重購入を拒否');
  // 消費アイテムは何個でも買える
  shop.owned.consumable.energy_drink = 2;
  assert.ok(C.validatePurchase(shop, 'energy_drink', 10000).ok);
});

test('validateEquip: 所持していないアイテムは装備できない・ステージは未装備にできない', () => {
  const shop = C.defaultShopState();
  assert.ok(!C.validateEquip(shop, 'costume', 'socks').ok, '未所持は拒否');
  shop.owned.costume.push('socks');
  assert.ok(C.validateEquip(shop, 'costume', 'socks').ok);
  assert.ok(C.validateEquip(shop, 'costume', null).ok, '衣装は未装備にできる');
  assert.ok(!C.validateEquip(shop, 'stage', null).ok, 'ステージは未装備にできない');
});

test('composeMultiplier: 装備3スロット合計+コンディションが3.0倍で頭打ちになる', () => {
  const r = C.composeMultiplier({ costumeBonus: 0.5, skillBonus: 1.0, stageBonus: 1.0, conditionBonus: 0.3 });
  assert.equal(r.multiplier, 3.0);
  assert.ok(r.capped);
  assert.ok(!r.feverActive);
});

test('composeMultiplier: フィーバー中は他の倍率をすべて無視して10倍に置換する', () => {
  const r = C.composeMultiplier({ feverActive: true, costumeBonus: 0.5, skillBonus: 1.0, stageBonus: 1.0, conditionBonus: 0.3, consumableBonus: 1.5 });
  assert.equal(r.multiplier, 10);
  assert.ok(r.feverActive);
});

test('composeMultiplier: フィーバー中もbreakdown.consumableキーが存在する(NaN表示・例外を防ぐ)', () => {
  const r = C.composeMultiplier({ feverActive: true });
  assert.equal(typeof r.breakdown.consumable, 'number');
  assert.equal(r.breakdown.costume + r.breakdown.skill + r.breakdown.stage + r.breakdown.consumable, 0);
});

test('weekStartStr / canUseFever: フィーバーは週1回まで', () => {
  assert.equal(C.weekStartStr('2026-08-08'), '2026-08-03', '土曜日の週は月曜起点');
  assert.equal(C.weekStartStr('2026-08-03'), '2026-08-03', '月曜日はその日自身');
  assert.ok(C.canUseFever(null, '2026-08-08'), '未使用なら使える');
  assert.ok(!C.canUseFever('2026-08-03', '2026-08-08'), '同じ週はまだ使えない');
  assert.ok(C.canUseFever('2026-08-02', '2026-08-08'), '前の週なら使える(週またぎ)');
});

test('consumableAvailable: 購入数から使用済み数を引いた残数を返す', () => {
  const shop = C.defaultShopState();
  assert.equal(C.consumableAvailable(shop, 'energy_drink'), 0);
  shop.owned.consumable.energy_drink = 3;
  shop.used.consumable.energy_drink = 1;
  assert.equal(C.consumableAvailable(shop, 'energy_drink'), 2);
});

test('calcHabitBP: ON にした生活習慣の合計を返す', () => {
  assert.equal(C.calcHabitBP({ sleepEarly: true, breakfast: true }), 35);
  assert.equal(C.calcHabitBP({}), 0);
  assert.equal(C.calcHabitBP(null), 0);
});

test('conditionBonusFromHabits と calcHabitBP の連携: 90BP以上で+0.3', () => {
  const bp = C.calcHabitBP({ sleepEarly: true, breakfast: true, exercise: true, restTaken: true, reading: true }); // 20+15+30+10+40=115
  assert.equal(bp, 115);
  assert.equal(C.conditionBonusFromHabits(bp), 0.3);
});

test('evaluateSkillBonus: 装備中スキルの条件を満たしたときだけ倍率が乗る', () => {
  assert.equal(C.evaluateSkillBonus('zero_gravity', { actualMin: 89 }), 0);
  assert.equal(C.evaluateSkillBonus('zero_gravity', { actualMin: 90 }), 0.5);
  assert.equal(C.evaluateSkillBonus('spin_turn', { distinctSubjectsToday: 2 }), 0);
  assert.equal(C.evaluateSkillBonus('spin_turn', { distinctSubjectsToday: 3 }), 0.3);
  assert.equal(C.evaluateSkillBonus('anti_gravity_lean', { hour: 5 }), 0);
  assert.equal(C.evaluateSkillBonus('anti_gravity_lean', { hour: 7 }), 1.0);
  assert.equal(C.evaluateSkillBonus('anti_gravity_lean', { hour: 8 }), 0, '8時ちょうどは対象外(6〜8時)');
  assert.equal(C.evaluateSkillBonus('moonwalk', { isLaggingSubject: true }), 0.5);
  assert.equal(C.evaluateSkillBonus('moonwalk', { isLaggingSubject: false }), 0);
  assert.equal(C.evaluateSkillBonus('rhythm_keep', {}), 0, '連続日数ボーナス2倍は別枠で処理するためここでは0');
  assert.equal(C.evaluateSkillBonus(null, {}), 0, '未装備は0');
});

test('laggingSubjectId: 累計実績が最も少ない科目を返す', () => {
  const subjects = C.DEFAULT_SUBJECTS;
  const records = [
    rec({ id: 'a', subjectId: 'eng', actualMin: 100 }),
    rec({ id: 'b', subjectId: 'math', actualMin: 10 }),
    rec({ id: 'c', subjectId: 'jpn', actualMin: 50 })
  ];
  assert.equal(C.laggingSubjectId(records, subjects), 'sci', '記録が一切ない科目(0分)が最優先で最も遅れている');
});

test('streakDays: リカバリーで守った日は実績0でも連続扱いになる', () => {
  const records = [
    rec({ id: 'a', date: '2026-08-06', actualMin: 30 }),
    rec({ id: 'b', date: '2026-08-08', actualMin: 20 })
  ];
  assert.equal(C.streakDays(records, '2026-08-08'), 1, 'ガードなしだと8/7が抜けて連続1日');
  assert.equal(C.streakDays(records, '2026-08-08', ['2026-08-07']), 3, 'リカバリーで8/7を守ると6-7-8で3日連続');
});

test('sanitizeState: shop/habitsが壊れていても既定値に復元できる', () => {
  const st = C.defaultState('2026-08-08');
  st.shop.owned.costume = ['socks', 'not-a-real-item'];
  st.shop.equipped.costume = 'socks';
  st.shop.owned.consumable = { energy_drink: 2, bogus: 5 };
  st.habits['2026-08-07'] = { sleepEarly: true, bogus: true };
  st.habits['bad-date'] = { sleepEarly: true };
  const out = C.sanitizeState(JSON.parse(JSON.stringify(st)), '2026-08-08');
  assert.ok(out);
  assert.deepEqual(out.shop.owned.costume, ['socks'], '不正なIDは除外される');
  assert.equal(out.shop.equipped.costume, 'socks');
  assert.deepEqual(out.shop.owned.consumable, { energy_drink: 2 }, '不正な消費アイテムIDは除外される');
  assert.deepEqual(out.habits['2026-08-07'], { sleepEarly: true }, '不正なキーは除外される');
  assert.equal(out.habits['bad-date'], undefined, '不正な日付キーは除外される');
});

test('sanitizeState: 壊れたshopオブジェクト全体でも既定のshopに復元できる', () => {
  const st = C.defaultState('2026-08-08');
  st.shop = { garbage: true };
  const out = C.sanitizeState(JSON.parse(JSON.stringify(st)), '2026-08-08');
  assert.ok(out);
  assert.deepEqual(out.shop.owned.stage, ['street']);
  assert.equal(out.shop.equipped.stage, 'street');
});

test('defaultState: 科目にexamSubjectが正しく含まれる(「その他」は非受験科目)', () => {
  const st = C.defaultState('2026-08-08');
  const other = st.settings.subjects.find(s => s.id === 'other');
  assert.equal(other.examSubject, false, '「その他」はデフォルトで非受験科目');
  const eng = st.settings.subjects.find(s => s.id === 'eng');
  assert.equal(eng.examSubject, true, '「英語」はデフォルトで受験科目');
  st.settings.subjects.forEach(s => assert.equal(typeof s.examSubject, 'boolean', s.id + 'のexamSubjectはboolean'));
});

/* ==================================================================
 * バグ修正(Codex独立レビュー・ver.4.1.0)
 * ================================================================== */

test('isFocusModeActive: 受験30日前(境界含む)〜当日はtrue、31日以上前・受験後はfalse', () => {
  assert.equal(C.isFocusModeActive('2026-09-08', '2026-08-08'), false, '31日前はまだ通常モード');
  assert.equal(C.isFocusModeActive('2026-09-07', '2026-08-08'), true, '30日前は集中モード(境界含む)');
  assert.equal(C.isFocusModeActive('2026-08-09', '2026-08-08'), true, '前日');
  assert.equal(C.isFocusModeActive('2026-08-08', '2026-08-08'), true, '当日');
  assert.equal(C.isFocusModeActive('2026-08-07', '2026-08-08'), false, '受験日を過ぎたら通常モードに戻る');
  assert.equal(C.isFocusModeActive(null, '2026-08-08'), false, '受験日未設定なら常に通常モード');
});

test('sanitizeState: dailyBonusesは既知の行動ボーナスキーだけを日付ごとに保持する', () => {
  const st = C.defaultState('2026-08-08');
  st.dailyBonuses['2026-08-08'] = { streak3: true, bogus: true, allExamSubjects: 'not-a-bool' };
  st.dailyBonuses['bad-date'] = { streak3: true };
  st.dailyBonuses['2026-08-07'] = { reflection: true };
  const out = C.sanitizeState(JSON.parse(JSON.stringify(st)), '2026-08-08');
  assert.ok(out);
  assert.deepEqual(out.dailyBonuses['2026-08-08'], { streak3: true }, '不正なキー・値は除外される');
  assert.equal(out.dailyBonuses['bad-date'], undefined, '不正な日付キーは除外される');
  assert.deepEqual(out.dailyBonuses['2026-08-07'], { reflection: true });
});

/* ==================================================================
 * APP-460: 科目ごとの学習種別
 * ================================================================== */

test('studyKindsFor: 科目ごとに、その科目でやる勉強の選択肢を返す', () => {
  const soc = C.studyKindsFor('soc');
  assert.ok(soc.includes('一問一答'), '社会には一問一答がある');
  assert.ok(soc.includes('流れ・つながりの整理'), '社会には流れの整理がある');
  assert.ok(!soc.includes('読解'), '社会に「読解」は出さない');
  assert.ok(!soc.includes('演習'), '社会に「演習」は出さない');

  const math = C.studyKindsFor('math');
  assert.ok(math.includes('公式・定理の確認'), '数学には公式・定理の確認がある');
  assert.ok(!math.includes('暗記'), '数学に素の「暗記」は出さない');
  assert.ok(!math.includes('読解'), '数学に「読解」は出さない');

  assert.ok(C.studyKindsFor('eng').includes('リスニング'), '英語にはリスニングがある');
  assert.ok(C.studyKindsFor('jpn').includes('古文'), '国語には古文がある');
  assert.ok(C.studyKindsFor('sci').includes('実験・図表の読み取り'), '理科には実験・図表がある');
});

test('studyKindsFor: 全科目に「テスト」が必ず含まれる(点数欄の出し分けに使うため)', () => {
  ['eng', 'math', 'jpn', 'sci', 'soc', 'other', 'ユーザーが作った科目'].forEach((id) => {
    assert.ok(C.studyKindsFor(id).includes(C.TEST_KIND), id + ' に テスト がある');
  });
});

test('studyKindsFor: 自作科目・その他は共通の選択肢を返す', () => {
  assert.deepEqual(C.studyKindsFor('other'), C.STUDY_KINDS);
  assert.deepEqual(C.studyKindsFor('s_custom_1'), C.STUDY_KINDS);
});

test('studyKindsFor: 返り値を書き換えても定義は壊れない(複製を返す)', () => {
  const a = C.studyKindsFor('soc');
  a.push('壊す');
  assert.ok(!C.studyKindsFor('soc').includes('壊す'), '次に呼んでも影響がない');
});

test('studyKindsFor: 選択肢は5〜8個に収める(多すぎると選ぶのが負担になる)', () => {
  ['eng', 'math', 'jpn', 'sci', 'soc', 'other'].forEach((id) => {
    const n = C.studyKindsFor(id).length;
    assert.ok(n >= 5 && n <= 8, id + ' は5〜8個 (実際は' + n + ')');
  });
});

test('defaultStudyKindFor: 科目ごとの初期値を返し、その科目の一覧に含まれる', () => {
  assert.equal(C.defaultStudyKindFor('math'), '問題演習');
  assert.equal(C.defaultStudyKindFor('soc'), '用語の暗記');
  assert.equal(C.defaultStudyKindFor('eng'), '単語・熟語');
  ['eng', 'math', 'jpn', 'sci', 'soc', 'other', 'zzz'].forEach((id) => {
    assert.ok(C.studyKindsFor(id).includes(C.defaultStudyKindFor(id)),
      id + ' の初期値がその科目の一覧にある');
  });
});

test('isValidStudyKind: 旧データの値も新しい値も有効なまま扱う', () => {
  ['暗記', '演習', '読解', '講義', '復習', 'テスト', 'その他'].forEach((k) => {
    assert.ok(C.isValidStudyKind(k), '旧データの「' + k + '」は有効');
  });
  assert.ok(C.isValidStudyKind('一問一答'));
  assert.ok(C.isValidStudyKind('公式・定理の確認'));
  assert.ok(!C.isValidStudyKind('存在しない種別'));
});

test('validateRecord: 科目と学習種別の組合せは検証しない(科目を変えても記録は壊れない)', () => {
  const subjects = C.DEFAULT_SUBJECTS;
  const rec = {
    id: 'r1', date: '2026-08-10', subjectId: 'soc', content: '公民',
    kind: '公式・定理の確認',   // 数学の種別を社会に付けた状態
    planMin: 30, actualMin: 30, score: null, maxScore: null, reflection: ''
  };
  assert.ok(C.validateRecord(rec, subjects).ok,
    '科目をまたいだ種別でも保存できる(過去の記録を無効にしないため)');
});

test('sanitizeState: 旧データの学習種別を「その他」へ書き換えない', () => {
  const st = C.defaultState('2026-08-10');
  st.records.push({
    id: 'r_old', date: '2026-08-10', subjectId: 'soc', content: '旧記録',
    kind: '暗記', planMin: 30, actualMin: 30, score: null, maxScore: null,
    reflection: '', createdAt: 1, updatedAt: 1, deletedAt: null
  });
  st.records.push({
    id: 'r_bad', date: '2026-08-10', subjectId: 'soc', content: '不正',
    kind: '存在しない種別', planMin: 30, actualMin: 30, score: null, maxScore: null,
    reflection: '', createdAt: 1, updatedAt: 1, deletedAt: null
  });
  const out = C.sanitizeState(JSON.parse(JSON.stringify(st)), '2026-08-10');
  assert.equal(out.records.find((r) => r.id === 'r_old').kind, '暗記', '旧データはそのまま残る');
  assert.equal(out.records.find((r) => r.id === 'r_bad').kind, 'その他', '不正な値だけ「その他」になる');
});

test('学習種別に重複した文言が無い(同じ意味の語を並べない)', () => {
  ['eng', 'math', 'jpn', 'sci', 'soc', 'other'].forEach((id) => {
    const list = C.studyKindsFor(id);
    assert.equal(new Set(list).size, list.length, id + ' に重複が無い');
  });
});

/* ==================================================================
 * APP-460/461: 第三者レビューで見つかった不具合の再発防止
 * ================================================================== */

test('studyKindsFor: プロトタイプ由来のキーでも落ちない(toString / constructor / __proto__)', () => {
  ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf'].forEach((id) => {
    const list = C.studyKindsFor(id);
    assert.ok(Array.isArray(list), id + ' で配列が返る');
    assert.deepEqual(list, C.STUDY_KINDS, id + ' は共通の選択肢になる');
    assert.equal(typeof C.defaultStudyKindFor(id), 'string', id + ' の初期値が文字列');
  });
});

test('studyKindsFor: 科目idが空・null・数値でも落ちない', () => {
  ['', null, undefined, 0, 123].forEach((id) => {
    assert.ok(Array.isArray(C.studyKindsFor(id)), String(id) + ' で配列が返る');
  });
});

test('テストはすべての科目の選択肢に含まれる(科目を変えても得点が消えない前提)', () => {
  // 「テスト」がどの科目にもあるため、科目変更時に種別を保てる。
  // 1つでも欠けると、科目を変えた瞬間に得点欄が閉じて保存時にscoreがnullになる。
  const ids = ['eng', 'math', 'jpn', 'sci', 'soc', 'other', '自作科目'];
  ids.forEach((id) => {
    assert.ok(C.studyKindsFor(id).indexOf(C.TEST_KIND) !== -1, id + ' に ' + C.TEST_KIND);
  });
  // 科目をまたいで同じ種別を保てるか(実装側 refreshKindForSubject の前提)
  for (let i = 0; i < ids.length; i++) {
    for (let j = 0; j < ids.length; j++) {
      assert.ok(C.studyKindsFor(ids[j]).indexOf(C.TEST_KIND) !== -1,
        ids[i] + ' → ' + ids[j] + ' でテストを保てる');
    }
  }
});

/* ==================================================================
 * APP-440 段階1: 時間の分離とBPの決定的な再計算
 * 設計書 docs/design/APP-440_DESIGN.md §1・§3・§5・§6
 * ================================================================== */

const M = C.MS_PER_MINUTE;
const T0 = 1786400000000;   // 基準時刻。実時計は使わない

function seg(fromMin, toMin) {
  return { from: T0 + fromMin * M, to: toMin === null ? null : T0 + toMin * M };
}
function boostRec(over) {
  return Object.assign({
    id: 'r1', createdAt: 1000, planMin: 30, actualMin: 30,
    reflection: '', score: null, maxScore: null, deletedAt: null
  }, over);
}

test('APP-440 §5: bpOrder は createdAt 昇順 → id 昇順で決定的に並ぶ', () => {
  const a = { id: 'b', createdAt: 100 };
  const b = { id: 'a', createdAt: 200 };
  const c = { id: 'a', createdAt: 100 };
  assert.equal(C.bpOrder(a, b), -1, 'createdAt が早い方が先');
  assert.equal(C.bpOrder(b, a), 1);
  assert.equal(C.bpOrder(c, a), -1, 'createdAt 同着なら id 昇順');
  assert.equal(C.bpOrder(a, a), 0);
  // 配列順に依存しないこと。どんな初期順序でも同じ並びになる。
  const items = [
    { id: 'z', createdAt: 300 }, { id: 'a', createdAt: 100 },
    { id: 'b', createdAt: 100 }, { id: 'm', createdAt: 200 }
  ];
  const want = ['a', 'b', 'm', 'z'];
  assert.deepEqual(items.slice().sort(C.bpOrder).map((r) => r.id), want);
  assert.deepEqual(items.slice().reverse().sort(C.bpOrder).map((r) => r.id), want);
});

test('APP-440 §5: createdAt を持たない旧データも例外にならず順序が定まる', () => {
  const items = [{ id: 'b' }, { id: 'a', createdAt: 5 }, { id: 'c' }];
  const sorted = items.slice().sort(C.bpOrder);
  // createdAt 無しは 0 として扱われ、その日の最古になる
  assert.deepEqual(sorted.map((r) => r.id), ['b', 'c', 'a']);
});

test('APP-440 §3: normalizeSegments は進行中を now で閉じ、壊れた区間を捨てる', () => {
  const now = T0 + 30 * M;
  const out = C.normalizeSegments([
    seg(0, 10),
    seg(20, null),          // 進行中 → now で閉じる
    { from: T0 + 5 * M, to: T0 + 5 * M },   // 長さ0 → 捨てる
    { from: T0 + 10 * M, to: T0 + 8 * M },  // 逆転 → 捨てる
    { from: 'x', to: 1 },   // 数値でない → 捨てる
    null
  ], now);
  assert.equal(out.length, 2);
  assert.equal(out[1].to, now, '進行中の区間は now で閉じる');
});

test('APP-440 §3: 壊れた終了時刻は now で閉じず、区間ごと捨てる', () => {
  // to: null 以外の「数値でない終了時刻」を now で閉じると、
  // 壊れた区間を「いままで学習していた」ことにでき、倍率の対象を水増しできる。
  const now = T0 + 30 * M;
  assert.deepEqual(C.normalizeSegments([
    { from: T0, to: 'x' },
    { from: T0, to: {} },
    { from: T0, to: Infinity }
  ], now), [], '壊れた to は捨てる');

  // 終了時刻そのものが無い場合も、進行中とは判断できないので捨てる
  assert.deepEqual(C.normalizeSegments([{ from: T0 }], now), [], 'to が無い区間も捨てる');
  assert.deepEqual(C.normalizeSegments([{ from: T0, to: NaN }], now), [], 'NaN も捨てる');

  // null だけが進行中を表す
  const alive = C.normalizeSegments([{ from: T0, to: null }], now);
  assert.equal(alive.length, 1);
  assert.equal(alive[0].to, now);

  // 壊れた区間ぶんの倍率が乗らないことまで確認する
  const boost = C.applyTimedBoost({
    segments: [{ from: T0, to: 'x' }], startedAt: T0, durationMs: 60 * M, consumedMs: 0, now
  });
  assert.equal(boost.boostMinutes, 0, '壊れた区間に倍率は乗らない');
});

test('APP-440 §3: segmentsOverlapMs は重複区間を二重に数えない', () => {
  // 0-10分 と 5-15分 が重なっている。単純合計なら20分だが、実際に勉強したのは15分。
  const ms = C.segmentsOverlapMs([seg(0, 10), seg(5, 15)], T0, T0 + 60 * M);
  assert.equal(ms / M, 15);
  // 有効区間の外は数えない
  assert.equal(C.segmentsOverlapMs([seg(70, 80)], T0, T0 + 60 * M) / M, 0);
  // 有効区間をまたぐ場合は内側だけ
  assert.equal(C.segmentsOverlapMs([seg(-10, 70)], T0, T0 + 60 * M) / M, 60);
  // 有効区間が空なら0
  assert.equal(C.segmentsOverlapMs([seg(0, 10)], T0, T0), 0);
});

test('APP-440 §3 T-2-17: 59秒は切り上げず、次の1秒でちょうど1分になる', () => {
  // 端数を失わないこと。consumedMs に足すのは appliedMs であって availableMs ではない。
  const first = C.applyTimedBoost({
    segments: [{ from: T0, to: T0 + 59000 }], startedAt: T0, durationMs: 60 * M, consumedMs: 0
  });
  assert.equal(first.boostMinutes, 0, '59秒では倍率は乗らない');
  assert.equal(first.nextConsumedMs, 0, '59秒を消費しない(据え置き)');

  const second = C.applyTimedBoost({
    segments: [{ from: T0, to: T0 + 60000 }], startedAt: T0, durationMs: 60 * M,
    consumedMs: first.nextConsumedMs
  });
  assert.equal(second.boostMinutes, 1, 'あと1秒でちょうど1分');
  assert.equal(second.nextConsumedMs, 60000);
});

test('APP-440 §3 T-2-18: 期限まで59秒でも0分。期限後も0分で持ち越さない', () => {
  // 有効区間 60分。59分01秒ぶん勉強した状態。
  const near = C.applyTimedBoost({
    segments: [seg(0, 29), { from: T0 + 29 * M, to: T0 + 29 * M + 59000 }],
    startedAt: T0, durationMs: 30 * M, consumedMs: 29 * M
  });
  assert.equal(near.boostMinutes, 0, '残り59秒は乗らない');
  assert.equal(near.nextConsumedMs, 29 * M, '据え置き');

  // 期限を過ぎてから保存しても、重なりは増えないので0分のまま
  const after = C.applyTimedBoost({
    segments: [seg(0, 29), { from: T0 + 29 * M, to: T0 + 29 * M + 59000 }, seg(40, 50)],
    startedAt: T0, durationMs: 30 * M, consumedMs: near.nextConsumedMs
  });
  assert.equal(after.boostMinutes, 0, '期限後に勉強しても端数は復活しない');
  assert.equal(after.nextConsumedMs, 29 * M);
});

test('APP-440 §3 T-2-3: 一時停止中はアイテムを消費しない(壁時計基準にしない)', () => {
  // 10:00開始・60分アイテム。10:00-10:20 勉強、10:20-10:50 一時停止。
  // 壁時計基準なら50分ぶん使えてしまうが、実学習区間基準では20分だけ。
  const studied = [seg(0, 20)];
  const first = C.applyTimedBoost({ segments: studied, startedAt: T0, durationMs: 60 * M, consumedMs: 0 });
  assert.equal(first.boostMinutes, 20);

  // 一時停止したまま30分置いて保存しても、区間は増えていない
  const paused = C.applyTimedBoost({
    segments: studied, startedAt: T0, durationMs: 60 * M, consumedMs: first.nextConsumedMs
  });
  assert.equal(paused.boostMinutes, 0, '停止中の30分は一切消費しない');
  assert.equal(paused.nextConsumedMs, first.nextConsumedMs);
});

test('APP-440 §3 T-2-8/T-2-11: 持ち時間を超えて再配分できない', () => {
  // 削除・復元を繰り返しても consumedMs は単調増加のままで、合計は持ち時間を超えない
  let consumed = 0;
  let total = 0;
  for (let i = 0; i < 5; i++) {
    const r = C.applyTimedBoost({
      segments: [seg(0, 100)], startedAt: T0, durationMs: 30 * M, consumedMs: consumed
    });
    total += r.boostMinutes;
    consumed = r.nextConsumedMs;
  }
  assert.equal(total, 30, '何回保存しても合計30分を超えない');
});

test('APP-440 §3: 期限切れ・既消費でも負の値にならない(Math.max(0,…))', () => {
  const r = C.applyTimedBoost({
    segments: [seg(0, 90)], startedAt: T0, durationMs: 60 * M, consumedMs: 60 * M
  });
  assert.equal(r.availableMs, 0);
  assert.equal(r.boostMinutes, 0);
  assert.equal(r.nextConsumedMs, 60 * M);
});

test('APP-440 §3 T-2-12/T-2-15: segments が無ければ倍率は乗らない(手入力・移行中)', () => {
  // 手入力の記録にも、移行中の旧セッションにも segments が無い。
  // 根拠が無い時間にさかのぼって倍率を乗せない。
  [undefined, null, [], 'x'].forEach((segments) => {
    const r = C.applyTimedBoost({ segments, startedAt: T0, durationMs: 60 * M, consumedMs: 0 });
    assert.equal(r.boostMinutes, 0, String(segments) + ' では0分');
    assert.equal(r.nextConsumedMs, 0);
  });
});

test('APP-440 §1: D ≤ C ≤ A+E。宣言していない時間はBP対象にならない', () => {
  // 計画60分・延長なしで、実績90分が渡ってきた場合(あってはならないが防御する)
  const over = C.resolveBpMinutes({ actualMin: 90, planMin: 60, extendedMin: 0 });
  assert.equal(over.bpMin, 60, '宣言済み時間で頭打ち');
  assert.ok(over.cappedByDeclared);

  // 延長30分を明示した場合は90分まで対象
  const ext = C.resolveBpMinutes({ actualMin: 90, planMin: 60, extendedMin: 30 });
  assert.equal(ext.bpMin, 90);
  assert.ok(!ext.cappedByDeclared);

  // 途中でやめた場合は実績のまま(減る方向は素直に通す)
  const early = C.resolveBpMinutes({ actualMin: 45, planMin: 60, extendedMin: 0 });
  assert.equal(early.bpMin, 45);
});

test('APP-440 §1: 手入力は本人の明示的な意思表示なので実績をそのまま使う', () => {
  const manual = C.resolveBpMinutes({ actualMin: 240, planMin: 0, extendedMin: 0, manualEntry: true });
  assert.equal(manual.bpMin, 240);
  assert.ok(!manual.cappedByDeclared);
});

test('APP-440 §5: 編集でBPは減ることはあっても増えることはない', () => {
  // 30分で保存した記録を60分に編集しても、BP対象は30分のまま
  const up = C.resolveBpMinutes({ actualMin: 60, planMin: 60, extendedMin: 0, previousBpMin: 30 });
  assert.equal(up.bpMin, 30, '増やす編集はBPに反映されない');
  assert.ok(up.cappedByPrevious);

  // 減らす編集はそのまま反映される
  const down = C.resolveBpMinutes({ actualMin: 20, planMin: 60, extendedMin: 0, previousBpMin: 30 });
  assert.equal(down.bpMin, 20);
  assert.ok(!down.cappedByPrevious);
});

test('APP-440 §6 T-5-6: 計画達成は15分ちょうどを含み、14分は対象外', () => {
  // 単語10個・ミニテストのような短時間で完結する勉強を弾かないため「15分以上」
  const at15 = C.resolveDailyActionBonuses([boostRec({ planMin: 15, actualMin: 15 })]);
  assert.equal(at15.owners.planAchieved, 'r1', '15分ちょうどは対象');

  const at14 = C.resolveDailyActionBonuses([boostRec({ planMin: 14, actualMin: 14 })]);
  assert.equal(at14.owners.planAchieved, undefined, '14分は対象外');
});

test('APP-440 §6: 行動ボーナスは1日1回。小分け記録で水増しできない', () => {
  // 30分の記録を5件作っても、計画達成は1回だけ
  const list = [1, 2, 3, 4, 5].map((i) => boostRec({
    id: 'r' + i, createdAt: 1000 + i, planMin: 30, actualMin: 30, reflection: 'わかった'
  }));
  const r = C.resolveDailyActionBonuses(list);
  const totalAssigned = Object.keys(r.byRecordId).reduce((n, k) => n + r.byRecordId[k].length, 0);
  assert.equal(totalAssigned, 2, '計画達成1つと振り返り1つだけ');
  assert.equal(r.owners.planAchieved, 'r1', 'bpOrder の最初の対象記録に付く');
  assert.equal(r.owners.reflection, 'r1');
});

test('APP-440 §6: 模試は得点と満点が両方あるときだけ、1日1回', () => {
  const list = [
    boostRec({ id: 'r1', createdAt: 1, actualMin: 90, planMin: 90, score: null, maxScore: 100 }),
    boostRec({ id: 'r2', createdAt: 2, actualMin: 90, planMin: 90, score: 80, maxScore: 100 }),
    boostRec({ id: 'r3', createdAt: 3, actualMin: 90, planMin: 90, score: 70, maxScore: 100 })
  ];
  const r = C.resolveDailyActionBonuses(list);
  assert.equal(r.owners.mockExamTaken, 'r2', '得点が入っている最初の記録');
  assert.ok((r.byRecordId['r3'] || []).indexOf('mockExamTaken') === -1, '2件目には付かない');
});

test('APP-440 §6: 削除済みの記録は行動ボーナスの対象にならない', () => {
  const list = [
    boostRec({ id: 'r1', createdAt: 1, deletedAt: 123 }),
    boostRec({ id: 'r2', createdAt: 2 })
  ];
  const r = C.resolveDailyActionBonuses(list);
  assert.equal(r.owners.planAchieved, 'r2');
});

test('APP-440 §6: 日単位のボーナスは未知のキーを黙って無視しない', () => {
  assert.throws(() => C.resolveDailyActionBonuses([boostRec({})], { dayLevelActions: ['unknownKey'] }),
    /未知の行動ボーナス/);
});

test('APP-440 §5 T-4-6: 同じ記録集合からは何度計算しても同じBPが出る', () => {
  const list = [
    boostRec({ id: 'r3', createdAt: 300, actualMin: 60, planMin: 60 }),
    boostRec({ id: 'r1', createdAt: 100, actualMin: 30, planMin: 30, reflection: 'できた' }),
    boostRec({ id: 'r2', createdAt: 200, actualMin: 45, planMin: 45 })
  ];
  const a = C.recalcDayBP(list);
  const b = C.recalcDayBP(list.slice().reverse());
  assert.deepEqual(a, b, '配列順を変えても結果は同じ');
  assert.deepEqual(a.records.map((r) => r.id), ['r1', 'r2', 'r3'], 'bpOrder で並ぶ');
  // 30+50(計画達成)+10(振り返り) + 45 + 60 = 195
  assert.equal(a.totalBP, 195);
});

test('APP-440 §5 T-4-7: 同じ日へ寄せても日次上限1,500BPを超えない', () => {
  // 800分の記録を3件。単純合計なら2,400BPだが上限で止まる。
  const list = [1, 2, 3].map((i) => boostRec({
    id: 'r' + i, createdAt: i, planMin: 700, actualMin: 700
  }));
  const r = C.recalcDayBP(list);
  assert.equal(r.totalBP, C.DAILY_BP_CAP);
  assert.ok(r.records[2].dailyCapped, '上限に当たったことが分かる');
});

test('APP-440 §5 T-4-8: 非受験科目は1日100BPまで', () => {
  const list = [1, 2].map((i) => boostRec({
    id: 'r' + i, createdAt: i, planMin: 90, actualMin: 90
  }));
  const r = C.recalcDayBP(list, { isExamSubjectFor: () => false });
  assert.equal(r.nonExamBP, C.NON_EXAM_DAILY_BP_CAP);
  assert.ok(r.records[0].nonExamCapped);
});

test('APP-440 §5: 再計算は宣言済み時間と初回BP対象時間の両方を守る', () => {
  // 2つの防御は別々に効く。どちらが効いたかを取り違えないよう分けて確認する。
  const byDeclared = C.recalcDayBP([
    // 計画30分のまま実績を90分に編集した。宣言していない60分はBP対象にならない。
    boostRec({ id: 'r1', createdAt: 1, planMin: 30, actualMin: 90 })
  ]);
  assert.equal(byDeclared.records[0].bpMin, 30, 'グラフは90分でもBPは30分ぶん');
  assert.ok(byDeclared.records[0].cappedByDeclared, '宣言済み時間で止まる');
  assert.ok(!byDeclared.records[0].cappedByPrevious, 'ここでは初回上限は効いていない');

  // 延長を含めて90分まで宣言済みだが、初回は30分ぶんで確定していた場合
  const byPrevious = C.recalcDayBP([
    boostRec({ id: 'r1', createdAt: 1, planMin: 60, extendedMin: 30, actualMin: 90, bpMin: 30 })
  ]);
  assert.equal(byPrevious.records[0].bpMin, 30, '増やす編集はBPに反映されない');
  assert.ok(byPrevious.records[0].cappedByPrevious, '初回BP対象時間で止まる');
  assert.ok(!byPrevious.records[0].cappedByDeclared);
});

test('APP-440 §5: 倍率は記録ごとに差し替えられる(装備・アイテムは呼び出し側の責務)', () => {
  const list = [boostRec({ id: 'r1', createdAt: 1, planMin: 10, actualMin: 10 })];
  const r = C.recalcDayBP(list, { multiplierFor: () => 2.5 });
  assert.equal(r.records[0].bp, 25);
  assert.equal(r.records[0].multiplier, 2.5);
});

/* ==================================================================
 * APP-440 段階2: sanitizeState の後方互換処理
 * 設計書 §8「旧データの移行」/ 受入試験 T-6-4
 * ================================================================== */

function oldState(over) {
  return Object.assign({ schemaVersion: 3 }, over);
}

test('APP-440 §8 T-6-4: 旧セッションに segments を新設しない(実績を失わせない)', () => {
  // ここで segments: [] を書くと Array.isArray が新形式と判定し、
  // 区間の合計0分が確認済み実績Cになる。旧セッションの学習時間が消える。
  const s = C.sanitizeState(oldState({
    activeSession: { recordId: 'r1', startTs: T0, pausedAccum: 10 * M }
  }), '2026-08-11');
  assert.ok(!('segments' in s.activeSession), 'フィールドごと未定義のまま');
  assert.equal(s.activeSession.startTs, T0, '従来式に必要な値は保つ');
  assert.equal(s.activeSession.pausedAccum, 10 * M);
});

test('APP-440 §8: 空配列・壊れた配列の segments はフィールドごと落とす', () => {
  // 空配列を保持すると C=0 になる。壊れた配列も同じ。従来式へ倒す。
  [[], [{ from: 'x' }], [{ to: 5 }], [null, 3, 'a'], [{ from: 200, to: 100 }]].forEach((segments) => {
    const s = C.sanitizeState(oldState({
      activeSession: { recordId: 'r1', startTs: T0, segments }
    }), '2026-08-11');
    assert.ok(!('segments' in s.activeSession), JSON.stringify(segments) + ' は落とす');
  });
});

test('APP-440 §8: 妥当な segments はそのまま保つ(to: null は null のまま)', () => {
  const s = C.sanitizeState(oldState({
    activeSession: {
      recordId: 'r1', startTs: T0,
      segments: [{ from: T0, to: T0 + 10 * M }, { from: T0 + 20 * M, to: null }, { from: 'x', to: 1 }]
    }
  }), '2026-08-11');
  assert.equal(s.activeSession.segments.length, 2, '壊れた区間だけ捨てる');
  assert.equal(s.activeSession.segments[1].to, null, '進行中は null のまま。読み込みで時刻を作らない');
});

test('APP-440 §8: 旧記録の bpMin は actualMin と同じ(既存のBPを維持する)', () => {
  const s = C.sanitizeState(oldState({
    records: [{ id: 'r1', date: '2026-08-01', subjectId: 'eng', content: '英単語', planMin: 30, actualMin: 28 }]
  }), '2026-08-11');
  const r = s.records[0];
  assert.equal(r.bpMin, 28, '新しい上限は今後の記録にだけ効く');
  assert.equal(r.extendedMin, 0);
  assert.equal(r.bpMultiplier, 1);
  assert.deepEqual(r.bpActions, []);
});

test('APP-440 §8: 保存済みの bpMin / bpActions は上書きしない', () => {
  const s = C.sanitizeState(oldState({
    records: [{
      id: 'r1', date: '2026-08-01', subjectId: 'eng', content: '英単語',
      planMin: 60, actualMin: 90, extendedMin: 30, bpMin: 45, bpMultiplier: 2.5,
      bpActions: ['planAchieved', 'unknownKey', 123]
    }]
  }), '2026-08-11');
  const r = s.records[0];
  assert.equal(r.bpMin, 45);
  assert.equal(r.extendedMin, 30);
  assert.equal(r.bpMultiplier, 2.5);
  assert.deepEqual(r.bpActions, ['planAchieved'], '未知のキーと非文字列は捨てる');
});

test('APP-440 §5: createdAt を持たない旧記録はIDから作成日時を復元する', () => {
  const ts = 1786400000000;
  const id = 'r' + ts.toString(36) + '7';
  assert.equal(C.createdAtFromId(id), ts);
  // 復元できないIDは0(その日の最古)。例外にしない。
  [null, undefined, 123, '', 'abc', 'r' + (1000).toString(36)].forEach((bad) => {
    assert.equal(C.createdAtFromId(bad), 0, String(bad));
  });
  const s = C.sanitizeState(oldState({
    records: [{ id, date: '2026-08-01', subjectId: 'eng', content: 'x', planMin: 10, actualMin: 10 }]
  }), '2026-08-11');
  assert.equal(s.records[0].createdAt, ts);
});

test('APP-440 §8: 発動中アイテムは有効区間だけ逆算し、消費量を仮定しない', () => {
  const expiresAt = T0 + 20 * M;   // フィーバー(30分)を発動して10分経過した状態
  const s = C.sanitizeState(oldState({
    shop: { activeBoosts: [{ itemId: 'fever_time', expiresAt }] }
  }), '2026-08-11');
  const b = s.shop.activeBoosts[0];
  assert.equal(b.durationMs, 30 * M);
  assert.equal(b.startedAt, expiresAt - 30 * M, '有効区間の開始を expiresAt から逆算');
  assert.equal(b.consumedMs, 0, '過去の消費は仮定しない');

  // consumedMs=0 でも得にはならない。使えるのは移行後の区間と有効区間の重なりだけ。
  const after = C.applyTimedBoost({
    segments: [{ from: T0, to: T0 + 60 * M }],   // 移行後に60分勉強した
    startedAt: b.startedAt, durationMs: b.durationMs, consumedMs: b.consumedMs
  });
  assert.equal(after.boostMinutes, 20, '有効区間の残り20分ぶんだけ');
});

test('APP-440 §8 T-2-14: 期限切れのアイテムは移行で復活しない', () => {
  const expiresAt = T0 - 10 * M;   // 既に期限切れ
  const s = C.sanitizeState(oldState({
    shop: { activeBoosts: [{ itemId: 'energy_drink', expiresAt }] }
  }), '2026-08-11');
  const b = s.shop.activeBoosts[0];
  const r = C.applyTimedBoost({
    segments: [{ from: T0, to: T0 + 60 * M }],   // 期限後に勉強した
    startedAt: b.startedAt, durationMs: b.durationMs, consumedMs: b.consumedMs
  });
  assert.equal(r.boostMinutes, 0, '使える分数は0。移行で復活しない');
});

test('APP-440 §8: 時間で効かないアイテムには有効区間を作らない', () => {
  const s = C.sanitizeState(oldState({
    shop: {
      activeBoosts: [
        { itemId: 'spotlight', expiresAt: T0 },      // その日1日
        { itemId: 'recovery', expiresAt: T0 }        // 連続記録の保険
      ]
    }
  }), '2026-08-11');
  s.shop.activeBoosts.forEach((b) => {
    assert.ok(!('durationMs' in b), b.itemId + ' に持ち時間は無い');
    assert.ok(!('startedAt' in b), b.itemId + ' に有効区間は無い');
  });
  assert.equal(C.consumableDurationMs('spotlight'), 0);
  assert.equal(C.consumableDurationMs('unknown_item'), 0);
});

test('APP-440 §8: 保存済みの startedAt / consumedMs は逆算で上書きしない', () => {
  const s = C.sanitizeState(oldState({
    shop: {
      activeBoosts: [{
        itemId: 'energy_drink', expiresAt: T0 + 60 * M,
        startedAt: T0, durationMs: 60 * M, consumedMs: 25 * M
      }]
    }
  }), '2026-08-11');
  const b = s.shop.activeBoosts[0];
  assert.equal(b.startedAt, T0);
  assert.equal(b.consumedMs, 25 * M, '消費済みの時間を巻き戻さない');
});

test('APP-440 §8: 壊れたデータを読み込んでもBP残高と確定済み記録が変わらない', () => {
  const base = {
    records: [{
      id: 'r1', date: '2026-08-01', subjectId: 'eng', content: '英単語',
      planMin: 30, actualMin: 28, bp: 120
    }],
    shop: { bpBalance: 5000, activeBoosts: [] }
  };
  const clean = C.sanitizeState(oldState(base), '2026-08-11');
  const broken = C.sanitizeState(oldState(Object.assign({}, base, {
    activeSession: { recordId: 'r1', startTs: T0, segments: [{ from: 'x', to: {} }, null] },
    shop: { bpBalance: 5000, activeBoosts: [{ itemId: 'energy_drink', expiresAt: 'x' }] }
  })), '2026-08-11');
  assert.equal(broken.records[0].bp, clean.records[0].bp, '確定済みのBPは動かない');
  assert.equal(broken.shop.bpBalance, clean.shop.bpBalance, '残高も動かない');
  assert.equal(broken.shop.activeBoosts.length, 0, '壊れたアイテムは捨てる');
  assert.ok(!('segments' in broken.activeSession), '壊れた区間で新形式にしない');
});

/* ==================================================================
 * APP-440 段階3: タイマーの自動停止と延長
 * 設計書 §2 / 受入試験 T-1-1〜15
 * ================================================================== */

test('APP-440 §2 T-1-1: 宣言済み時間ちょうどで完了する', () => {
  const p = C.sessionProgress({ startTs: T0, pausedAccum: 0, pausedAt: null }, 60, T0 + 60 * M);
  assert.ok(p.completed);
  assert.equal(p.minutes, 60);
  assert.equal(p.discardedMs, 0);
  assert.equal(p.completedAt, T0 + 60 * M);
});

test('APP-440 §2 T-1-2/T-1-3/T-1-4: 放置しても宣言済み時間しか入らない', () => {
  // 完了画面で何も操作しないまま30分放置(T-1-2)
  const idle = C.sessionProgress({ startTs: T0, pausedAccum: 0 }, 60, T0 + 90 * M);
  assert.equal(idle.minutes, 60, '90分にはならない');
  assert.equal(idle.discardedMs, 30 * M, '超過分は捨てる');

  // アプリを閉じたまま8時間放置して開く(T-1-3)
  const away = C.sessionProgress({ startTs: T0, pausedAccum: 0 }, 60, T0 + 480 * M);
  assert.equal(away.minutes, 60, '480分は記録されない');
  assert.equal(away.completedAt, T0 + 60 * M, '11:00に完了していたと分かる');

  // 日をまたいで放置して開く(T-1-4)
  const nextDay = C.sessionProgress({ startTs: T0, pausedAccum: 0 }, 60, T0 + 23 * 60 * M);
  assert.equal(nextDay.minutes, 60, '日またぎでも宣言済み時間しか入らない');
});

test('APP-440 §2 T-1-5/T-1-6: 延長すると終了予定が伸び、何度でも延長できる', () => {
  // 計画60分 + 延長30分 = 90分
  const ext1 = C.sessionProgress({ startTs: T0, pausedAccum: 0 }, C.declaredMinutes(60, 30), T0 + 90 * M);
  assert.ok(ext1.completed);
  assert.equal(ext1.minutes, 90);

  // さらに15分延長 = 105分。延長前の90分時点では未完了にならない
  const declared = C.declaredMinutes(60, 45);
  assert.equal(declared, 105);
  assert.ok(!C.sessionProgress({ startTs: T0, pausedAccum: 0 }, declared, T0 + 90 * M).completed);
  assert.ok(C.sessionProgress({ startTs: T0, pausedAccum: 0 }, declared, T0 + 105 * M).completed);
});

test('APP-440 §2 T-1-7/T-1-8: 延長は5分刻み・1回60分まで', () => {
  assert.equal(C.roundExtensionMin(65), 60, '65分は60分までしか選べない');
  assert.equal(C.roundExtensionMin(7), 5, '7分は5分に丸める');
  assert.equal(C.roundExtensionMin(14), 10);
  assert.equal(C.roundExtensionMin(60), 60);
  assert.equal(C.roundExtensionMin(5), 5);
  [0, -5, 3, NaN, Infinity, null, undefined, 'x'].forEach((v) => {
    assert.equal(C.roundExtensionMin(v), 0, String(v) + ' は延長にならない');
  });
});

test('APP-440 §2 T-1-13: テスト・模試は延長できない', () => {
  assert.ok(!C.canExtendKind(C.TEST_KIND), 'テストは延長不可');
  ['単語・熟語', '問題演習', '現代文読解', 'その他'].forEach((k) => {
    assert.ok(C.canExtendKind(k), k + ' は延長できる');
  });
});

test('APP-440 §2 T-1-9: 計画より前にやめた場合はその時点まで', () => {
  const p = C.sessionProgress({ startTs: T0, pausedAccum: 0 }, 60, T0 + 45 * M);
  assert.ok(!p.completed);
  assert.equal(p.minutes, 45, '減る方向は素直に通す');
  assert.equal(p.discardedMs, 0);
});

test('APP-440 §2 T-1-10: 一時停止中はカウントが進まない', () => {
  // 10:00開始、10:45に一時停止。11:45に開いても45分のまま。
  const s = { startTs: T0, pausedAccum: 0, pausedAt: T0 + 45 * M };
  assert.equal(C.sessionProgress(s, 60, T0 + 45 * M).minutes, 45);
  assert.equal(C.sessionProgress(s, 60, T0 + 105 * M).minutes, 45, '1時間放置しても増えない');
  assert.ok(!C.sessionProgress(s, 60, T0 + 105 * M).completed, '停止中に完了しない');
  assert.ok(C.sessionProgress(s, 60, T0 + 105 * M).paused);
});

test('APP-440 §2: 休憩を挟んでも宣言済み時間ぶん勉強できる(壁時計で数えない)', () => {
  // 10:00開始・計画60分。10:20-10:50を一時停止(30分)。
  // 壁時計基準なら11:00で完了だが、実際に勉強したのは30分しかない。
  const s = { startTs: T0, pausedAccum: 30 * M, pausedAt: null };
  const at11 = C.sessionProgress(s, 60, T0 + 60 * M);
  assert.equal(at11.minutes, 30, '休憩ぶんは勉強時間に数えない');
  assert.ok(!at11.completed, '11:00ではまだ完了しない');

  // 11:30(=勉強60分)で完了する
  const at1130 = C.sessionProgress(s, 60, T0 + 90 * M);
  assert.ok(at1130.completed);
  assert.equal(at1130.minutes, 60);
  assert.equal(at1130.completedAt, T0 + 90 * M, '休憩ぶん後ろへずれた時刻で完了');
});

test('APP-440 §2: 宣言済み時間が無いセッションは自動停止できない', () => {
  // 計画0分では終わりを決められない。開始そのものを止めるのは呼び出し側の責務。
  const p = C.sessionProgress({ startTs: T0, pausedAccum: 0 }, 0, T0 + 60 * M);
  assert.ok(!p.completed);
  assert.equal(p.declaredMs, 0);
  assert.equal(C.declaredMinutes(0, 0), 0);
  assert.equal(C.declaredMinutes(null, undefined), 0);
  assert.equal(C.declaredMinutes(-10, -5), 0, '負の値は0として扱う');
});

test('APP-440 §2: 時刻が巻き戻っても負の経過にならない', () => {
  const p = C.sessionProgress({ startTs: T0, pausedAccum: 0 }, 60, T0 - 10 * M);
  assert.equal(p.elapsedMs, 0);
  assert.equal(p.minutes, 0);
});

test('APP-440 §2: 端数の分は切り捨てる(水増ししない)', () => {
  const p = C.sessionProgress({ startTs: T0, pausedAccum: 0 }, 60, T0 + 45 * M + 59000);
  assert.equal(p.minutes, 45, '45分59秒は45分');
});

test('APP-440 §2: 明示的に延長した分は達成率の分母に入る', () => {
  // 計画30分を+10分延長して40分やり切った。宣言済みは40分なので達成率100%。
  // 延長を含めないと133%になり、長く勉強したのに計画達成ボーナスを失う。
  assert.ok(C.isPlanAchieved(30, 40, 10), '延長込みなら達成');
  assert.ok(!C.isPlanAchieved(30, 40, 0), '延長していなければ超過扱い');
  assert.ok(C.isPlanAchieved(30, 30, 0), '計画どおりは達成');
  assert.ok(!C.isPlanAchieved(0, 30, 0), '計画が無ければ達成にしない');
});

test('APP-440 §3: rec.bpBoost は読み込みで失われない(消えるとBPが減る)', () => {
  const s = C.sanitizeState({
    schemaVersion: 3,
    records: [{
      id: 'r1', date: '2026-08-01', subjectId: 'eng', content: 'x', planMin: 30, actualMin: 40,
      bpBoost: { timed: [{ itemId: 'energy_drink', minutes: 30 }], dayItemIds: ['spotlight'] }
    }]
  }, '2026-08-11');
  const b = s.records[0].bpBoost;
  assert.deepEqual(b.timed, [{ itemId: 'energy_drink', minutes: 30 }]);
  assert.deepEqual(b.dayItemIds, ['spotlight']);
  assert.equal(C.dayBonusFromBoost(b), 0.5, '倍率は定義から引く');

  // 持っていない記録は null
  assert.equal(C.sanitizeState({
    schemaVersion: 3,
    records: [{ id: 'r2', date: '2026-08-01', subjectId: 'eng', content: 'x', planMin: 30, actualMin: 30 }]
  }, '2026-08-11').records[0].bpBoost, null);
});

test('APP-440 §3: 壊れた bpBoost からはBPを増やせない', () => {
  // 倍率そのものを保存していないので、仕様に無い倍率は原理的に作れない。
  const broken = C.sanitizeBpBoost({
    fever: 999, dayBonus: 99,
    timed: [
      { itemId: 'energy_drink', minutes: 999 },   // 持ち時間(60分)超え → 捨てる
      { itemId: 'fever_time', minutes: 999 },     // 持ち時間(30分)超え → 捨てる
      { itemId: 'unknown_item', minutes: 30 },    // 仕様に無い → 捨てる
      { itemId: 'recovery', minutes: 30 },        // 時間で効かない → 捨てる
      { itemId: 'spotlight', minutes: 30 },       // その日いっぱい。timedではない → 捨てる
      { minutes: 30, bonus: 99 },                 // itemId が無い → 捨てる
      { itemId: 'energy_drink', minutes: -5 },    // 負 → 捨てる
      { itemId: 'energy_drink', minutes: 60 }     // 正当 → 残す
    ],
    dayItemIds: ['spotlight', 'spotlight', 'unknown', 'energy_drink', 'recovery']
  });
  assert.deepEqual(broken.timed, [{ itemId: 'energy_drink', minutes: 60 }], '正当な分だけ残る');
  assert.deepEqual(broken.dayItemIds, ['spotlight', 'spotlight'], '未知のIDだけ捨て、個数は保つ');
  assert.equal(broken.fever, undefined, '倍率を持ち込む項目は残さない');
  assert.equal(broken.dayBonus, undefined);
  assert.equal(C.dayBonusFromBoost(broken), 1.0, '残った2個ぶん。定義どおりの倍率にしかならない');

  // 複数アイテムをまとめた正当な時間は失わない
  const many = C.sanitizeBpBoost({
    timed: [
      { itemId: 'energy_drink', minutes: 30 },
      { itemId: 'energy_drink', minutes: 20 },
      { itemId: 'fever_time', minutes: 30 }
    ]
  });
  assert.equal(many.timed.length, 3, '同じアイテムの複数回ぶんも残す');

  [null, undefined, 'x', 5, [], { timed: 'x' }].forEach((v) => {
    const out = C.sanitizeBpBoost(v);
    assert.ok(out === null || (out.timed.length === 0 && out.dayItemIds.length === 0), String(v));
  });
});

test('APP-440 §3: スポットライトを2個使うと合計+1.0倍のまま保たれる', () => {
  // 同日に複数使える仕様。1消費1要素にしないと、保存・再計算で2個目が消えて損をする。
  const two = C.sanitizeBpBoost({ dayItemIds: ['spotlight', 'spotlight'] });
  assert.deepEqual(two.dayItemIds, ['spotlight', 'spotlight']);
  assert.equal(C.dayBonusFromBoost(two), 1.0, '+0.5 が2つで +1.0');

  // 保存して読み直しても減らない
  const s = C.sanitizeState({
    schemaVersion: 3,
    records: [{
      id: 'r1', date: '2026-08-01', subjectId: 'eng', content: 'x', planMin: 30, actualMin: 30,
      bpBoost: { timed: [], dayItemIds: ['spotlight', 'spotlight'] }
    }]
  }, '2026-08-11');
  assert.equal(C.dayBonusFromBoost(s.records[0].bpBoost), 1.0, '再読み込みでも +1.0');

  // 3個使えば +1.5。ただし最終倍率は composeMultiplier の3.0倍で頭打ち
  const three = C.sanitizeBpBoost({ dayItemIds: ['spotlight', 'spotlight', 'spotlight'] });
  assert.equal(C.dayBonusFromBoost(three), 1.5);
  assert.equal(C.composeMultiplier({ consumableBonus: C.dayBonusFromBoost(three) }).multiplier, 2.5);

  // day 以外のIDは個数に関係なく捨てる
  assert.deepEqual(
    C.sanitizeBpBoost({ dayItemIds: ['energy_drink', 'energy_drink', 'recovery', 'unknown'] }).dayItemIds,
    []);
});

/* ==================================================================
 * APP-440 段階5: ニュースの削除・復元(経路3)
 * 設計書 §4 / 受入試験 T-3
 * 不変条件: どの時点でも、同じ日のBP付きニュースは最大3本
 * ================================================================== */

function news(over) {
  return Object.assign({ id: 'n1', date: '2026-08-11', genreId: 'economy', headline: 'x', bp: 40 }, over);
}

test('APP-440 §4: 上限は総本数ではなくBP付きの本数で数える', () => {
  const list = [
    news({ id: 'n1', bp: 40 }), news({ id: 'n2', bp: 40 }),
    news({ id: 'n3', bp: 0 }),                    // ポイントの付かない記録は枠を埋めない
    news({ id: 'n4', bp: 40, date: '2026-08-10' }) // 別の日
  ];
  assert.equal(C.bpNewsCountForDate(list, '2026-08-11'), 2);
  assert.ok(C.canGrantNewsBp(list, '2026-08-11'), 'あと1本ぶんの枠がある');
});

test('APP-440 §4 T-3-1: 削除でBPが消え、枠が空いて4本目にBPが付く', () => {
  let list = [news({ id: 'n1' }), news({ id: 'n2' }), news({ id: 'n3' })];
  assert.ok(!C.canGrantNewsBp(list, '2026-08-11'), '3本埋まっていれば付かない');

  list = list.filter((n) => n.id !== 'n2');   // 1本削除
  assert.ok(C.canGrantNewsBp(list, '2026-08-11'), '削除で枠が空く');
  list.push(news({ id: 'n4' }));
  assert.equal(C.bpNewsCountForDate(list, '2026-08-11'), 3, 'BP付きは3本のまま');
});

test('APP-440 §4 T-3-2: 枠が埋まっていれば復元してもBPは戻らない', () => {
  // 3本 → 1本削除 → 4本目を追加(枠が埋まる) → 削除した1本を元に戻す
  const list = [news({ id: 'n1' }), news({ id: 'n3' }), news({ id: 'n4' })];
  assert.ok(!C.canGrantNewsBp(list, '2026-08-11'), '枠は埋まっている');
  // 実装は bp: 0 で復活させる
  list.push(news({ id: 'n2', bp: 0 }));
  assert.equal(C.bpNewsCountForDate(list, '2026-08-11'), 3, 'BP付きは3本を超えない');
});

test('APP-440 §4 T-3-3: 枠が空いていればBPごと復活する', () => {
  const list = [news({ id: 'n1' }), news({ id: 'n3' })];   // 1本削除したまま
  assert.ok(C.canGrantNewsBp(list, '2026-08-11'), '枠が空いている');
  list.push(news({ id: 'n2', bp: 40 }));
  assert.equal(C.bpNewsCountForDate(list, '2026-08-11'), 3);
});

test('APP-440 §4 T-3-4: 日が変われば枠は戻る', () => {
  const list = [news({ id: 'n1' }), news({ id: 'n2' }), news({ id: 'n3' })];
  assert.ok(!C.canGrantNewsBp(list, '2026-08-11'));
  assert.ok(C.canGrantNewsBp(list, '2026-08-12'), '新しい日は3本ぶん付く');
});

test('APP-440 §4 T-3-5: 削除→追加→復元を繰り返してもBP付きは3本を超えない', () => {
  let list = [news({ id: 'n1' }), news({ id: 'n2' }), news({ id: 'n3' })];
  for (let i = 0; i < 5; i++) {
    const removed = list[0];
    list = list.slice(1);                                    // 削除
    const added = news({ id: 'add' + i, bp: C.canGrantNewsBp(list, '2026-08-11') ? 40 : 0 });
    list.push(added);                                        // 追加
    const restored = news({ id: removed.id, bp: C.canGrantNewsBp(list, '2026-08-11') ? removed.bp : 0 });
    list.push(restored);                                     // 元に戻す
    assert.ok(C.bpNewsCountForDate(list, '2026-08-11') <= C.NEWS_DAILY_LIMIT,
      i + '回目: BP付きが3本を超えない');
  }
});

test('APP-440 §4 T-3-6: 旧データは移行処理なしで正しく動く', () => {
  // 台帳(dailyNewsBp)を作らない方針なので、旧データにも新フィールドは要らない
  const s = C.sanitizeState({
    schemaVersion: 3,
    news: [
      { id: 'n1', date: '2026-08-11', genreId: 'economy', headline: '円安', bp: 40, createdAt: 1 },
      { id: 'n2', date: '2026-08-11', genreId: 'politics', headline: '法案', bp: 40, createdAt: 2 }
    ]
  }, '2026-08-11');
  assert.equal(s.news.length, 2);
  assert.equal(C.bpNewsCountForDate(s.news, '2026-08-11'), 2, 'BP残高が変わらない');
  assert.ok(C.canGrantNewsBp(s.news, '2026-08-11'), '3本目にはBPが付く');
});

test('APP-440 §4 T-3-7: BPを使い切っていても残高は0で止まり、購入済みは失われない', () => {
  const state = {
    records: [], news: [news({ id: 'n1', bp: 40 })],
    shop: { owned: { costume: ['socks'], skill: [], stage: [], consumable: {} } }
  };
  const before = C.calcBpBalance(state);
  // BP付きニュースを削除する
  state.news = [];
  const after = C.calcBpBalance(state);
  assert.ok(after >= 0, '残高が負にならない');
  assert.ok(after <= before, '削除で増えない');
  assert.deepEqual(state.shop.owned.costume, ['socks'], '購入済みアイテムは失われない');
});
