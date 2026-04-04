import { useState } from "react";
import type { Vessel, Contract } from "../lib/types";
import { T, typeOrder } from "../lib/types";
import { getType, formatVesselName, formatVesselType } from "../lib/utils";
import { supabase } from "../lib/supabase";

interface Props {
  vessels: Vessel[];
  contracts: Contract[];
  onAdd: (name: string, branch: string, imo: string) => void;
  onEdit: (vessel: Vessel) => void;
  onDelete: (id: number) => void;
  onVesselUpdate?: () => void;
}

export function VesselList({ vessels, contracts, onAdd, onEdit, onDelete, onVesselUpdate }: Props) {
  const [newType, setNewType] = useState(typeOrder[0]);
  const [newShortName, setNewShortName] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [newImo, setNewImo] = useState("");

  async function toggleShowOnGantt(vessel: Vessel) {
    const newValue = !vessel.show_on_gantt;
    const { error } = await supabase
      .from("vessels")
      .update({ show_on_gantt: newValue })
      .eq("id", vessel.id);
    if (!error) {
      // Обновляем локальное состояние
      vessel.show_on_gantt = newValue;
      // Обновляем список судов в родителе
      if (onVesselUpdate) onVesselUpdate();
    } else {
      console.error("Ошибка обновления:", error);
    }
  }

  function handleAdd() {
    if (!newShortName.trim()) return;
    onAdd(`${newType} ${newShortName.trim()}`, newBranch.trim(), newImo.trim());
    setNewShortName("");
    setNewBranch("");
    setNewImo("");
  }

  const formatDisplayName = (name: string): string => {
    const type = getType(name, typeOrder);
    const nameWithoutPrefix = name.replace(/^(мфасс|тбс|ссн|мбс|мвс|мб|нис|асс|скб)\s+/i, "").trim();
    const formattedType = formatVesselType(type);
    const formattedName = formatVesselName(nameWithoutPrefix);
    return formattedType ? `${formattedType} ${formattedName}` : formattedName;
  };

  return (
    <div>
      <div style={{ background: T.bg2, borderRadius: 8, padding: 16, marginBottom: 16, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>Добавить судно</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{ width: 100 }}>
            <div style={{ fontSize: 11, color: T.text2, marginBottom: 3 }}>Тип</div>
            <select value={newType} onChange={e => setNewType(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.bg2, color: T.text, fontSize: 13 }}>
              {typeOrder.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: 2 }}>
            <div style={{ fontSize: 11, color: T.text2, marginBottom: 3 }}>Название</div>
            <input value={newShortName} onChange={e => setNewShortName(e.target.value)} placeholder="Например: Балтика"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.bg2, color: T.text, fontSize: 13, boxSizing: "border-box" }} />
          </div>
          <div style={{ width: 120 }}>
            <div style={{ fontSize: 11, color: T.text2, marginBottom: 3 }}>Филиал</div>
            <input value={newBranch} onChange={e => setNewBranch(e.target.value)} placeholder="БЛТФ"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.bg2, color: T.text, fontSize: 13, boxSizing: "border-box" }} />
          </div>
          <div style={{ width: 120 }}>
            <div style={{ fontSize: 11, color: T.text2, marginBottom: 3 }}>IMO (опц.)</div>
            <input value={newImo} onChange={e => setNewImo(e.target.value)} placeholder="9663219"
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.bg2, color: T.text, fontSize: 13, boxSizing: "border-box" }} />
          </div>
        </div>
        {newShortName && (
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>
            Будет добавлено: <b style={{ color: T.text }}>{newType} {formatVesselName(newShortName)}</b>
          </div>
        )}
        <button onClick={handleAdd} style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: T.accent, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          + Добавить судно
        </button>
      </div>

      {typeOrder.map(type => {
        const grp = vessels.filter(v => getType(v.name, typeOrder) === type);
        if (!grp.length) return null;
        return (
          <div key={type} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, marginBottom: 5, letterSpacing: 1 }}>{type}</div>
            {grp.map(v => {
              const displayName = formatDisplayName(v.name);
              return (
                <div key={v.id} style={{ display: "flex", alignItems: "center", background: T.bg2, borderRadius: 6, padding: "9px 12px", marginBottom: 4, border: `1px solid ${T.border}`, gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: T.text, flex: 1 }}>{displayName}</span>
                  {v.branch && (
                    <span style={{ color: T.amber, fontSize: 12, background: T.bg3, padding: "2px 8px", borderRadius: 4 }}>{v.branch}</span>
                  )}
                  <span style={{ color: T.text3, fontSize: 11, background: T.bg3, padding: "2px 8px", borderRadius: 4 }}>
                    {contracts.filter(c => c.vesselId === v.id).length} контр.
                  </span>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={v.show_on_gantt !== false}
                      onChange={() => toggleShowOnGantt(v)}
                      style={{ cursor: "pointer", width: 16, height: 16 }}
                    />
                    <span style={{ color: T.text2 }}>Показывать в расстановке</span>
                  </label>
                 <button onClick={() => onEdit(v)} style={{ padding: "4px 10px", borderRadius: 4, border: `1px solid ${T.border}`, background: "transparent", color: T.text2, cursor: "pointer", fontSize: 12 }}>✎</button>
                  <button onClick={() => onDelete(v.id)} style={{ padding: "4px 10px", borderRadius: 4, border: `1px solid ${T.red}`, background: "transparent", color: T.red, cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
