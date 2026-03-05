import { useState } from "react";
import { T, ADMIN_PASSWORD } from "../lib/types";

interface Props {
  onLogin: () => void;
  onClose: () => void;
}

export function LoginForm({ onLogin, onClose }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  const modal = { position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 };
  const modalBox = { background:T.bg2, borderRadius:10, padding:22, border:`1px solid ${T.border}`, boxShadow:"0 8px 40px rgba(0,0,0,0.15)" };

  function tryLogin() {
    if (password === ADMIN_PASSWORD) {
      onLogin();
    } else {
      setError(true);
    }
  }

  return (
    <div style={modal}>
      <div style={{ ...modalBox, width:320 }}>
        <div style={{ fontSize:16, fontWeight:700, color:T.accent, marginBottom:4 }}>🔒 Вход</div>
        <div style={{ fontSize:12, color:T.text2, marginBottom:16 }}>Введите пароль для доступа к финансовым данным</div>
        <input
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(false); }}
          onKeyDown={e => e.key==="Enter" && tryLogin()}
          placeholder="Пароль"
          autoFocus
          style={{ width:"100%", padding:"10px 12px", borderRadius:6, border:`1px solid ${error?T.red:T.border}`, background:T.bg2, color:T.text, fontSize:14, boxSizing:"border-box", marginBottom:4 }}
        />
        {error && <div style={{ fontSize:11, color:T.red, marginBottom:8 }}>Неверный пароль</div>}
        <div style={{ display:"flex", gap:8, marginTop:8 }}>
          <button onClick={tryLogin} style={{ flex:1, padding:10, borderRadius:6, border:"none", background:T.accent, color:"#fff", fontWeight:700, cursor:"pointer", fontSize:13 }}>Войти</button>
          <button onClick={onClose} style={{ padding:"10px 14px", borderRadius:6, border:`1px solid ${T.border}`, background:"transparent", color:T.text2, cursor:"pointer" }}>✕</button>
        </div>
      </div>
    </div>
  );
}
