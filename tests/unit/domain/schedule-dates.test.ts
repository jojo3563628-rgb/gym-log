import type { ScheduleRule } from '../../../src/data/types';
import { addDaysLocal, isLocalDate, toLocalDate } from '../../../src/domain/dates';
import { findOverlap, monthGrid, resolveGroup, weekdayOf } from '../../../src/domain/schedule';

function rule(p: Partial<ScheduleRule>): ScheduleRule {
  return { id: 'r1', groupId: 'g1', weekdays: [1], startDate: '2026-10-01', endDate: null, createdAt: 1, ...p };
}

describe('dates', () => {
  test('toLocalDate 使用本地時區', () => {
    expect(toLocalDate(new Date(2026, 9, 7, 23, 59))).toBe('2026-10-07');
    expect(toLocalDate(new Date(2026, 9, 8, 0, 1))).toBe('2026-10-08');
  });

  test('isLocalDate 擋掉不存在的日期與錯誤格式', () => {
    expect(isLocalDate('2026-10-07')).toBe(true);
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('2026-1-7')).toBe(false);
    expect(isLocalDate(20261007)).toBe(false);
  });

  test('addDaysLocal 跨月', () => {
    expect(addDaysLocal('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('schedule（SCR-01、SCR-04、Arch D-4）', () => {
  test('weekdayOf：2026-10-07 是週三', () => {
    expect(weekdayOf('2026-10-07')).toBe(3);
  });

  test('依每週規則判定', () => {
    const rules = [rule({ weekdays: [1, 4], groupId: 'push' })];
    expect(resolveGroup('2026-10-05', rules, [])).toBe('push'); // 週一
    expect(resolveGroup('2026-10-08', rules, [])).toBe('push'); // 週四
    expect(resolveGroup('2026-10-07', rules, [])).toBeNull(); // 週三
  });

  test('規則的起訖日', () => {
    const rules = [rule({ weekdays: [1], startDate: '2026-10-06', endDate: '2026-10-19' })];
    expect(resolveGroup('2026-10-05', rules, [])).toBeNull(); // 開始前
    expect(resolveGroup('2026-10-12', rules, [])).toBe('g1');
    expect(resolveGroup('2026-10-19', rules, [])).toBe('g1'); // 結束日當天包含
    expect(resolveGroup('2026-10-26', rules, [])).toBeNull();
  });

  test('單日覆寫優先：改成別的群組或取消', () => {
    const rules = [rule({ weekdays: [1], groupId: 'push' })];
    expect(resolveGroup('2026-10-05', rules, [{ date: '2026-10-05', groupId: 'legs' }])).toBe('legs');
    expect(resolveGroup('2026-10-05', rules, [{ date: '2026-10-05', groupId: null }])).toBeNull();
    // 覆寫只影響當天
    expect(resolveGroup('2026-10-12', rules, [{ date: '2026-10-05', groupId: null }])).toBe('push');
  });

  test('沒有規則的日子也可以用覆寫排一天', () => {
    expect(resolveGroup('2026-10-07', [], [{ date: '2026-10-07', groupId: 'pull' }])).toBe('pull');
  });

  test('資料中萬一有重疊規則，取最晚建立的', () => {
    const rules = [rule({ id: 'a', groupId: 'old', createdAt: 1 }), rule({ id: 'b', groupId: 'new', createdAt: 2 })];
    expect(resolveGroup('2026-10-05', rules, [])).toBe('new');
  });

  test('monthGrid：42 格，從週日開始', () => {
    const g = monthGrid(2026, 10);
    expect(g).toHaveLength(42);
    expect(g[0]).toBe('2026-09-27'); // 2026-10-01 是週四
    expect(weekdayOf(g[0]!)).toBe(0);
    expect(g).toContain('2026-10-31');
  });

  test('findOverlap：同星期且日期區間重疊才算', () => {
    const a = rule({ id: 'a', weekdays: [1, 3] });
    expect(findOverlap(rule({ id: 'b', weekdays: [3] }), [a])).toBe(a);
    expect(findOverlap(rule({ id: 'b', weekdays: [2, 4] }), [a])).toBeNull();
    const ended = rule({ id: 'c', weekdays: [5], startDate: '2026-01-01', endDate: '2026-06-30' });
    expect(findOverlap(rule({ id: 'd', weekdays: [5], startDate: '2026-07-01' }), [ended])).toBeNull();
    expect(findOverlap(rule({ id: 'd', weekdays: [5], startDate: '2026-06-30' }), [ended])).toBe(ended);
  });

  test('findOverlap 不和自己比', () => {
    const a = rule({ id: 'a' });
    expect(findOverlap(a, [a])).toBeNull();
  });
});
