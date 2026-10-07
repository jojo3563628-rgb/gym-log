import { addDays } from 'date-fns';
import type { Id, LocalDate, ScheduleOverride, ScheduleRule } from '../data/types';
import { fromLocalDate, toLocalDate } from './dates';

export function weekdayOf(date: LocalDate): number {
  return fromLocalDate(date).getDay();
}

function ruleCovers(rule: ScheduleRule, date: LocalDate): boolean {
  return (
    rule.weekdays.includes(weekdayOf(date)) &&
    rule.startDate <= date &&
    (rule.endDate === null || date <= rule.endDate)
  );
}

export function resolveGroup(
  date: LocalDate,
  rules: ScheduleRule[],
  overrides: ScheduleOverride[],
): Id | null {
  const override = overrides.find((o) => o.date === date);
  if (override) return override.groupId;
  // 正常情況 UI 會擋重疊；萬一資料仍有重疊，取最晚建立的規則
  let best: ScheduleRule | undefined;
  for (const r of rules) {
    if (ruleCovers(r, date) && (!best || r.createdAt > best.createdAt)) best = r;
  }
  return best?.groupId ?? null;
}

/** month 為 1–12；回傳 6 列 × 7 天，從週日開始 */
export function monthGrid(year: number, month: number): LocalDate[] {
  const first = new Date(year, month - 1, 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => toLocalDate(addDays(start, i)));
}

function rangesOverlap(a: ScheduleRule, b: ScheduleRule): boolean {
  const aEnd = a.endDate ?? '9999-12-31';
  const bEnd = b.endDate ?? '9999-12-31';
  return a.startDate <= bEnd && b.startDate <= aEnd;
}

export function findOverlap(rule: ScheduleRule, others: ScheduleRule[]): ScheduleRule | null {
  return (
    others.find(
      (o) => o.id !== rule.id && o.weekdays.some((d) => rule.weekdays.includes(d)) && rangesOverlap(rule, o),
    ) ?? null
  );
}
