import { Vessel, T } from "../lib/types";

interface Props {
  vessel: Vessel;
  onSave: (name: string, branch: string) => void;
  onClose: () => void;
}

export function VesselForm({ vessel, onSave, onClose }: Props) {
  const modal = { position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 };
  const modalBox = { background:T.bg2, borderRadius:10, padding:22, border:`1px solid ${T.border}`, boxShadow:"0 8px 40px rgba(0,0,0,0.15)" };

  let name = vessel.name;
  let branch = vessel.branch;

  return (
    <div style={modal}>
      <div style={{ ...modalBox, width:380 }}>
        <div style={{ fontSize:15, fontWeight:700, color:T.accent, marginBottom:16 }}>✏️ Редактировать судно</div>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, color:T.text2, marginBottom:3 }}>Название</div>
          <input defaultValue={vessel.name} onChange={e => { name = e.target.value; }}
            style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bg2, color:T.text, fontSize:13, boxSizing:"border-box" }} />
        </div>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, color:T.text2, marginBottom:3 }}>Филиал</div>
          <input defaultValue={vessel.branch} onChange={e => { branch = e.target.value; }} placeholder="Например: БФ"
            style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bg2, color:T.text, fontSize:13, boxSizing:"border-box" }} />
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={() => onSave(name, branch)} style={{ flex:1, padding:9, borderRadius:6, border:"none", background:T.accent, color:"#fff", fontWeight:700, cursor:"pointer", fontSize:13 }}>Сохранить</button>
          <button onClick={onClose} style={{ padding:"9px 12px", borderRadius:6, border:`1px solid ${T.border}`, background:"transparent", color:T.text2, cursor:"pointer" }}>✕</button>
        </div>
      </div>
    </div>
  );
}
