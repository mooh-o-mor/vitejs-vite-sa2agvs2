import type { DprSupply } from "../../lib/parseDpr";

// ── DprRow ──
export interface DprRow {
  id: number;
  vessel_name: string;
  branch: string;
  report_date: string;
  status: string;
  coord_raw: string;
  lat: number | null;
  lng: number | null;
  note: string;
  supplies: DprSupply[];
  contract_info?: string;
  work_period?: string;
}

// ── Статусы ──
export function statusCls(stat: string): "asg" | "asd" | "rem" | "oth" {
  const s = (stat || "").toUpperCase();
  if (s.startsWith("АСГ")) return "asg";
  if (s.startsWith("АСД")) return "asd";
  if (s.startsWith("РЕМ") || s.includes("РЕМОНТ") || s.includes("ОСВИДЕТ")) return "rem";
  return "oth";
}

export function shortStatus(stat: string): string {
  const s = (stat || "").toUpperCase();
  if (s.startsWith("АСГ")) return "АСГ";
  if (s.startsWith("АСД")) return "АСД";
  if (s.startsWith("РЕМ")) return "РЕМ";
  return stat;
}

export const STATUS_BG: Record<string, string> = {
  asg: "#FFCDD2", asd: "#C8E6C9", rem: "#F5F5F5", oth: "#F5F5F5",
};

export const STATUS_COLOR: Record<string, string> = {
  asg: "#C62828", asd: "#1B5E20", rem: "#424242", oth: "#616161",
};

export const STATUS_XL_BG: Record<string, string> = {
  asg: "FFCDD2", asd: "C8E6C9", rem: "F5F5F5", oth: "F5F5F5",
};

export const STATUS_XL_FG: Record<string, string> = {
  asg: "C62828", asd: "1B5E20", rem: "424242", oth: "616161",
};

// ── Филиалы ──
const BRANCH_COLORS: Record<string, string> = {
  "АЧФ": "#FFF3E0", "БЛТФ": "#E3F2FD", "КСПФ": "#F3E5F5",
  "СВРФ": "#E8F5E9", "ПРМФ": "#FFF9C4", "СХЛФ": "#FCE4EC",
  "КМЧФ": "#E0F7FA",
};

export const BRANCH_XL: Record<string, string> = {
  "АЧФ": "FFF3E0", "БЛТФ": "E3F2FD", "КСПФ": "F3E5F5",
  "СВРФ": "E8F5E9", "ПРМФ": "FFF9C4", "СХЛФ": "FCE4EC",
  "КМЧФ": "E0F7FA",
};

const BRANCHES_ORDER = ["АЧФ", "БЛТФ", "КСПФ", "СВРФ", "ПРМФ", "СХЛФ", "КМЧФ"];

export function branchOrder(b: string): number {
  const idx = BRANCHES_ORDER.findIndex(x => b?.toUpperCase().includes(x.toUpperCase()));
  return idx >= 0 ? idx : 99;
}

export function branchBg(b: string): string {
  return BRANCH_COLORS[b] || "#FFFFFF";
}

// ── Запасы ──
export function getSupply(supplies: DprSupply[], keyword: string): string {
  if (!supplies || !Array.isArray(supplies)) return "";
  const s = supplies.find(x => x.type && x.type.toLowerCase().includes(keyword.toLowerCase()));
  return s ? s.amt : "";
}

// ── Электропитание ──
export function getPower(coordRaw: string): string {
  const m = /(БЭП|СЭП)/i.exec(coordRaw || "");
  if (!m) return "";
  return m[1].toUpperCase();
}
