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
 * APP-470: ポイントの日別集計(グラフ用)
 * ================================================================== */

test('buildBpSeries: 学習とニュースのBPを日ごとに分けて集計し、累積も返す', () => {
  const recs = [
    { id: 'a', date: '2026-08-08', subjectId: 'eng', bp: 300, actualMin: 60, planMin: 60, deletedAt: null },
    { id: 'b', date: '2026-08-09', subjectId: 'math', bp: 500, actualMin: 90, planMin: 90, deletedAt: null }
  ];
  const news = [{ id: 'n1', date: '2026-08-09', bp: 60 }];
  const s = C.buildBpSeries(recs, news, '2026-08-08', 3);
  assert.equal(s.length, 3);
  assert.deepEqual(s[0], { date: '2026-08-08', study: 300, news: 0, total: 300, cum: 300 });
  assert.deepEqual(s[1], { date: '2026-08-09', study: 500, news: 60, total: 560, cum: 860 });
  assert.deepEqual(s[2], { date: '2026-08-10', study: 0, news: 0, total: 0, cum: 860 },
    '記録が無い日も0として並ぶ(累積は減らない)');
});

test('buildBpSeries: 削除済みの記録は集計しない', () => {
  const recs = [
    { id: 'a', date: '2026-08-08', subjectId: 'eng', bp: 300, actualMin: 60, planMin: 60, deletedAt: null },
    { id: 'b', date: '2026-08-08', subjectId: 'eng', bp: 999, actualMin: 60, planMin: 60, deletedAt: 12345 }
  ];
  const s = C.buildBpSeries(recs, [], '2026-08-08', 1);
  assert.equal(s[0].study, 300, '削除済みの999は入らない');
});

test('buildBpSeries: 期間外・不正な日付・BPなしは無視する', () => {
  const recs = [
    { id: 'a', date: '2026-07-01', subjectId: 'eng', bp: 500, actualMin: 60, planMin: 60, deletedAt: null },
    { id: 'b', date: 'こわれた', subjectId: 'eng', bp: 500, actualMin: 60, planMin: 60, deletedAt: null },
    { id: 'c', date: '2026-08-08', subjectId: 'eng', bp: 0, actualMin: 60, planMin: 60, deletedAt: null }
  ];
  const s = C.buildBpSeries(recs, [{ id: 'n', date: null, bp: 60 }], '2026-08-08', 2);
  assert.equal(s[0].total, 0);
  assert.equal(s[1].total, 0);
});

test('summarizeBp: 合計・内訳・最高の1日・記録した日の平均を返す', () => {
  const s = C.buildBpSeries(
    [{ id: 'a', date: '2026-08-08', subjectId: 'eng', bp: 300, actualMin: 60, planMin: 60, deletedAt: null },
     { id: 'b', date: '2026-08-10', subjectId: 'eng', bp: 500, actualMin: 60, planMin: 60, deletedAt: null }],
    [{ id: 'n', date: '2026-08-10', bp: 60 }], '2026-08-08', 3);
  const sum = C.summarizeBp(s);
  assert.equal(sum.studyTotal, 800);
  assert.equal(sum.newsTotal, 60);
  assert.equal(sum.total, 860);
  assert.equal(sum.best, 560);
  assert.equal(sum.bestDate, '2026-08-10');
  assert.equal(sum.activeDays, 2, '獲得が0の日は数えない');
  assert.equal(sum.average, 430, '860 / 2日');
  assert.equal(sum.cum, 860);
});

test('summarizeBp: 記録がゼロでも0で割らない', () => {
  const sum = C.summarizeBp(C.buildBpSeries([], [], '2026-08-08', 3));
  assert.equal(sum.total, 0);
  assert.equal(sum.average, 0);
  assert.equal(sum.bestDate, null);
});
