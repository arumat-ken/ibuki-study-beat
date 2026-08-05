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
