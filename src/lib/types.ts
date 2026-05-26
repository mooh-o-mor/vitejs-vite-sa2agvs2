export interface Vessel {
  id: number;
  name: string;
  branch: string;
  imo: string;
  show_on_gantt?: boolean;
  photo_url?: string;  // добавляем
}

export interface Contract {
  id: number;
  vesselId: number;
  counterparty: string;
  start: string;
  end: string;
  rate: number;
  mob: number;
  demob: number;
  firmDays: number;
  optionDays: number;
  priority: "contract" | "kp" | "plan";
  contractNumber: string;
  contractDate: string;
  altGroup?: string;
}

export interface FormState {
  counterparty: string;
  start: string;
  end: string;
  rate: string;
  mob: string;
  demob: string;
  firmDays: string;
  optionDays: string;
  priority: "contract" | "kp" | "plan";
  contractNumber: string;
  contractDate: string;
  }

export interface DprSupply {
  type: string;
  amt: string;
  pct: string;
  cons: string;
  lim: string;
  del: string;
}

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

/** Строка из таблицы vessel_dpr — индивидуальные ДПР с судов */
export interface VesselDprRow {
  vessel_name: string;
  branch: string;
  dpr_type: string;
  report_date: string;
  report_time: string | null;
  msg_time: string | null;
  status: string | null;
  coord_raw: string | null;
  lat: number | null;
  lng: number | null;
  fields_json: Record<string, string> | null;
  email_subject: string | null;
  email_from: string | null;
  uploaded_at: string;
  parse_ok: boolean | null;
  // Запасы
  fuel_dt_amt: number | null;
  fuel_dt_cons: number | null;
  fuel_tt_amt: number | null;
  fuel_tt_cons: number | null;
  oil_amt: number | null;
  oil_cons: number | null;
  water_amt: number | null;
  water_cons: number | null;
  // МОРЕ
  weather: string | null;
  course: number | null;
  speed_current: number | null;
  distance_day: number | null;
  eta_place: string | null;
  eta_date: string | null;
  // ПОРТ
  power_source: string | null;
  port_status: string | null;
  // Общее
  crew: string | null;
}

export interface VesselDprMapRow extends DprRow {
  msg_time: string | null;
  parse_ok: boolean | null;
  fields_json: Record<string, string> | null;
  weather: string | null;
  course: number | null;
  speed_current: number | null;
  distance_day: number | null;
  eta_place: string | null;
  eta_date: string | null;
  power_source: string | null;
  port_status: string | null;
  crew: string | null;
  fuel_dt_amt: number | null;
  fuel_dt_cons: number | null;
  fuel_tt_amt: number | null;
  fuel_tt_cons: number | null;
  oil_amt: number | null;
  oil_cons: number | null;
  water_amt: number | null;
  water_cons: number | null;
}

export const YEAR = 2026;
export const yearStart = new Date(YEAR, 0, 1);
export const yearEnd = new Date(YEAR, 11, 31);
export const totalDays = (yearEnd.getTime() - yearStart.getTime()) / 86400000 + 1;
export const typeOrder = ["МФАСС","ТБС","ССН","АСС","НИС","МБС","МВС","МБ","СКБ","ВСП","Баржа"];
export const MONTHS = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
export const ADMIN_PASSWORD = "vjhcgfc";
export const VIEWER_PASSWORD = "mss75";
export const COLORS = [
  "#1D4ED8","#059669","#D97706","#DC2626","#7C3AED",
  "#DB2777","#0891B2","#65A30D","#EA580C","#4F46E5",
  "#0D9488","#E11D48","#9333EA","#16A34A","#CA8A04"
];
export const SPECIAL_COLORS: Record<string,string> = {
  "Ремонт": "#9ca3af",
  "АСГ": "#dc2626"
};
export const T = {
  bg:"#f8fafc", bg2:"#ffffff", bg3:"#f1f5f9",
  border:"#cbd5e1", border2:"#e2e8f0",
  text:"#0f172a", text2:"#475569", text3:"#94a3b8",
  accent:"#1d4ed8", green:"#059669", amber:"#d97706", red:"#dc2626",
  header:"#1e40af",
};
export const PRIORITY_LABELS: Record<string, string> = {
  contract: "Контракт",
  kp: "КП",
  plan: "План",
};
export const PRIORITY_ORDER = ["contract", "kp", "plan"];
