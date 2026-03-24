import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { T } from "../../lib/types";
import type { DprRow } from "./types";
import { branchOrder, statusCls, STATUS_COLOR } from "./types";
import { FilterBar } from "./FilterBar";
import { ReportTable } from "./ReportTable";
import { exportToExcel } from "./exportExcel";

export function SummaryReport({ isAdmin: _isAdmin, canView }: { isAdmin: boolean; canView: boolean }) {
  const [dates, setDates] = useState<string[]>([]);
  const [selDate, setSelDate] = useState("");
  const [vessels, setVessels] = useState<DprRow[]>([]);
  const [typeMap, setTypeMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterBranches, setFilterBranches] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"name" | "branch" | "status">("branch");

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
    
    // Строим карту типов (case-insensitive)
    const t = new Map<string, string>();
    (vData || []).forEach((v: any) => {
      const originalName = v.name;
      const upperName = originalName.toUpperCase().trim();
      const typeMatch = upperName.match(/^(МФАСС|ТБС|ССН|АСС|НИС|МБС|МВС|МБ|БП|ВСП|Баржа)\s+/);
      const typeStr = typeMatch ? typeMatch[1] : "";
      
      if (typeStr) {
        t.set(originalName, typeStr);
        t.set(upperName, typeStr);
        const withoutPrefix = upperName.replace(/^(МФАСС|ТБС|ССН|МБС|МВС|МБ|НИС|АСС|БП)\s+/i, "").trim();
        if (withoutPrefix !== upperName) {
          t.set(withoutPrefix, typeStr);
        }
        t.set(originalName.toLowerCase(), typeStr);
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

  const getVesselType = useCallback((vesselName: string): string => {
    const normalized = vesselName.toUpperCase().trim();
    let type = typeMap.get(normalized);
    if (type) return type;
    
    const withoutPrefix = normalized.replace(/^(МФАСС|ТБС|ССН|МБС|МВС|МБ|НИС|АСС|БП)\s+/i, "").trim();
    type = typeMap.get(withoutPrefix);
    if (type) return type;
    
    for (const [key, val] of typeMap.entries()) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return val;
      }
    }
    return "";
  }, [typeMap]);

  const allTypes = useMemo(() => {
    const types = new Set<string>();
    vessels.forEach(v => {
      const t = getVesselType(v.vessel_name);
      if (t) types.add(t);
    });
    return Array.from(types).sort();
  }, [vessels, getVesselType]);

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

  const toggleStatus = (value: string) => {
    if (value === "Все") {
      setFilterStatuses([]);
      return;
    }
    const statusKey = value === "АСГ" ? "asg" : value === "АСД" ? "asd" : "rem";
    setFilterStatuses(prev => prev.includes(statusKey) ? prev.filter(v => v !== statusKey) : [...prev, statusKey]);
  };

  const filtered = useMemo(() => {
    let result = vessels.filter(v => {
      const typeOk = filterTypes.length === 0 || filterTypes.includes(getVesselType(v.vessel_name));
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
  }, [vessels, filterTypes, filterBranches, filterStatuses, sortBy, getVesselType]);

  const cAsg = filtered.filter((v) => statusCls(v.status) === "asg").length;
  const cAsd = filtered.filter((v) => statusCls(v.status) === "asd").length;
  const cRem = filtered.filter((v) => statusCls(v.status) === "rem").length;

  return (
    <div>
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
        
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
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
          
          <div style={{ display: "flex", gap: 12, fontSize: 13, fontWeight: 600 }}>
            <span style={{ color: STATUS_COLOR.asg }}>АСГ: {cAsg}</span>
            <span style={{ color: STATUS_COLOR.asd }}>АСД: {cAsd}</span>
            <span style={{ color: STATUS_COLOR.rem }}>РЕМ: {cRem}</span>
            <span style={{ color: "#1a2a3a" }}>Всего: {filtered.length}</span>
          </div>
          
          {canView && (
            <button 
              onClick={() => exportToExcel(filtered, selDate, fmtDateRu)}
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
      </div>

      <FilterBar
        allTypes={allTypes}
        allBranches={allBranches}
        filterTypes={filterTypes}
        filterBranches={filterBranches}
        filterStatuses={filterStatuses}
        sortBy={sortBy}
        onToggleType={(v) => toggleFilter(setFilterTypes, v)}
        onToggleBranch={(v) => toggleFilter(setFilterBranches, v)}
        onToggleStatus={toggleStatus}
        onSortBy={setSortBy}
      />

      <ReportTable
        vessels={filtered}
        selDate={selDate}
        canView={canView}
        getVesselType={getVesselType}
        onUpdateField={updateField}
      />

      {filtered.length === 0 && !loading && (
        <div style={{ padding: 30, textAlign: "center", color: T.text2, fontSize: 13 }}>
          {dates.length === 0 ? "Нет загруженных данных ДПР" : "Нет судов по фильтру"}
        </div>
      )}
    </div>
  );
}