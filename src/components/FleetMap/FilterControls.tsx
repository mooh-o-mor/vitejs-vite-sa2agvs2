import { T } from "../../lib/types";

interface Props {
  filterType: string;
  filterBranch: string;
  filterStatus: string;
  allTypes: string[];
  allBranches: string[];
  allStatuses: string[];
  onFilterTypeChange: (v: string) => void;
  onFilterBranchChange: (v: string) => void;
  onFilterStatusChange: (v: string) => void;
}

const filterRow = (label: string, value: string, options: string[], onChange: (v: string) => void) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <span style={{ fontSize: 11, color: T.text3 }}>{label}</span>
    <select 
      value={value} 
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "6px 8px",
        borderRadius: 6,
        border: `1px solid ${T.border}`,
        fontSize: 12,
        fontWeight: 500,
        background: T.bg2,
        color: T.text,
        cursor: "pointer",
        width: "100%",
      }}
    >
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  </div>
);

export function FilterControls({
  filterType,
  filterBranch,
  filterStatus,
  allTypes,
  allBranches,
  allStatuses,
  onFilterTypeChange,
  onFilterBranchChange,
  onFilterStatusChange,
}: Props) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
      {filterRow("Тип", filterType, allTypes, onFilterTypeChange)}
      {filterRow("Филиал", filterBranch, allBranches, onFilterBranchChange)}
      {filterRow("Статус", filterStatus, allStatuses, onFilterStatusChange)}
    </div>
  );
}