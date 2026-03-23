import { useState, useEffect, useCallback } from "react";
import XLSX from "xlsx-js-style";
import { supabase } from "../lib/supabase";
import { T } from "../lib/types";
import type { DprSupply } from "../lib/parseDpr";

interface DprRow {
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

function getPower(coordRaw: string): string {
  const m = /(БЭП|СЭП)/i.exec(coordRaw || "");
  if (!m) return "";
  return m[1].toUpperCase() === "БЭП" ? "БЭП" : "СЭП";
}

/* ── Branch colors ── */
const BRANCH_COLORS: Record<string, string> = {
  "АЧФ":  "#FFF3E0", "АЗЧФ": "#FFF3E0",
  "БЛТФ": "#E3F2FD", "БФ":   "#E3F2FD",
  "КСПФ": "#F3E5F5",
  "СВРФ": "#E8F5E9", "СевФ": "#E8F5E9",
  "ПРМФ": "#FFF9C4", "ПримФ":"#FFF9C4",
  "СХЛФ": "#FCE4EC", "СахФ": "#FCE4EC",
  "КМЧФ": "#E0F7FA",
  "АРХФ": "#F1F8E9",
};

const BRANCH_XL: Record<string, string> = {
  "АЧФ":  "FFF3E0", "АЗЧФ": "FFF3E0",
  "БЛТФ": "E3F2FD", "БФ":   "E3F2FD",
  "КСПФ": "F3E5F5",
  "СВРФ": "E8F5E9", "СевФ": "E8F5E9",
  "ПРМФ": "FFF9C4", "ПримФ":"FFF9C4",
  "СХЛФ": "FCE4EC", "СахФ": "FCE4EC",
  "КМЧФ": "E0F7FA",
  "АРХФ": "F1F8E9",
};

const STATUS_BG: Record<string, string> = { asg: "#FFCDD2", asd: "#C8E6C9", rem: "#F5F5F5", oth: "#F5F5F5" };
const STATUS_COLOR: Record<string, string> = { asg: "#C62828", asd: "#1B5E20", rem: "#424242", oth: "#616161" };
const STATUS_XL_BG: Record<string, string> = { asg: "FFCDD2", asd: "C8E6C9", rem: "F5F5F5", oth: "F5F5F5" };
const STATUS_XL_FG: Record<string, string> = { asg: "C62828", asd: "1B5E20", rem: "424242", oth: "616161" };

const BRANCHES_ORDER = ["АЧФ", "АЗЧФ", "БЛТФ", "БФ", "КСПФ", "СВРФ", "СевФ", "ПРМФ", "ПримФ", "СХЛФ", "СахФ", "КМЧФ", "АРХФ"];

function branchOrder(b: string): number {
  const idx = BRANCHES_ORDER.findIndex((x) => b.toUpperCase().includes(x.toUpperCase()));
  return idx >= 0 ? idx : 99;
}

function branchBg(b: string): string {
  return BRANCH_COLORS[b] || "#FFFFFF";
}

/* ── Компонент редактируемой ячейки ── */
function EditableCell({ 
  value, 
  vesselName, 
  reportDate, 
  onUpdate 
}: { 
  value: string; 
  vesselName: string; 
  reportDate: string; 
  onUpdate: (newValue: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("dpr_entries")
        .update({ contract_info: editValue })
        .eq("vessel_name", vesselName)
        .eq("report_date", reportDate);
      
      if (error) throw error;
      onUpdate(editValue);
      setIsEditing(false);
    } catch (err) {
      console.error("Ошибка сохранения:", err);
      alert("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditValue(value || "");
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          style={{
            padding: "4px 6px",
            borderRadius: 4,
            border: `1px solid ${T.accent}`,
            fontSize: 11,
            width: "100%",
            minWidth: 120,
            background: "#fff",
          }}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "2px 6px",
            borderRadius: 4,
            border: "none",
            background: T.accent,
            color: "#fff",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          {saving ? "..." : "✓"}
        </button>
        <button
          onClick={() => {
            setEditValue(value || "");
            setIsEditing(false);
          }}
          style={{
            padding: "2px 6px",
            borderRadius: 4,
            border: `1px solid ${T.border}`,
            background: "transparent",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      style={{
        cursor: "pointer",
        padding: "2px 4px",
        borderRadius: 4,
        background: value ? "transparent" : "#fef3c7",
        minWidth: 120,
        color: value ? T.text : "#b45309",
        border: "1px solid transparent",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = T.accent;
        e.currentTarget.style.background = "#f8fafc";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "transparent";
        e.currentTarget.style.background = "transparent";
      }}
    >
      {value || "✎ добавить"}
    </div>
  );
}

/* ── Основной компонент ── */
export function SummaryReport({ isAdmin: _isAdmin, canView }: { isAdmin: boolean; canView: boolean }) {
  const [dates, setDates] = useState<string[]>([]);
  const [selDate, setSelDate] = useState("");
  const [vessels, setVessels] = useState<DprRow[]>([]);
  const [typeMap, setTypeMap] = useState<Map<string, string>>(new Map());
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
    const [{ data }, { data: vData }] = await Promise.all([
      supabase.from("dpr_entries").select("*").eq("report_date", date).order("vessel_name"),
      supabase.from("vessels").select("name"),
    ]);
    const t = new Map<string, string>();
    (vData || []).forEach((v: any) => {
      const full = v.name.toUpperCase().trim();
      const typeMatch = full.match(/^(МФАСС|ТБС|ССН|АСС|НИС|МБС|МВС|МБ|БП|ВСП|Баржа)\s+/);
      if (typeMatch) {
        const short = full.slice(typeMatch[0].length);
        t.set(full, typeMatch[1]);
        t.set(short, typeMatch[1]);
      }
    });
    setTypeMap(t);
    setVessels(data || []);
    setLoading(false);
  }

  const updateContractInfo = useCallback((vesselName: string, newValue: string) => {
    setVessels(prev => prev.map(v => 
      v.vessel_name === vesselName 
        ? { ...v, contract_info: newValue }
        : v
    ));
  }, []);

  const fmtDateRu = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}.${m}.${y}`;
  };

  const branches = ["Все", ...Array.from(new Set(vessels.map((v) => v.branch).filter(Boolean)))].sort((a, b) => branchOrder(a) - branchOrder(b));

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

  /* ── Styled Excel export ── */
  function exportXlsx() {
    const wb = XLSX.utils.book_new();
    const headers = ["№ п/п", "Тип", "Название судна", "Филиал", "Статус по План-графику", "Контракт", "Местоположение судна", "Эл-е", "Примечание", "Топливо ДТ", "Топливо Мазут/ТТ"];
    const colWidths = [6, 8, 30, 10, 28, 20, 28, 6, 35, 12, 12];

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

    filtered.forEach((v, i) => {
      const sc = statusCls(v.status);
      const brXl = BRANCH_XL[v.branch] || "FFFFFF";
      const vType = typeMap.get(v.vessel_name.toUpperCase().trim().replace(/\s+/g, " ")) || "";
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
        { v: vType, t: "s", s: { fill: rowFill, alignment: { horizontal: "center", ...wrap }, border: baseBorder, font: { sz: 9, color: { rgb: "546E7A" } } } },
        { v: v.vessel_name, t: "s", s: { fill: rowFill, alignment: { ...wrap }, border: baseBorder, font: { bold: true, sz: 10, color: { rgb: "1A2A3A" } } } },
        { v: v.branch, t: "s", s: { fill: rowFill, alignment: { horizontal: "center", ...wrap }, border: baseBorder, font: { bold: true, sz: 10, color: { rgb: "37474F" } } } },
        { v: v.status, t: "s", s: { fill: statusFill, alignment: { ...wrap }, border: baseBorder, font: statusFont } },
        { v: v.contract_info || "", t: "s", s: { fill: rowFill, alignment: { ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: "37474F" } } } },
        { v: (v.coord_raw || "").replace(/\s*(БЭП|СЭП)\s*$/i, "").trim(), t: "s", s: { fill: rowFill, alignment: { ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: "37474F" } } } },
        { v: power, t: "s", s: { fill: rowFill, alignment: { horizontal: "center", ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: power === "БЭП" ? "1565C0" : "2E7D32" } } } },
        { v: v.note || "", t: "s", s: { fill: rowFill, alignment: { ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: "546E7A" } } } },
        { v: getSupply(v.supplies, "ДТ") || "", t: "s", s: { fill: rowFill, alignment: { horizontal: "right", ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: "1A2A3A" } } } },
        { v: getSupply(v.supplies, "Мазут") || getSupply(v.supplies, "ТТ") || "", t: "s", s: { fill: rowFill, alignment: { horizontal: "right", ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: "1A2A3A" } } } },
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

  /* ── Styles for HTML table ── */
  const thStyle: React.CSSProperties = {
    padding: "8px 8px", textAlign: "center", fontSize: 11, fontWeight: 700,
    color: "#fff", borderBottom: "2px solid #90a4ae", borderRight: "1px solid #546E7A",
    whiteSpace: "nowrap", position: "sticky", top: 0, background: "#37474F", zIndex: 1,
  };

  const tdBase: React.CSSProperties = {
    padding: "5px 8px", fontSize: 12, borderBottom: "1px solid #cfd8dc",
    borderRight: "1px solid #e8eaed", verticalAlign: "top",
  };

  const fbtn = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px", borderRadius: 20, border: "1px solid",
    cursor: "pointer", fontSize: 11, fontWeight: 600,
    borderColor: active ? "#37474F" : T.border,
    background: active ? "#37474F" : "transparent",
    color: active ? "#fff" : T.text2,
  });

  return (
    <div>
      <div style={{ textAlign: "center", fontSize: 18, fontWeight: 700, margin: "4px 0 10px", color: "#1a2a3a" }}>
        Сводная таблица судов МСС
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
        <select value={selDate} onChange={(e) => setSelDate(e.target.value)}
          style={{ padding: "5px 8px", borderRadius: 4, border: `1px solid ${T.border}`, fontSize: 13, fontFamily: "monospace", fontWeight: 600 }}>
          {dates.length === 0 && <option value="">— нет данных —</option>}
          {dates.map((d) => <option key={d} value={d}>на {fmtDateRu(d)}</option>)}
        </select>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {branches.map((b) => (
            <button key={b} onClick={() => setFilterBranch(b)} style={fbtn(filterBranch === b)}>{b}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: STATUS_COLOR.asg }}>АСГ: {cAsg}</span>
          <span style={{ color: STATUS_COLOR.asd }}>АСД: {cAsd}</span>
          <span style={{ color: STATUS_COLOR.rem }}>РЕМ: {cRem}</span>
          <span style={{ color: "#1a2a3a" }}>Всего: {filtered.length}</span>
        </div>

        {canView && (
          <button onClick={exportXlsx}
            style={{ marginLeft: "auto", padding: "6px 16px", borderRadius: 6, border: "none", background: "#2e7d32", color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            ⬇ Экспорт в Excel
          </button>
        )}
      </div>

      <div style={{ overflow: "auto", maxHeight: "calc(100vh - 220px)", border: "1px solid #90a4ae", borderRadius: 4, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 36 }}>№</th>
              <th style={{ ...thStyle, width: 50 }}>Тип</th>
              <th style={{ ...thStyle, textAlign: "left", minWidth: 160 }}>Название судна</th>
              <th style={thStyle}>Филиал</th>
              <th style={{ ...thStyle, textAlign: "left", minWidth: 140 }}>Статус</th>
              {canView && <th style={{ ...thStyle, textAlign: "left", minWidth: 140 }}>Контракт</th>}
              <th style={{ ...thStyle, textAlign: "left", minWidth: 140 }}>Местоположение</th>
              <th style={{ ...thStyle, width: 50 }}>Эл-е</th>
              {canView && <th style={{ ...thStyle, textAlign: "left", minWidth: 180 }}>Примечание</th>}
              {canView && <th style={{ ...thStyle, width: 70 }}>ДТ</th>}
              {canView && <th style={{ ...thStyle, width: 70 }}>Мазут/ТТ</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((v, i) => {
              const sc = statusCls(v.status);
              const rowBg = branchBg(v.branch);
              const vType = typeMap.get(v.vessel_name.toUpperCase().trim().replace(/\s+/g, " ")) || "";
              const power = getPower(v.coord_raw);
              const coordDisplay = (v.coord_raw || "").replace(/\s*(БЭП|СЭП)\s*$/i, "").trim();

              let statusDisplay = v.status;
              let contractInfo = "";
              if (canView && sc === "asd") {
                const parts = v.status.split(/[,/]/);
                if (parts.length > 1) {
                  statusDisplay = parts[0].trim();
                  contractInfo = parts.slice(1).join(", ").trim();
                }
              }
              if (!canView) {
                statusDisplay = shortStatus(v.status);
                contractInfo = "";
              }

              return (
                <tr key={v.vessel_name} style={{ background: rowBg }}>
                  <td style={{ ...tdBase, textAlign: "center", color: "#546E7A", fontFamily: "monospace", fontSize: 11 }}>{i + 1}</td>
                  <td style={{ ...tdBase, textAlign: "center", fontSize: 10, color: "#546E7A", fontFamily: "monospace", fontWeight: 700 }}>{vType}</td>
                  <td style={{ ...tdBase, fontWeight: 600, color: "#1a2a3a" }}>{v.vessel_name}</td>
                  <td style={{ ...tdBase, textAlign: "center", fontWeight: 600, fontSize: 11, color: "#37474F" }}>{v.branch}</td>
                  <td style={{ ...tdBase, background: STATUS_BG[sc], color: STATUS_COLOR[sc], fontWeight: 600, fontSize: 11 }}>{statusDisplay}</td>
                  {canView && (
                    <td style={{ ...tdBase, background: rowBg }}>
                      <EditableCell
                        value={v.contract_info || ""}
                        vesselName={v.vessel_name}
                        reportDate={selDate}
                        onUpdate={(newValue) => updateContractInfo(v.vessel_name, newValue)}
                      />
                    </td>
                  )}
                  <td style={{ ...tdBase, fontSize: 11, fontFamily: "monospace", color: "#37474F" }}>{coordDisplay || "—"}</td>
                  <td style={{ ...tdBase, textAlign: "center", fontSize: 11, fontWeight: 700, color: power === "БЭП" ? "#1565C0" : power === "СЭП" ? "#2E7D32" : "#ccc" }}>{power || "—"}</td>
                  {canView && <td style={{ ...tdBase, fontSize: 11, color: "#546E7A", maxWidth: 220 }}>{v.note || ""}</td>}
                  {canView && <td style={{ ...tdBase, textAlign: "right", fontFamily: "monospace", fontSize: 11, fontWeight: 500 }}>{getSupply(v.supplies, "ДТ") || ""}</td>}
                  {canView && <td style={{ ...tdBase, textAlign: "right", fontFamily: "monospace", fontSize: 11, fontWeight: 500 }}>{getSupply(v.supplies, "Мазут") || getSupply(v.supplies, "ТТ") || ""}</td>}
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
