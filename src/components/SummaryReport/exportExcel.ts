import XLSX from "xlsx-js-style";
import { BRANCH_XL, STATUS_XL_BG, STATUS_XL_FG, statusCls, getPower } from "./types";
import type { DprRow } from "./types";
import { formatVesselName, formatVesselType } from "../../lib/utils";
import { extractLocation } from "../../lib/locationNormalizer";

function formatSupplyAmt(supplies: any[], keyword: string): string {
  if (!supplies || !Array.isArray(supplies)) return "";
  const s = supplies.find(x => x.type && x.type.toLowerCase().includes(keyword.toLowerCase()));
  if (!s || !s.amt || s.amt === "—") return "";
  const pctNum = s.pct ? parseFloat(s.pct.replace(",", ".")) : NaN;
  const pct = (!isNaN(pctNum) && pctNum >= 0)
    ? ` (${(pctNum > 100 ? pctNum / 1000 : pctNum).toFixed(1)}%)`
    : "";
  return `${s.amt}${pct}`;
}

function formatSupplyCons(supplies: any[], keyword: string): string {
  if (!supplies || !Array.isArray(supplies)) return "";
  const s = supplies.find(x => x.type && x.type.toLowerCase().includes(keyword.toLowerCase()));
  if (!s) return "";
  return s.cons && s.cons !== "—" ? s.cons : "0";
}

export function exportToExcel(
  vessels: DprRow[],
  selDate: string,
  fmtDateRu: (d: string) => string,
  getVesselType: (name: string) => string
) {
  const wb = XLSX.utils.book_new();
  const headers = ["№ п/п", "Тип", "Название судна", "Филиал", "Статус", "Контракт", "Период работ", "Местоположение судна", "Эл-е", "Примечание", "Топливо", "Расход"];
  const colWidths = [6, 10, 32, 12, 14, 35, 35, 35, 8, 35, 22, 18];

  const aoa: any[][] = [];

  aoa.push([{ v: "Сводная таблица судов МСС", t: "s", s: {
    font: { bold: true, sz: 16, color: { rgb: "1A2A3A" } },
    alignment: { horizontal: "center", vertical: "center" },
  }}]);

  aoa.push([{ v: `на ${fmtDateRu(selDate)}`, t: "s", s: {
    font: { bold: true, sz: 12, color: { rgb: "546E7A" } },
    alignment: { horizontal: "center", vertical: "center" },
  }}]);

  const headerRow = headers.map((h) => ({
    v: h, t: "s",
    s: {
      font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "37474F" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "90A4AE" } },
        bottom: { style: "thin", color: { rgb: "90A4AE" } },
        left: { style: "thin", color: { rgb: "90A4AE" } },
        right: { style: "thin", color: { rgb: "90A4AE" } },
      },
    },
  }));
  aoa.push(headerRow);

  vessels.forEach((v, i) => {
    const sc = statusCls(v.status);
    const brXl = BRANCH_XL[v.branch] || "FFFFFF";
    const power = getPower(v.coord_raw);
    const vesselType = getVesselType(v.vessel_name);
    const formattedType = formatVesselType(vesselType);
    const formattedName = formatVesselName(v.vessel_name);
    const coordDisplay = extractLocation(v.coord_raw || "");

    const baseBorder = {
      top: { style: "thin" as const, color: { rgb: "CFD8DC" } },
      bottom: { style: "thin" as const, color: { rgb: "CFD8DC" } },
      left: { style: "thin" as const, color: { rgb: "CFD8DC" } },
      right: { style: "thin" as const, color: { rgb: "CFD8DC" } },
    };

    const rowFill = { fgColor: { rgb: brXl } };
    const wrap = { wrapText: true, vertical: "center" as const };
    const statusFill = { fgColor: { rgb: STATUS_XL_BG[sc] || "FFFFFF" } };
    const statusFont = { bold: true, sz: 10, color: { rgb: STATUS_XL_FG[sc] || "424242" } };

// Топливо: ДТ и ТТ в одной ячейке двумя строками
const dtAmt = formatSupplyAmt(v.supplies, "ДТ");
const ttAmtRaw = formatSupplyAmt(v.supplies, "Мазут") || formatSupplyAmt(v.supplies, "ТТ");
const ttHasAmt = Boolean(ttAmtRaw) && !/^0[\s(%]|^0$/.test(ttAmtRaw.trim());
const fuelCell = [dtAmt, ttHasAmt ? ttAmtRaw : ""].filter(Boolean).join("\n") || "";

// Расход: ДТ и ТТ в одной ячейке двумя строками
const dtCons = formatSupplyCons(v.supplies, "ДТ");
const ttConsRaw = formatSupplyCons(v.supplies, "Мазут") || formatSupplyCons(v.supplies, "ТТ");
const consCell = [dtCons, ttHasAmt ? ttConsRaw : ""].filter(Boolean).join("\n") || "";
    
    aoa.push([
      { v: i + 1, t: "n", s: { fill: rowFill, alignment: { horizontal: "center", ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: "546E7A" } } } },
      { v: formattedType, t: "s", s: { fill: rowFill, alignment: { horizontal: "center", ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: "1A2A3A" }, bold: true } } },
      { v: formattedName, t: "s", s: { fill: rowFill, alignment: { ...wrap }, border: baseBorder, font: { bold: true, sz: 11, color: { rgb: "1A2A3A" } } } },
      { v: v.branch, t: "s", s: { fill: rowFill, alignment: { horizontal: "center", ...wrap }, border: baseBorder, font: { bold: true, sz: 10, color: { rgb: "37474F" } } } },
      { v: v.status, t: "s", s: { fill: statusFill, alignment: { ...wrap }, border: baseBorder, font: statusFont } },
      { v: v.contract_info || "", t: "s", s: { fill: rowFill, alignment: { ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: "37474F" } } } },
      { v: v.work_period || "", t: "s", s: { fill: rowFill, alignment: { ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: "37474F" } } } },
      { v: coordDisplay, t: "s", s: { fill: rowFill, alignment: { ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: "37474F" } } } },
      { v: power, t: "s", s: { fill: rowFill, alignment: { horizontal: "center", ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: power === "БЭП" ? "1565C0" : power === "СЭП" ? "2E7D32" : "CCCCCC" }, bold: true } } },
      { v: v.note || "", t: "s", s: { fill: rowFill, alignment: { ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: "546E7A" } } } },
      { v: fuelCell, t: "s", s: { fill: rowFill, alignment: { ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: "1A2A3A" } } } },
      { v: consCell, t: "s", s: { fill: rowFill, alignment: { horizontal: "right", ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: "C07800" } } } },
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
  ];
  ws["!cols"] = colWidths.map((w) => ({ wch: w }));
  ws["!rows"] = [{ hpt: 30 }, { hpt: 20 }, { hpt: 36 }];

  XLSX.utils.book_append_sheet(wb, ws, "Сводная");
  XLSX.writeFile(wb, `Сводная_МСС_${selDate}.xlsx`);
}
