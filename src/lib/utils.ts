import { FLEET_TYPES, VESSEL_NAME_ALIASES } from "./fleetTypes";

const BRANCH_NORMALIZATION: Record<string, string> = {
  "СЕВФ": "СВРФ",
  "БФ": "БЛТФ",
  "ПРИМФ": "ПРМФ",
  "САХФ": "СХЛФ",
};

export function getType(name: string, order: string[]): string {
  const upper = name.toUpperCase().trim();
  for (const t of order) {
    if (upper.startsWith(t)) {
      return t;
    }
  }
  if (upper.includes("АСС")) return "АСС";
  if (upper.includes("СКБ")) return "СКБ";
  return "";
}

/** Реестровый тип судна из fleet.xlsx (lowercase).
 *  Принимает имя как с типом, так и без — стрипает ДИСПЕТЧЕРСКИЙ префикс перед поиском.
 */
export function getFleetType(vesselName: string): string {
  if (!vesselName) return "";
  // Убираем диспетчерский тип-префикс если он есть
  let key = vesselName
    .replace(/^(мфасс|тбс|ссн|асс|нис|мбс|мвс|мб|скб|всп|ппб|сбс|рвк|б\/с|с\/б|вс|асптр|мсс|пкс|мтб|гс|кп)\s+/i, "")
    .trim()
    .toLowerCase();
  // Применяем алиасы (латиница → кириллица и пр.)
  key = VESSEL_NAME_ALIASES[key] ?? key;
  return FLEET_TYPES[key] ?? "";
}

export function normalizeBranch(branch: string): string {
  const value = String(branch || "").trim().toUpperCase();
  if (!value) return "";
  return BRANCH_NORMALIZATION[value] ?? value;
}
// Форматирует название судна: первая буква каждого слова заглавная
export function formatVesselName(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Форматирует тип судна: все буквы заглавные
export function formatVesselType(type: string): string {
  if (!type) return "";
  return type.toUpperCase();
}

export function cpKey(s: string) {
  if (!s) return "";
  const clean = s.replace(/[^а-яА-Яa-zA-Z0-9]/g, "");
  if (clean.includes("Ремонт")) return "Ремонт";
  if (clean.includes("АСГ")) return "АСГ";
  return clean;
}

export function cpShortKey(cp: string): string {
  if (!cp) return "";
  const clean = cp.replace(/[^а-яА-Яa-zA-Z0-9]/g, "");
  if (clean.includes("Ремонт")) return "Ремонт";
  if (clean.includes("АСГ")) return "АСГ";
  const bracketIndex = cp.indexOf('(');
  if (bracketIndex > 0) {
    return cp.slice(0, bracketIndex).trim();
  }
  return cp;
}

// Определение типа электропитания (устойчив к опечаткам)
export function getPower(coordRaw: string): string {
  if (!coordRaw) return "";
  // Ищем БЭП, СЭП или CЭП (латинская C) в любом месте строки
  const m = /[БСC]ЭП/i.exec(coordRaw);
  if (!m) return "";
  const power = m[0].toUpperCase();
  if (power === "БЭП" || power === "CЭП") return "БЭП";
  return "СЭП";
}

export function dayOffset(d: string) {
  const start = new Date(new Date().getFullYear(), 0, 1);
  const date = new Date(d);
  return Math.floor((date.getTime() - start.getTime()) / 86400000);
}

export function contractDays(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.floor((e.getTime() - s.getTime()) / 86400000) + 1);
}

export function contractDaysGantt(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.floor((e.getTime() - s.getTime()) / 86400000) + 1);
}

export function fdate(d: string) {
  const date = new Date(d);
  return date.toLocaleDateString("ru-RU");
}

export function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function fmoney(n: number) {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
}

export function formatInput(v: string) {
  if (!v) return "";
  const num = Number(v);
  if (isNaN(num)) return v;
  return new Intl.NumberFormat("ru-RU").format(num);
}

export function unformat(v: string) {
  return v.replace(/\s/g, "");
}
