import { T } from "../lib/types";

interface Props {
  allTypes: string[];
  allBranches: string[];
  allCps: string[];
  filterTypes: string[];
  filterBranches: string[];
  filterCp: string;
  filterStatuses: string[];  // добавляем
  sortBy: "type" | "name" | "branch";
  canView: boolean;
  onToggleType: (v: string) => void;
  onToggleBranch: (v: string) => void;
  onFilterCp: (v: string) => void;
  onToggleStatus: (v: string) => void;  // добавляем
  onSortBy: (v: "type" | "name" | "branch") => void;
}

export function FilterBar({
  allTypes, allBranches, allCps,
  filterTypes, filterBranches, filterCp, filterStatuses, sortBy,
  canView,
  onToggleType, onToggleBranch, onFilterCp, onToggleStatus, onSortBy
}: Props) {
  const btn = (active: boolean, amber?: boolean) => ({
    padding:"4px 12px", borderRadius:20, border:"1px solid", cursor:"pointer", fontSize:12, fontWeight:600,
    borderColor: active ? (amber ? T.amber : T.accent) : T.border,
    background: active ? (amber ? T.amber : T.accent) : T.bg2,
    color: active ? "#ffffff" : T.text2
  } as React.CSSProperties);

  const statusItems = ["АСГ", "АСД", "РЕМ"];
  const statusKeys = ["asg", "asd", "rem"];

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: T.text3, minWidth: 80 }}>Тип судна:</span>
        {allTypes.map(t => {
          const active = t === "Все" ? filterTypes.length === 0 : filterTypes.includes(t);
          return <button key={t} onClick={() => onToggleType(t)} style={btn(active)}>{t}</button>;
        })}
      </div>
      {allBranches.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: T.text3, minWidth: 80 }}>Филиал:</span>
          {allBranches.map(b => {
            const active = b === "Все" ? filterBranches.length === 0 : filterBranches.includes(b);
            return <button key={b} onClick={() => onToggleBranch(b)} style={btn(active, true)}>{b || "Без филиала"}</button>;
          })}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: T.text3, minWidth: 80 }}>Статус:</span>
        <button onClick={() => onToggleStatus("Все")} style={btn(filterStatuses.length === 0, true)}>Все</button>
        {statusItems.map((label, idx) => (
          <button
            key={label}
            onClick={() => onToggleStatus(label)}
            style={btn(filterStatuses.includes(statusKeys[idx]))}
          >
            {label}
          </button>
        ))}
      </div>
      {canView && allCps.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: T.text3, minWidth: 80 }}>Контрагент:</span>
          {allCps.map(cp => <button key={cp} onClick={() => onFilterCp(cp)} style={btn(filterCp === cp)}>{cp}</button>)}
        </div>
      )}
      {/* Сортировка временно скрыта
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: T.text3, minWidth: 80 }}>Сортировка:</span>
        {([ ["type","По типу"], ["name","По названию"], ["branch","По филиалу"] ] as const).map(([k,l]) => (
          <button key={k} onClick={() => onSortBy(k)} style={btn(sortBy === k)}>{l}</button>
        ))}
      </div>
      */}
    </div>
  );
}
