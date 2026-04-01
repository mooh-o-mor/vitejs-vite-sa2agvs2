export interface DprRow {
  vessel_name: string;
  branch: string;
  status: string;
  coord_raw: string;
  contract_info?: string;
  work_period?: string;
  note?: string;
  supplies?: any;
}

export const STATUS_BG: Record<string, string> = {
  asg: "#e8f5e9",
  asd: "#fff3e0",
  rem: "#ffebee",
};

export const STATUS_COLOR: Record<string, string> = {
  asg: "#2e7d32",
  asd: "#ed6c02",
  rem: "#d32f2f",
};

export const branchBg = (branch: string) => {
  const colors: Record<string, string> = {
    "Мурманск": "#f3f7fc",
    "Архангельск": "#fef9e6",
    "Астрахань": "#eef5ea",
  };
  return colors[branch] || "#ffffff";
};

export const getSupply = (supplies: any, type: string) => {
  if (!supplies || !Array.isArray(supplies)) return "";
  const item = supplies.find((s: any) => s.type === type);
  return item ? item.value : "";
};

export const shortStatus = (status: string) => {
  if (status.includes("АСГ")) return "АСГ";
  if (status.includes("АСД")) return "АСД";
  if (status.includes("РЕМ")) return "РЕМ";
  return status;
};

export const statusCls = (status: string) => {
  if (status.includes("АСГ")) return "asg";
  if (status.includes("АСД")) return "asd";
  if (status.includes("РЕМ")) return "rem";
  return "asg";
};

export const getPower = (coord: string) => {
  if (!coord) return "";
  if (coord.includes("БЭП")) return "БЭП";
  if (coord.includes("СЭП")) return "СЭП";
  return "";
};

export const branchOrder = (branch: string) => {
  const order: Record<string, number> = {
    "Мурманск": 1,
    "Архангельск": 2,
    "Астрахань": 3,
  };
  return order[branch] || 999;
};
