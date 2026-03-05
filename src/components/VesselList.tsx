import { useState } from "react";
import type { Vessel, Contract } from "../lib/types";
import { T, typeOrder } from "../lib/types";
import { getType } from "../lib/utils";

interface Props {
  vessels: Vessel[];
  contracts: Contract[];
  onAdd: (name: string, branch: string) => void;
  onEdit: (vessel: Vessel) => void;
  onDelete: (id: number) => void;
}

export function VesselList({ vessels, contracts, onAdd, onEdit, onDelete }: Props) {
  const [newType, setNewType] = useState(typeOrder[0]);
  const [newShortName, setNewShortName] = useState("");
  const [newBranch, setNewBranch] = useState("");

  function handleAdd() {
    if (!newShortName.trim()) return;
    onAdd(`${newType} ${newShortName.trim()}`, newBranch.trim());
    setNewShortName("");
    setNewBranch("");
  }

  return (
    <div>
      <div style={{ background:T.bg2, borderRadius:8, padding:16, marginBottom:16, border:`1px solid ${T.border}` }}>
        <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:12 }}>Добавить судно</div>
        <div style={{ display:"flex", gap:8, marginBottom:8 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:T.text2, marginBottom:3 }}>Тип</div>
            <select value={newType} onChange={e => setNewType(e.target.value)} style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bg2, color:T.text, fontSize:13 }}>
              {typeOrder.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex:2 }}>
            <div style={{ fontSize:11, color:T.text2, marginBottom:3 }}>Название</div>
            <input value={newShortName} onChange={e => setNewShortName(e.target.value)} placeholder="Например: Балтика"
              style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bg2, color:T.text, fontSize:13, boxSizing:"border-box" }} />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:T.text2, marginBottom:3 }}>Филиал</div>
            <input value={newBranch} onChange={e => setNewBranch(e.target.value)} placeholder="БФ, СевФ..."
              style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bg2, color:T.text, fontSize:13, boxSizing:"border-box" }} />
          </div>
        </div>
        {newShortName && (
          <div style={{ fontSize:11, color:T.text3, marginBottom:8 }}>
            Будет добавлено: <b style={{ color:T.text }}>{newType} {newShortName}</b>
          </div>
        )}
        <button onClick={handleAdd} style={{ padding:"8px 20px", borderRadius:6, border:"none", background:T.accent, color:"#fff", fontWeight:700, cursor:"pointer" }}>
          + Добавить судно
        </button>
      </div>

      {typeOrder.map(type => {
        const grp = vessels.filter(v => getType(v.name, typeOrder)===type);
        if (!grp.length) return null;
        return (
          <div key={type} style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.text3, marginBottom:5, letterSpacing:1 }}>{type}</div>
            {grp.map(v => (
              <div key={v.id} style={{ display:"flex", alignItems:"center", background:T.bg2, borderRadius:6, padding:"9px 12px", marginBottom:4, border:`1px solid ${T.border}` }}>
                <span style={{ marginRight:8 }}>🚢</span>
                <span style={{ flex:1, fontSize:12, color:T.text }}>{v.name}</span>
                {v.branch && <span style={{ color:T.amber, fontSize:11, marginRight:10 }}>{v.branch}</span>}
                <span style={{ color:T.text3, fontSize:11, marginRight:8 }}>{contracts.filter(c => c.vesselId===v.id).length} контр.</span>
                <button onClick={() => onEdit(v)} style={{ padding:"2px 8px", borderRadius:4, border:`1px solid ${T.border}`, background:"transparent", color:T.text2, cursor:"pointer", fontSize:11, marginRight:4 }}>✎</button>
                <button onClick={() => onDelete(v.id)} style={{ padding:"2px 8px", borderRadius:4, border:`1px solid ${T.red}`, background:"transparent", color:T.red, cursor:"pointer", fontSize:11 }}>✕</button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
