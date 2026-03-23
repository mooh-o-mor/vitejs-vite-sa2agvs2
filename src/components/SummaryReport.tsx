import { useState, useEffect, useCallback, useMemo } from "react";
import XLSX from "xlsx-js-style";
import { supabase } from "../lib/supabase";
import { T, type DprSupply, type DprRow } from "../lib/types";

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

/* ── Универсальная редактируемая ячейка ── */
function EditableCell({ 
  value, 
  vesselName, 
  reportDate, 
  field,
  onUpdate,
  editable = true,
  placeholder = "✎ добавить"
}: { 
  value: string; 
  vesselName: string; 
  reportDate: string; 
  field: "contract_info" | "note" | "work_period";
  onUpdate: (vesselName: string, field: string, newValue: string) => void;
  editable?: boolean;
  placeholder?: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updateData = { [field]: editValue };
      const { error } = await supabase
        .from("dpr_entries")
        .update(updateData)
        .eq("vessel_name", vesselName)
        .eq("report_date", reportDate);
      
      if (error) throw error;
      onUpdate(vesselName, field, editValue);
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

  if (!editable) {
    return <span style={{ color: T.text2, fontSize: 11 }}>{value || "—"}</span>;
  }

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
            minWidth: field === "contract_info" ? 120 : field === "work_period" ? 140 : 160,
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

  const isEmpty = !value || value === "";
  const isContract = field === "contract_info";
  const isWorkPeriod = field === "work_period";

  return (
    <div
      onClick={() => setIsEditing(true)}
      style={{
        cursor: "pointer",
        padding: "2px 4px",
        borderRadius: 4,
        background: isEmpty ? "#fef3c7" : "transparent",
        minWidth: isContract ? 120 : isWorkPeriod ? 140 : 160,
        color: isEmpty ? "#b45309" : T.text,
        border: "1px solid transparent",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = T.accent;
        e.currentTarget.style.background = isEmpty ? "#fff3e0" : "#f8fafc";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "transparent";
        e.currentTarget.style.background = isEmpty ? "#fef3c7" : "transparent";
      }}
    >
      {value || placeholder}
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
  
  // Фильтры и сортировка
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterBranches, setFilterBranches] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"name" | "branch" | "status">("name");

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

  const updateField = useCallback((vesselName: string, field: string, newValue: string) => {
    setVessels(prev => prev.map(v => 
      v.vessel_name === vesselName 
        ? { ...v, [field]: newValue }
        : v
    ));
  }, []);

  const fmtDateRu = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}.${m}.${y}`;
  };

  // Уникальные значения для фильтров
  const allTypes = useMemo(() => {
    const types = new Set<string>();
    vessels.forEach(v => {
      const t = typeMap.get(v.vessel_name.toUpperCase().trim().replace(/\s+/g, " ")) || "";
      if (t) types.add(t);
    });
    return Array.from(types).sort();
  }, [vessels, typeMap]);

  const allBranches = useMemo(() => {
    return [...new Set(vessels.map(v => v.branch).filter(Boolean))].sort((a,b) => branchOrder(a)-branchOrder(b));
  }, [vessels]);

  const toggleFilter = (setter: React.Dispatch<React.SetStateAction<string[]>>, value: string) => {
    if (value === "Все") {
      setter([]);
      return;
    }
    setter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  const filtered = useMemo(() => {
    let result = vessels.filter(v => {
      const typeOk = filterTypes.length === 0 || filterTypes.includes(typeMap.get(v.vessel_name.toUpperCase().trim().replace(/\s+/g, " ")) || "");
      const branchOk = filterBranches.length === 0 || filterBranches.includes(v.branch);
      const statusOk = filterStatuses.length === 0 || filterStatuses.includes(statusCls(v.status));
      return typeOk && branchOk && statusOk;
    });

    result.sort((a,b) => {
      if (sortBy === "name") return a.vessel_name.localeCompare(b.vessel_name, "ru");
      if (sortBy === "branch") return (a.branch || "").localeCompare(b.branch || "", "ru");
      if (sortBy === "status") return statusCls(a.status).localeCompare(statusCls(b.status));
      return 0;
    });
    return result;
  }, [vessels, filterTypes, filterBranches, filterStatuses, sortBy, typeMap]);

  const cAsg = filtered.filter((v) => statusCls(v.status) === "asg").length;
  const cAsd = filtered.filter((v) => statusCls(v.status) === "asd").length;
  const cRem = filtered.filter((v) => statusCls(v.status) === "rem").length;

  /* ── Styled Excel export ── */
  function exportXlsx() {
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
        { v: v.work_period || "", t: "s", s: { fill: rowFill, alignment: { ...wrap }, border: baseBorder, font: { sz: 10, color: { rgb: "37474F" } } } },
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

  /* ── Styles for HTML table and filter buttons ── */
  const thStyle: React.CSSProperties = {
    padding: "8px 8px", textAlign: "center", fontSize: 11, fontWeight: 700,
    color: "#fff", borderBottom: "2px solid #90a4ae", borderRight: "1px solid #546E7A",
    whiteSpace: "nowrap", position: "sticky", top: 0, background: "#37474F", zIndex: 1,
  };

  const tdBase: React.CSSProperties = {
    padding: "5px 8px", fontSize: 12, borderBottom: "1px solid #cfd8dc",
    borderRight: "1px solid #e8eaed", verticalAlign: "top",
  };

  const btnStyle = (active: boolean, isAll?: boolean): React.CSSProperties => ({
    padding: "4px 12px", borderRadius: 20, border: "1px solid",
    cursor: "pointer", fontSize: 11, fontWeight: 600,
    borderColor: active ? (isAll ? "#37474F" : T.accent) : T.border,
    background: active ? (isAll ? "#37474F" : T.accent) : T.bg2,
    color: active ? "#fff" : T.text2,
  });

  const filterRow = (label: string, items: string[], active: string[], onToggle: (v: string) => void) => (
    <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: T.text3, minWidth: 60 }}>{label}:</span>
      <button onClick={() => onToggle("Все")} style={btnStyle(active.length === 0, true)}>Все</button>
      {items.map(v => (
        <button key={v} onClick={() => onToggle(v)} style={btnStyle(active.includes(v))}>{v}</button>
      ))}
    </div>
  );

  const statusRow = () => (
    <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: T.text3, minWidth: 60 }}>Статус:</span>
      <button onClick={() => setFilterStatuses([])} style={btnStyle(filterStatuses.length === 0, true)}>Все</button>
      {["asg","asd","rem"].map(s => (
        <button key={s} onClick={() => toggleFilter(setFilterStatuses, s)} style={btnStyle(filterStatuses.includes(s))}>
          {s === "asg" ? "АСГ" : s === "asd" ? "АСД" : "РЕМ"}
        </button>
      ))}
    </div>
  );

  const sortRow = () => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: T.text3, minWidth: 60 }}>Сортировка:</span>
      {[
        ["name", "По названию"],
        ["branch", "По филиалу"],
        ["status", "По статусу"]
      ].map(([key, label]) => (
        <button key={key} onClick={() => setSortBy(key as any)} style={btnStyle(sortBy === key)}>{label}</button>
      ))}
    </div>
  );

  return (
    <div>
      {/* Заголовок и дата в одной строке */}
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        marginBottom: 12,
        flexWrap: "wrap",
        gap: 10
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a2a3a" }}>
          Сводная таблица судов МСС
        </div>
        
        <select 
          value={selDate} 
          onChange={(e) => setSelDate(e.target.value)}
          style={{ 
            padding: "5px 8px", 
            borderRadius: 4, 
            border: `1px solid ${T.border}`, 
            fontSize: 13, 
            fontFamily: "monospace", 
            fontWeight: 600,
            background: "#fff"
          }}
        >
          {dates.length === 0 && <option value="">— нет данных —</option>}
          {dates.map((d) => <option key={d} value={d}>на {fmtDateRu(d)}</option>)}
        </select>
      </div>

      {/* Фильтры в серой области */}
      <div style={{ background: T.bg3, padding: "8px 12px", borderRadius: 8, marginBottom: 12 }}>
        {allTypes.length > 0 && filterRow("Тип судна", allTypes, filterTypes, (v) => toggleFilter(setFilterTypes, v))}
        {allBranches.length > 0 && filterRow("Филиал", allBranches, filterBranches, (v) => toggleFilter(setFilterBranches, v))}
        {statusRow()}
        {sortRow()}
      </div>

      {/* Статусы и кнопка экспорта под фильтрами */}
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        marginBottom: 12,
        flexWrap: "wrap",
        gap: 10
      }}>
        <div style={{ display: "flex", gap: 12, fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: STATUS_COLOR.asg }}>АСГ: {cAsg}</span>
          <span style={{ color: STATUS_COLOR.asd }}>АСД: {cAsd}</span>
          <span style={{ color: STATUS_COLOR.rem }}>РЕМ: {cRem}</span>
          <span style={{ color: "#1a2a3a" }}>Всего: {filtered.length}</span>
        </div>
        
        {canView && (
          <button 
            onClick={exportXlsx}
            style={{ 
              padding: "6px 16px", 
              borderRadius: 6, 
              border: "none", 
              background: "#2e7d32", 
              color: "#fff", 
              fontWeight: 600, 
              fontSize: 12, 
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            ⬇ Экспорт в Excel
          </button>
        )}
      </div>

      {/* Таблица */}
      <div style={{ overflow: "auto", maxHeight: "calc(100vh - 280px)", border: "1px solid #90a4ae", borderRadius: 4, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 36 }}>№</th>
              <th style={{ ...thStyle, width: 50 }}>Тип</th>
              <th style={{ ...thStyle, textAlign: "left", minWidth: 160 }}>Название судна</th>
              <th style={thStyle}>Филиал</th>
              <th style={{ ...thStyle, textAlign: "left", minWidth: 80 }}>Статус</th>
              {canView && <th style={{ ...thStyle, textAlign: "left", minWidth: 180 }}>Контракт</th>}
              {canView && <th style={{ ...thStyle, textAlign: "left", minWidth: 160 }}>Период работ</th>}
              <th style={{ ...thStyle, textAlign: "left", minWidth: 140 }}>Местоположение</th>
              <th style={{ ...thStyle, width: 50 }}>Эл-е</th>
              {canView && <th style={{ ...thStyle, textAlign: "left", minWidth: 200 }}>Примечание</th>}
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
              if (canView && sc === "asd") {
                const parts = v.status.split(/[,/]/);
                if (parts.length > 1) {
                  statusDisplay = parts[0].trim();
                }
              }
              if (!canView) {
                statusDisplay = shortStatus(v.status);
              }

              const isAsd = sc === "asd";

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
                        field="contract_info"
                        onUpdate={updateField}
                        editable={isAsd}
                        placeholder="✎ добавить"
                      />
                    </td>
                  )}
                  {canView && (
                    <td style={{ ...tdBase, background: rowBg }}>
                      <EditableCell
                        value={v.work_period || ""}
                        vesselName={v.vessel_name}
                        reportDate={selDate}
                        field="work_period"
                        onUpdate={updateField}
                        editable={true}
                        placeholder="✎ добавить период"
                      />
                    </td>
                  )}
                  <td style={{ ...tdBase, fontSize: 11, fontFamily: "monospace", color: "#37474F" }}>{coordDisplay || "—"}</td>
                  <td style={{ ...tdBase, textAlign: "center", fontSize: 11, fontWeight: 700, color: power === "БЭП" ? "#1565C0" : power === "СЭП" ? "#2E7D32" : "#ccc" }}>{power || "—"}</td>
                  {canView && (
                    <td style={{ ...tdBase, background: rowBg }}>
                      <EditableCell
                        value={v.note || ""}
                        vesselName={v.vessel_name}
                        reportDate={selDate}
                        field="note"
                        onUpdate={updateField}
                        editable={true}
                        placeholder="✎ добавить примечание"
                      />
                    </td>
                  )}
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
          </div
