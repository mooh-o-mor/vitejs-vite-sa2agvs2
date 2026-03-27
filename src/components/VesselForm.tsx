import { useState } from "react";
import type { Vessel } from "../lib/types";
import { T } from "../lib/types";

interface Props {
  vessel: Vessel;
  onSave: (name: string, branch: string, imo: string, photoUrl: string) => void;
  onClose: () => void;
}

export function VesselForm({ vessel, onSave, onClose }: Props) {
  const [name, setName] = useState(vessel.name);
  const [branch, setBranch] = useState(vessel.branch);
  const [imo, setImo] = useState(vessel.imo || "");
  const [photoUrl, setPhotoUrl] = useState(vessel.photo_url || "");

  const modal = { position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 };
  const modalBox = { background:T.bg2, borderRadius:10, padding:22, border:`1px solid ${T.border}`, boxShadow:"0 8px 40px rgba(0,0,0,0.15)" };

  return (
    <div style={modal}>
      <div style={{ ...modalBox, width: 420 }}>
        <div style={{ fontSize:15, fontWeight:700, color:T.accent, marginBottom:16 }}>✏️ Редактировать судно</div>
        
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, color:T.text2, marginBottom:3 }}>Название</div>
          <input value={name} onChange={e => setName(e.target.value)} style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bg2, color:T.text, fontSize:13 }} />
        </div>
        
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, color:T.text2, marginBottom:3 }}>Филиал</div>
          <input value={branch} onChange={e => setBranch(e.target.value)} placeholder="Например: БЛТФ" style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bg2, color:T.text, fontSize:13 }} />
        </div>
        
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, color:T.text2, marginBottom:3 }}>IMO номер</div>
          <input value={imo} onChange={e => setImo(e.target.value)} placeholder="Например: 9663219" style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bg2, color:T.text, fontSize:13 }} />
        </div>
        
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, color:T.text2, marginBottom:3 }}>URL фото</div>
          <input value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="https://..." style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bg2, color:T.text, fontSize:13 }} />
        </div>
        
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={() => onSave(name, branch, imo, photoUrl)} style={{ flex:1, padding:9, borderRadius:6, border:"none", background:T.accent, color:"#fff", fontWeight:700, cursor:"pointer", fontSize:13 }}>Сохранить</button>
          <button onClick={onClose} style={{ padding:"9px 12px", borderRadius:6, border:`1px solid ${T.border}`, background:"transparent", color:T.text2, cursor:"pointer" }}>✕</button>
        </div>
      </div>
    </div>
  );
}
