import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";
import { T } from "../lib/types";
import type { DprSupply } from "../lib/parseDpr";

interface DprRow {
  vessel_name: string;
  branch: string;
  status: string;
  coord_raw: string;
  note: string;
  supplies: DprSupply[];
}

/* ── Helpers ── */
function getSupply(supplies: DprSupply[], keyword: string): string {
  if (!supplies || !Array.isArray(supplies)) return "";
  const s = supplies.find(
    (x) => x.type && x.type.toLowerCase().includes(keyword.toLowerCase())
  );
  return s ? s.amt : "";
}

function shortStatus(stat: string): string {
  const s = stat.toUpperCase();
  if (s.startsWith("АСГ")) return "АСГ";
  if (s.startsWith("АСД")) return "АСД";
  if (s.includes("РЕМОНТ") || s.startsWith("РЕМ") || s.includes("ОСВИДЕТ") || s.includes("НЕТ В ГРАФИКЕ")) return "РЕМ";
  if (s.includes("ВОССТАНОВЛЕН")) return "РЕМ";
  if (s.includes("ОФОРМЛЕН")) return "РЕМ";
  return stat;
}

function statusCls(stat: string): "asg" | "asd" | "rem" | "oth" {
  const s = stat.toUpperCase();
  if (s.startsWith("АСГ")) return "asg";
  if (s.startsWith("АСД")) return "asd";
  if (s.includes("РЕМОНТ") || s.startsWith("РЕМ") || s.includes("ОСВИДЕТ") || s.includes("НЕТ В ГРАФИКЕ") || s.includes("ВОССТАНОВЛЕН") || s.includes("ОФОРМЛЕН")) return "rem";
  return "oth";
}

/* ── Branch colors (pastel, distinct per branch) ── */
const BRANCH_COLORS: Record<string, string> = {
  "АЧФ":  "#FFF3E0",  // warm orange
  "АЗЧФ": "#FFF3E0",
  "БЛТФ": "#E3F2FD",  // light blue
  "БФ":   "#E3F2FD",
  "КСПФ": "#F3E5F5",  // light purple
  "СВРФ": "#E8F5E9",  // light green
  "СевФ": "#E8F5E9",
  "ПРМФ": "#FFF9C4",  // light yellow
  "ПримФ":"#FFF9C4",
  "СХЛФ": "#FCE4EC",  // light pink
  "СахФ": "#FCE4EC",
  "КМЧФ": "#E0F7FA",  // light cyan
  "АРХФ": "#F1F8E9",  // light lime
};

const STATUS_BG = {
  asg: "#FFCDD2",  // red tint
  asd: "#C8E6C9",  // green tint
  rem: "#F5F5F5",  // grey
  oth: "#F5F5F5",
};
const STATUS_COLOR = {
  asg: "#C62828",
  asd: "#1B5E20",
  rem: "#424242",
  oth: "#616161",
};

const BRANCHES_ORDER = ["АЧФ", "АЗЧФ", "БЛТФ", "БФ", "КСПФ", "СВРФ", "СевФ", "ПРМФ", "ПримФ", "СХЛФ", "СахФ", "КМЧФ", "АРХФ"];

function branchOrder(b: string): number {
  const idx = BRANCHES_ORDER.findIndex((x) => b.toUpperCase().includes(x.toUpperCase()));
  return idx >= 0 ? idx : 99;
}

function branchBg(b: string): string {
  return BRANCH_COLORS[b] || "#FFFFFF";
}

/* ── Component ── */
export function SummaryReport({ isAdmin }: { isAdmin: boolean }) {
  const [dates, setDates] = useState<string[]>([]);
  const [selDate, setSelDate] = useState("");
  const [vessels, setVessels] = useState<DprRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBranch, setFilterBranch] = useState("Все");

  useEffect(() => { loadDates(); }, []);

  async function loadDates() {
    const { data } = await supabase
      .from("dpr_entries")
      .select("report_date")
      .order("report_date", { ascending: false });
    if (data) {
      const unique = [...new Set(data.map((r: any) => r.report_date))];
      setDates(unique);
      if (unique.length > 0) setSelDate(unique[0]);
    }
    setLoading(false);
  }

  useEffect(() => { if (selDate) loadVessels(selDate); }, [selDate]);

  async function loadVessels(date: string) {
    setLoading(true);
    const { data } = await supabase
      .from("dpr_entries")
      .select("*")
      .eq("report_date", date)
      .order("vessel_name");
    setVessels(data || []);
    setLoading(false);
  }

  const fmtDateRu = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}.${m}.${y}`;
  };

  const branches = ["Все", ...Array.from(new Set(vessels.map((v) => v.branch).filter(Boolean))).sort((a, b) => branchOrder(a) - branchOrder(b))];

  const filtered = vessels
    .filter((v) => filterBranch === "Все" || v.branch === filterBranch)
    .sort((a, b) => {
      const bo = branchOrder(a.branch) - branchOrder(b.branch);
      if (bo !== 0) return bo;
      return a.vessel_name.localeCompare(b.vessel_name, "ru");
    });

  const cAsg = filtered.filter((v) => statusCls(v.status) === "asg").length;
  const cAsd = filtered.filter((v) => statusCls(v.status) === "asd").length;
  const cRem = filtered.filter((v) => statusCls(v.status) === "rem").length;

  function exportXlsx() {
    const header = ["№", "Название судна", "Филиал", "Статус", "Местоположение", "Примечание", "Топливо ДТ", "Топливо Мазут/ТТ", "Масло", "Вода", "Продукты"];
    const rows = filtered.map((v, i) => [
      i + 1, v.vessel_name, v.branch, v.status, v.coord_raw || "", v.note || "",
      getSupply(v.supplies, "ДТ"), getSupply(v.supplies, "Мазут") || getSupply(v.supplies, "ТТ"),
      getSupply(v.supplies, "Масло"), getSupply(v.supplies, "Вода"), getSupply(v.supplies, "Продукт"),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([
      [`Сводная таблица судов МСС на ${fmtDateRu(selDate)}`], [], header, ...rows,
    ]);
    ws["!cols"] = [{ wch: 4 }, { wch: 30 }, { wch: 10 }, { wch: 25 }, { wch: 30 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Сводная");
    XLSX.writeFile(wb, `Сводная_МСС_${selDate}.xlsx`);
  }

  const thStyle: React.CSSProperties = {
    padding: "8px 8px", textAlign: "center", fontSize: 11, fontWeight: 700,
    color: "#1a2a3a", borderBottom: "2px solid #90a4ae", borderRight: "1px solid #cfd8dc",
    whiteSpace: "nowrap", position: "sticky", top: 0, background: "#ECEFF1", zIndex: 1,
  };

  const tdBase: React.CSSProperties = {
    padding: "5px 8px", fontSize: 12, borderBottom: "1px solid #cfd8dc",
    borderRight: "1px solid #e8eaed", verticalAlign: "top",
  };

  const fbtn = (active: boolean, color?: string): React.CSSProperties => ({
    padding: "4px 12px", borderRadius: 20, border: "1px solid",
    cursor: "pointer", fontSize: 11, fontWeight: 600,
    borderColor: active ? (color || T.accent) : T.border,
    background: active ? (color || T.accent) : "transparent",
    color: active ? "#fff" : T.text2,
  });

  return (
    <div>
      {/* Title */}
      <div style={{ textAlign: "center", fontSize: 18, fontWeight: 700, margin: "4px 0 10px", color: "#1a2a3a" }}>
        Сводная таблица судов МСС
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <select value={selDate} onChange={(e) => setSelDate(e.target.value)}
          style={{ padding: "5px 8px", borderRadius: 4, border: `1px solid ${T.border}`, fontSize: 13, fontFamily: "monospace", fontWeight: 600 }}>
          {dates.length === 0 && <option value="">— нет данных —</option>}
          {dates.map((d) => <option key={d} value={d}>на {fmtDateRu(d)}</option>)}
        </select>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {branches.map((b) => (
            <button key={b} onClick={() => setFilterBranch(b)}
              style={fbtn(filterBranch === b, BRANCH_COLORS[b] ? "#546E7A" : undefined)}>
              {b}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: STATUS_COLOR.asg }}>АСГ: {cAsg}</span>
          <span style={{ color: STATUS_COLOR.asd }}>АСД: {cAsd}</span>
          <span style={{ color: STATUS_COLOR.rem }}>РЕМ: {cRem}</span>
          <span style={{ color: "#1a2a3a" }}>Всего: {filtered.length}</span>
        </div>

        {isAdmin && (
          <button onClick={exportXlsx}
            style={{ marginLeft: "auto", padding: "6px 16px", borderRadius: 6, border: "none", background: "#2e7d32", color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            ⬇ Экспорт в Excel
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ overflow: "auto", maxHeight: "calc(100vh - 220px)", border: "1px solid #90a4ae", borderRadius: 4, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 36 }}>№ п/п</th>
              <th style={{ ...thStyle, textAlign: "left", minWidth: 180 }}>Название судна</th>
              <th style={thStyle}>Филиал</th>
              <th style={{ ...thStyle, textAlign: "left", minWidth: 160 }}>Статус по План-графику</th>
              {isAdmin && <th style={{ ...thStyle, textAlign: "left", minWidth: 140 }}>Сведения о контракте</th>}
              <th style={{ ...thStyle, textAlign: "left", minWidth: 160 }}>Местоположение судна</th>
              {isAdmin && <th style={{ ...thStyle, textAlign: "left", minWidth: 200 }}>Примечание</th>}
              {isAdmin && <th style={{ ...thStyle, width: 70 }}>Топливо ДТ</th>}
              {isAdmin && <th style={{ ...thStyle, width: 70 }}>Топливо Мазут</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((v, i) => {
              const sc = statusCls(v.status);
              const rowBg = branchBg(v.branch);

              // Extract contract info from status for АСД
              let statusDisplay = v.status;
              let contractInfo = "";
              if (isAdmin && sc === "asd") {
                // Try to split status from contract details
                const parts = v.status.split(/[,/]/);
                if (parts.length > 1) {
                  statusDisplay = parts[0].trim();
                  contractInfo = parts.slice(1).join(", ").trim();
                }
              }
              if (!isAdmin) {
                statusDisplay = shortStatus(v.status);
                contractInfo = "";
              }

              return (
                <tr key={v.vessel_name} style={{ background: rowBg }}>
                  {/* № */}
                  <td style={{ ...tdBase, textAlign: "center", color: "#546E7A", fontFamily: "monospace", fontSize: 11 }}>{i + 1}</td>

                  {/* Name */}
                  <td style={{ ...tdBase, fontWeight: 600, color: "#1a2a3a" }}>{v.vessel_name}</td>

                  {/* Branch */}
                  <td style={{ ...tdBase, textAlign: "center", fontWeight: 600, fontSize: 11, color: "#37474F" }}>{v.branch}</td>

                  {/* Status */}
                  <td style={{
                    ...tdBase,
                    background: STATUS_BG[sc],
                    color: STATUS_COLOR[sc],
                    fontWeight: 600,
                    fontSize: 11,
                  }}>
                    {statusDisplay}
                  </td>

                  {/* Contract (admin) */}
                  {isAdmin && (
                    <td style={{ ...tdBase, fontSize: 11, color: "#37474F" }}>
                      {contractInfo || (sc === "asd" ? "" : "")}
                    </td>
                  )}

                  {/* Location */}
                  <td style={{ ...tdBase, fontSize: 11, fontFamily: "monospace", color: "#37474F" }}>{v.coord_raw || "—"}</td>

                  {/* Note (admin) */}
                  {isAdmin && <td style={{ ...tdBase, fontSize: 11, color: "#546E7A", maxWidth: 220 }}>{v.note || ""}</td>}

                  {/* Fuel DT (admin) */}
                  {isAdmin && (
                    <td style={{ ...tdBase, textAlign: "right", fontFamily: "monospace", fontSize: 11, color: "#1a2a3a", fontWeight: 500 }}>
                      {getSupply(v.supplies, "ДТ") || ""}
                    </td>
                  )}

                  {/* Fuel Mazut (admin) */}
                  {isAdmin && (
                    <td style={{ ...tdBase, textAlign: "right", fontFamily: "monospace", fontSize: 11, color: "#1a2a3a", fontWeight: 500 }}>
                      {getSupply(v.supplies, "Мазут") || getSupply(v.supplies, "ТТ") || ""}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && !loading && (
          <div style={{ padding: 30, textAlign: "center", color: T.text2, fontSize: 13 }}>
            {dates.length === 0 ? "Нет загруженных данных ДПР" : "Нет судов по фильтру"}
          </div>
        )}
      </div>
    </div>
  );
}
