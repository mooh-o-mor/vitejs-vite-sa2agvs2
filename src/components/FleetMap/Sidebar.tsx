import { T } from "../../lib/types";
import { CLR } from "./mapIcons";
import { FilterControls } from "./FilterControls";
import { VesselListItem } from "./VesselListItem";
import type { DprRow } from "../../lib/parseDpr";

interface Props {
  dates: string[];
  selDate: string;
  onDateChange: (date: string) => void;
  filterType: string;
  filterBranch: string;
  filterStatus: string;
  allTypes: string[];
  allBranches: string[];
  allStatuses: string[];
  onFilterTypeChange: (v: string) => void;
  onFilterBranchChange: (v: string) => void;
  onFilterStatusChange: (v: string) => void;
  cAsg: number;
  cAsd: number;
  cRem: number;
  total: number;
  noPos: number;
  uploadMsg: string;
  uploading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  filteredVessels: DprRow[];
  typeMap: Map<string, string>;
  selectedVessel: DprRow | null;
  onSelectVessel: (vessel: DprRow) => void;
  isMobile: boolean;
  onCloseSidebar: () => void;
  sidebarOpen: boolean;
}

const fmtDateRu = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}.${m}.${y}`;
};

export function Sidebar({
  dates,
  selDate,
  onDateChange,
  filterType,
  filterBranch,
  filterStatus,
  allTypes,
  allBranches,
  allStatuses,
  onFilterTypeChange,
  onFilterBranchChange,
  onFilterStatusChange,
  cAsg,
  cAsd,
  cRem,
  total,
  noPos,
  uploadMsg,
  uploading,
  search,
  onSearchChange,
  filteredVessels,
  typeMap,
  selectedVessel,
  onSelectVessel,
  isMobile,
  onCloseSidebar,
  sidebarOpen,
}: Props) {
  const showSidebar = isMobile ? sidebarOpen : true;

  if (!showSidebar) return null;

  return (
    <div style={{ width: 280, minWidth: 280, background: "#fff", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", ...(isMobile ? { position: "absolute", top: 0, left: 0, bottom: 0, zIndex: 700, boxShadow: "4px 0 20px rgba(0,0,0,.2)" } : {}) }}>
      {isMobile && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 8px", borderBottom: `1px solid ${T.border}` }}>
          <button onClick={onCloseSidebar} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: T.text2 }}>✕</button>
        </div>
      )}

      <div style={{ padding: 10, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <select value={selDate} onChange={(e) => onDateChange(e.target.value)} style={{ flex: 1, padding: "5px 8px", borderRadius: 4, border: `1px solid ${T.border}`, fontSize: 12, fontFamily: "monospace", background: "#f8fafc" }}>
            {dates.length === 0 && <option value="">— нет данных —</option>}
            {dates.map((d) => <option key={d} value={d}>на {fmtDateRu(d)}</option>)}
          </select>
        </div>

        <FilterControls
          filterType={filterType}
          filterBranch={filterBranch}
          filterStatus={filterStatus}
          allTypes={allTypes}
          allBranches={allBranches}
          allStatuses={allStatuses}
          onFilterTypeChange={onFilterTypeChange}
          onFilterBranchChange={onFilterBranchChange}
          onFilterStatusChange={onFilterStatusChange}
        />

        <div style={{ display: "flex", gap: 12, fontSize: 12, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 12 }}>
            <span><b style={{ color: CLR.asg }}>{cAsg}</b> <span style={{ color: T.text2 }}>АСГ</span></span>
            <span><b style={{ color: CLR.asd }}>{cAsd}</b> <span style={{ color: T.text2 }}>АСД</span></span>
            <span><b style={{ color: CLR.rem }}>{cRem}</b> <span style={{ color: T.text2 }}>РЕМ</span></span>
          </div>
          <span style={{ color: T.text2 }}><b>{total}</b> всего</span>
        </div>
        {noPos > 0 && <div style={{ fontSize: 10, color: "#c07800", marginTop: 8 }}>⚠ без позиции: {noPos}</div>}
        {uploadMsg && <div style={{ fontSize: 11, color: uploading ? T.text2 : T.accent, marginTop: 6 }}>{uploadMsg}</div>}
      </div>

      <div style={{ padding: 10, borderBottom: `1px solid ${T.border}` }}>
        <input placeholder="Поиск судна..." value={search} onChange={(e) => onSearchChange(e.target.value)}
          style={{ width: "100%", padding: "6px 10px", borderRadius: 4, border: `1px solid ${T.border}`, fontSize: 12 }} />
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {filteredVessels.map((v) => {
          const vesselType = typeMap.get(v.vessel_name.toUpperCase().trim()) || "";
          const isSel = selectedVessel?.vessel_name === v.vessel_name;
          return (
            <VesselListItem
              key={v.vessel_name}
              vessel={v}
              vesselType={vesselType}
              isSelected={isSel}
              onClick={() => onSelectVessel(v)}
            />
          );
        })}
        {filteredVessels.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: T.text2, fontSize: 13 }}>
            {dates.length === 0 ? "Нет загруженных данных" : "Нет судов по фильтру"}
          </div>
        )}
      </div>
    </div>
  );
}
