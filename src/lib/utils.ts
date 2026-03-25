export function getType(name: string, order: string[]): string {
  const upper = name.toUpperCase().trim();
  for (const t of order) {
    if (upper.startsWith(t)) {
      return t;
    }
  }
  if (upper.includes("АСС")) return "АСС";
  if (upper.includes("БП")) return "БП";
  return "";
}

// Форматирует название судна: первая буква каждого словазаглавная
export function formatVesselName(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    )
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

// Для легенды — только то, что до скобки
export function cpShortKey(s: string): string {
  if (!s) return "";
  const bracketIndex = s.indexOf('(');
  if (bracketIndex > 0) {
    return s.slice(0, bracketIndex).trim();
  }
  return s;
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
