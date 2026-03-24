import { typeOrder } from "./types";

export function getType(name: string, order: string[] = typeOrder): string {
  const upper = name.toUpperCase().trim();
  for (const t of order) {
    if (upper.startsWith(t)) {
      return t;
    }
  }
  return "";
}

export function cpKey(counterparty: string): string {
  if (!counterparty) return "";
  const c = counterparty.trim();
  if (c.includes("Ремонт")) return "Ремонт";
  if (c.includes("АСГ")) return "АСГ";
  return c;
}

export function dayOffset(dateStr: string): number {
  const d = new Date(dateStr);
  const start = new Date(2026, 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

export function contractDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

export function contractDaysGantt(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
}

export function fdate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}.${d.getMonth() + 1}`;
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function fmoney(n: number): string {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
}

export function formatInput(v: string): string {
  const n = parseInt(v);
  if (isNaN(n)) return v;
  return new Intl.NumberFormat("ru-RU").format(n);
}

export function unformat(v: string): string {
  return v.replace(/\s/g, "");
}
