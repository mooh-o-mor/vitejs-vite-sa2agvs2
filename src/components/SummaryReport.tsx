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
  if (s.startsWith("РЕМ")) return "РЕМ";
  return stat;
}

const BRANCHES_ORDER = ["АЧФ", "АЗЧФ", "БЛТФ", "БФ", "СХЛФ", "СахФ", "СФ", "СВРФ", "ПРМФ", "ПримФ", "КМЧФ", "АРХФ"];

function branchOrder(b: string): number {
  const idx = BRANCHES_ORDER.findIndex((x) => b.toUpperCase().includes(x.toUpperCase()));
  return idx >= 0 ? idx : 99;
}

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

  const cAsg = filtered.filter((v) => v.status.toUpperCase().startsWith("АСГ")).length;
  const cAsd = filtered.filter((v) => v.status.toUpperCase().startsWith("АСД")).length;
  const cRem = filtered.filter((v) => v.status.toUpperCase().startsWith("РЕМ") || v.status.toUpperCase().includes("РЕМОНТ")).length;

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
    padding: "6px 8px", textAlign: "left", fontSize: 11, fontWeight: 600,
    color: T.text2, borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap",
    position: "sticky", top: 0, background: "#fff", zIndex: 1,
  };
  const tdStyle: React.CSSProperties = {
    padding: "5px 8px", fontSize: 12, borderBottom: `1px solid ${T.border}`, verticalAlign: "top",
  };
  const fbtn = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px", borderRadius: 20, border: "1px solid", cursor: "pointer", fontSize: 11, fontWeight: 600,
    borderColor: active ? T.accent : T.border, background: active ? T.accent : "transparent", color: active ? "#fff" : T.text2,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <select value={selDate} onChange={(e) => setSelDate(e.target.value)}
          style={{ padding: "5px 8px", borderRadius: 4, border: `1px solid ${T.border}`, fontSize: 12, fontFamily: "monospace" }}>
          {dates.length === 0 && <option value="">— нет данных —</option>}
          {dates.map((d) => <option key={d} value={d}>{fmtDateRu(d)}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {branches.map((b) => (
            <button key={b} onClick={() => setFilterBranch(b)} style={fbtn(filterBranch === b)}>{b}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
          <span><b style={{ color: "#e53935" }}>{cAsg}</b> АСГ</span>
          <span><b style={{ color: "#2e7d32" }}>{cAsd}</b> АСД</span>
          <span><b style={{ color: "#757575" }}>{cRem}</b> РЕМ</span>
          <span><b>{filtered.length}</b> всего</span>
        </div>
        {isAdmin && (
          <button onClick={exportXlsx}
            style={{ marginLeft: "auto", padding: "6px 16px", borderRadius: 6, border: "none", background: "#2e7d32", color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            ⬇ Экспорт в Excel
          </button>
        )}
      </div>

      <div style={{ overflow: "auto", maxHeight: "calc(100vh - 200px)", border: `1px solid ${T.border}`, borderRadius: 6, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={thStyle}>№</th>
              <th style={thStyle}>Судно</th>
              <th style={thStyle}>Филиал</th>
              <th style={thStyle}>Статус</th>
              <th style={thStyle}>Местоположение</th>
              {isAdmin && <th style={thStyle}>Примечание</th>}
              {isAdmin && <th style={thStyle}>ДТ</th>}
              {isAdmin && <th style={thStyle}>Мазут/ТТ</th>}
              {isAdmin && <th style={thStyle}>Масло</th>}
              {isAdmin && <th style={thStyle}>Вода</th>}
              {isAdmin && <th style={thStyle}>Продукты</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((v, i) => {
              const st = v.status.toUpperCase();
              const statColor = st.startsWith("АСГ") ? "#e53935" : st.startsWith("АСД") ? "#2e7d32" : "#757575";
              return (
                <tr key={v.vessel_name} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                  <td style={{ ...tdStyle, color: T.text2, fontFamily: "monospace", fontSize: 11 }}>{i + 1}</td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{v.vessel_name}</td>
                  <td style={{ ...tdStyle, color: T.text2, fontSize: 11 }}>{v.branch}</td>
                  <td style={tdStyle}>
                    <span style={{
                      display: "inline-block", padding: "1px 6px", borderRadius: 3,
                      fontFamily: "monospace", fontSize: 10, fontWeight: 600,
                      background: st.startsWith("АСГ") ? "#ffebee" : st.startsWith("АСД") ? "#e8f5e9" : "#f5f5f5",
                      color: statColor,
                    }}>{isAdmin ? v.status : shortStatus(v.status)}</span>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 11, fontFamily: "monospace", maxWidth: 200 }}>{v.coord_raw || "—"}</td>
                  {isAdmin && <td style={{ ...tdStyle, fontSize: 11, maxWidth: 200, color: T.text2 }}>{v.note || ""}</td>}
                  {isAdmin && <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11, color: T.accent }}>{getSupply(v.supplies, "ДТ")}</td>}
                  {isAdmin && <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11, color: T.accent }}>{getSupply(v.supplies, "Мазут") || getSupply(v.supplies, "ТТ")}</td>}
                  {isAdmin && <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>{getSupply(v.supplies, "Масло")}</td>}
                  {isAdmin && <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>{getSupply(v.supplies, "Вода")}</td>}
                  {isAdmin && <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11 }}>{getSupply(v.supplies, "Продукт")}</td>}
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
