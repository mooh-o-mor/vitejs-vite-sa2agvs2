import { T } from "../../lib/types";

interface Props {
  allTypes: string[];
  allBranches: string[];
  filterTypes: string[];
  filterBranches: string[];
  filterStatuses: string[];
  sortBy: "name" | "branch" | "status";
  onToggleType: (v: string) => void;
  onToggleBranch: (v: string) => void;
  onToggleStatus: (v: string) => void;
  onSortBy: (v: "name" | "branch" | "status") => void;
}

const btnStyle = (active: boolean, isAll?: boolean): React.CSSProperties => ({
  padding: "4px 12px", borderRadius: 20, border: "1px solid",
  cursor: "pointer", fontSize: 11, fontWeight: 600,
  borderColor: active ? (isAll ? "#37474F" : T.accent) : T.border,
  background: active ? (isAll ? "#37474F" : T.accent) : T.bg2,
  color: active ? "#fff" : T.text2,
});

const filterRow = (label: string, items: string[], active: string[], onToggle: (v: string) => void, showAll: boolean = true) => (
  <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
    <span style={{ fontSize: 11, color: T.text3, minWidth: 60 }}>{label}:</span>
    {showAll && <button onClick={() => onToggle("Все")} style={btnStyle(active.length === 0, true)}>Все</button>}
    {items.map(v => (
      <button key={v} onClick={() => onToggle(v)} style={btnStyle(active.includes(v))}>{v}</button>
    ))}
  </div>
);

export function FilterBar({
  allTypes,
  allBranches,
  filterTypes,
  filterBranches,
  filterStatuses,
  sortBy,
  onToggleType,
  onToggleBranch,
  onToggleStatus,
  onSortBy,
}: Props) {
  const statusItems = ["АСГ", "АСД", "РЕМ"];

  return (
    <div style={{ background: T.bg3, padding: "8px 12px", borderRadius: 8, marginBottom: 12 }}>
      {allTypes.length > 0 && filterRow("Тип судна", allTypes, filterTypes, onToggleType)}
      {allBranches.length > 0 && filterRow("Филиал", allBranches, filterBranches, onToggleBranch)}
      {filterRow("Статус", statusItems, filterStatuses, onToggleStatus)}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: T.text3, minWidth: 60 }}>Сортировка:</span>
        {[
          ["name", "По названию"],
          ["branch", "По филиалу"],
          ["status", "По статусу"]
        ].map(([key, label]) => (
          <button key={key} onClick={() => onSortBy(key as any)} style={btnStyle(sortBy === key)}>{label}</button>
        ))}
      </div>
    </div>
  );
}