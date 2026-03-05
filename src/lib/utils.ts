import { yearStart, yearEnd, totalDays } from "./types";

export function getType(name: string, typeOrder: string[]) {
  for (const t of typeOrder) if (name.startsWith(t)) return t;
  return "Другие";
}

export function cpKey(cp: string) {
  return cp.replace(/\s*\(.*$/g, "").trim();
}

export function dayOffset(dateStr: string) {
  const d = new Date(dateStr);
  return Math.max(0, Math.min((d.getTime() - yearStart.getTime()) / 86400000, totalDays));
}

export function contractDaysGantt(start: string, end: string) {
  const s = new Date(Math.max(new Date(start).getTime(), yearStart.getTime()));
  const e = new Date(Math.min(new Date(end).getTime(), yearEnd.getTime()));
  return Math.max(0, (e.getTime() - s.getTime()) / 86400000 + 1);
}

export function contractDays(start: string, end: string) {
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 86400000 + 1);
}

export function fmoney(n: number) {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
}

export function fdate(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

export function formatInput(val: string): string {
  const digits = val.replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("ru-RU").format(Number(digits));
}

export function unformat(val: string): string {
  return val.replace(/\D/g, "");
}

export function addDays(dateStr: string, days: number): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days - 1);
  return d.toISOString().split("T")[0];
}
