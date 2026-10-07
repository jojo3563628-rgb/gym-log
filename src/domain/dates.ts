import { addDays, format, isValid, parse, subMonths } from 'date-fns';
import type { LocalDate } from '../data/types';

const PATTERN = 'yyyy-MM-dd';

// 一律用手機本地時區，避免 UTC 換算讓凌晨的紀錄跑到前一天（Arch D-2）
export function toLocalDate(d: Date): LocalDate {
  return format(d, PATTERN);
}

export function fromLocalDate(s: LocalDate): Date {
  return parse(s, PATTERN, new Date(2000, 0, 1));
}

export function todayLocal(now: Date = new Date()): LocalDate {
  return toLocalDate(now);
}

export function addDaysLocal(s: LocalDate, n: number): LocalDate {
  return toLocalDate(addDays(fromLocalDate(s), n));
}

export function subMonthsLocal(s: LocalDate, n: number): LocalDate {
  return toLocalDate(subMonths(fromLocalDate(s), n));
}

export function isLocalDate(v: unknown): v is LocalDate {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = fromLocalDate(v);
  // 擋掉 2026-02-30 這類會被自動進位的日期
  return isValid(d) && toLocalDate(d) === v;
}
