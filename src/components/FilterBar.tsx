import { T } from "../lib/types";

interface Props {
  allTypes: string[];
  allBranches: string[];
  allCps: string[];
  filterType: string;
  filterBranch: string;
  filterCp: string;
  sortBy: "type" | "name" | "branch";
  canView: boolean;
  onFilterType: (v: string) => void;
  onFilterBranch: (v: string) => void;
  onFilterCp: (v: string) => void;
  onSortBy: (v: "type" | "name" | "branch") => void;
}

export function FilterBar({
  allTypes, allBranches, allCps,
  filterType, filterBranch, filterCp, sortBy,
  canView,
  onFilterType, onFilterBranch, onFilterCp, onSortBy
}: Props) {

  const btn = (active: boolean, amber?: boolean) => ({
    padding:"4px 12px", borderRadius:20, border:"1px solid", cursor:"pointer", fontSize:12, fontWeight:600,
    borderColor: active ? (amber ? T.amber : T.accent) : T.border,
    background: active ? (amber ? T.amber : T.accent) : T.bg2,
    color: active ? "#ffffff" : T.text2
  } as React.CSSProperties);

  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap", alignItems:"center" }}>
        <span style={{ fontSize:11, color:T.text3, minWidth:80 }}>Тип судна:</span>
        {allTypes.map(t => <button key={t} onClick={() => onFilterType(t)} style={btn(filterType===t)}>{t}</button>)}
      </div>

      {allBranches.length>1 && (
        <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:11, color:T.text3, minWidth:80 }}>Филиал:</span>
          {allBranches.map(b => <button key={b} onClick={() => onFilterBranch(b)} style={btn(filterBranch===b, true)}>{b||"Без филиала"}</button>)}
        </div>
      )}

      {canView && allCps.length>1 && (
        <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap", alignItems:"center" }}>
          <span style={{ fontSize:11, color:T.text3, minWidth:80 }}>Контрагент:</span>
          {allCps.map(cp => <button key={cp} onClick={() => onFilterCp(cp)} style={btn(filterCp===cp)}>{cp}</button>)}
        </div>
      )}

      <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
        <span style={{ fontSize:11, color:T.text3, minWidth:80 }}>Сортировка:</span>
        {([ ["type","По типу"], ["name","По названию"], ["branch","По филиалу"] ] as const).map(([k,l]) => (
          <button key={k} onClick={() => onSortBy(k)} style={btn(sortBy===k)}>{l}</button>
        ))}
      </div>
    </div>
  );
}
