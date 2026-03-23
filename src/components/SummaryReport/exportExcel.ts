import XLSX from "xlsx-js-style";
import { BRANCH_XL, STATUS_XL_BG, STATUS_XL_FG, getSupply, getPower, statusCls } from "./types";
import type { DprRow } from "./types";

export function exportToExcel(vessels: DprRow[], selDate: string, fmtDateRu: (d: string) => string) {
  const wb = XLSX.utils.book_new();
  const headers = ["№ п/п", "Тип", "Название судна", "Филиал", "Статус", "Контракт", "Период работ", "Местоположение судна", "Эл-е", "Примечание", "Топливо ДТ", "Топливо Мазут/ТТ"];
  const colWidths = [6, 8, 30, 10, 12, 32, 28, 28, 6, 35, 12, 12];

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
      font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
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

    aoa.push([
      { v: i + 1, t: "n", s: { fill: rowFill, alignment: { horizontal: "center", ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: "546E7A" } } } },
      { v: "", t: "s", s: { fill: rowFill, alignment: { horizontal: "center", ...wrap }, border: baseBorder, font: { sz: 9, color: { rgb: "546E7A" } } } },
      { v: v.vessel_name, t: "s", s: { fill: rowFill, alignment: { ...wrap }, border: baseBorder, font: { bold: true, sz: 10, color: { rgb: "1A2A3A" } } } },
      { v: v.branch, t: "s", s: { fill: rowFill, alignment: { horizontal: "center", ...wrap }, border: baseBorder, font: { bold: true, sz: 10, color: { rgb: "37474F" } } } },
      { v: v.status, t: "s", s: { fill: statusFill, alignment: {
