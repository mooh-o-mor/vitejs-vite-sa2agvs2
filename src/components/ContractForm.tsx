import type { FormState } from "../lib/types";
import { T, PRIORITY_LABELS } from "../lib/types";
import { fmoney, fdate, formatInput, unformat, contractDays, addDays } from "../lib/utils";

interface Props {
  form: FormState;
  editId: number | null;
  vesselName: string;
  readOnly?: boolean;
  onChange: (form: FormState) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function Field({ label, value, type, placeholder, half, readOnly, onChange }: {
  label: string; value: string; type: string;
  placeholder?: string; half?: boolean; readOnly?: boolean; onChange: (v: string) => void;
}) {
  const isNumeric = type === "number";
  return (
    <div style={{ marginBottom:12, flex: half ? 1 : "unset" as any }}>
      <div style={{ fontSize:11, color:T.text2, marginBottom:3 }}>{label}</div>
      <input
        type={isNumeric ? "text" : type}
        value={isNumeric ? formatInput(value) : value}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={e => !readOnly && onChange(isNumeric ? unformat(e.target.value) : e.target.value)}
        style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${T.border}`, background: readOnly ? T.bg3 : T.bg2, color:T.text, fontSize:13, boxSizing:"border-box", cursor: readOnly ? "default" : "text" }}
      />
    </div>
  );
}

const PRIORITY_COLORS: Record<string, string> = {
  contract: "#059669",
  kp: "#d97706",
  plan: "#6b7280",
};

export function ContractForm({ form, editId, vesselName, readOnly, onChange, onSave, onDelete, onClose }: Props) {
  const modal = { position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 };
  const modalBox = { background:T.bg2, borderRadius:10, padding:22, border:`1px solid ${T.border}`, boxShadow:"0 8px 40px rgba(0,0,0,0.15)" };

  const firmN = parseInt(form.firmDays)||0;
  const optN = parseInt(form.optionDays)||0;
  const days_ = form.start && form.end ? contractDays(form.start, form.end) : 0;
  const preview = days_*(+form.rate||0)+(+form.mob||0)+(+form.demob||0);

  function recalcEnd(start: string, firmDays: string, optionDays: string): string {
    const firm = parseInt(firmDays)||0;
    const option = parseInt(optionDays)||0;
    const total = firm + option;
    if (!start || total === 0) return form.end;
    return addDays(start, total);
  }

  return (
    <div style={modal}>
      <div style={{ ...modalBox, width:460 }}>
        <div style={{ fontSize:15, fontWeight:700, color:T.accent, marginBottom:4 }}>
          {readOnly ? "📋 Контракт" : editId ? "✏️ Редактировать контракт" : "➕ Новый контракт"}
        </div>
        {readOnly && (
          <div style={{ fontSize:11, color:T.amber, marginBottom:8 }}>👁 Режим просмотра — редактирование недоступно</div>
        )}
        <div style={{ fontSize:11, color:T.text2, marginBottom:14 }}>{vesselName}</div>

        <Field label="Контрагент" value={form.counterparty} type="text" readOnly={readOnly}
          onChange={v => onChange({...form, counterparty:v})} />

        {/* Priority + Alt Group */}
        <div style={{ display:"flex", gap:10, marginBottom:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:T.text2, marginBottom:3 }}>Тип</div>
            <div style={{ display:"flex", gap:4 }}>
              {(["contract", "kp", "plan"] as const).map(p => (
                <button
                  key={p}
                  onClick={() => !readOnly && onChange({...form, priority:p})}
                  style={{
                    flex:1, padding:"6px 4px", borderRadius:6, fontSize:11, fontWeight:600, cursor: readOnly ? "default" : "pointer",
                    border: `2px solid ${form.priority===p ? PRIORITY_COLORS[p] : T.border}`,
                    background: form.priority===p ? PRIORITY_COLORS[p] + "18" : T.bg2,
                    color: form.priority===p ? PRIORITY_COLORS[p] : T.text2,
                  }}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
          <div style={{ width:100 }}>
            <div style={{ fontSize:11, color:T.text2, marginBottom:3 }}>Группа альт.</div>
            <input
              type="text"
              value={form.altGroup}
              placeholder="—"
              readOnly={readOnly}
              onChange={e => !readOnly && onChange({...form, altGroup:e.target.value.replace(/\D/g,"")})}
              style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${T.border}`, background: readOnly ? T.bg3 : T.bg2, color:T.text, fontSize:13, boxSizing:"border-box", textAlign:"center", cursor: readOnly ? "default" : "text" }}
            />
          </div>
        </div>

        {form.altGroup && (
          <div style={{ background:"#fef3c7", borderRadius:6, padding:"5px 10px", marginBottom:12, fontSize:11, color:"#92400e", border:"1px solid #fde68a" }}>
            ⚡ Группа альтернатив #{form.altGroup} — контракты с одинаковым номером группы на одном судне считаются взаимоисключающими
          </div>
        )}

        <div style={{ display:"flex", gap:10 }}>
          <Field label="Начало" value={form.start} type="date" half readOnly={readOnly} onChange={v => {
            const newEnd = recalcEnd(v, form.firmDays, form.optionDays);
            onChange({...form, start:v, end:newEnd});
          }} />
          <Field label="Конец" value={form.end} type="date" half readOnly={readOnly} onChange={v => onChange({...form, end:v})} />
        </div>

        <div style={{ display:"flex", gap:10 }}>
          <Field label="Твёрдый период (дней)" value={form.firmDays} type="number" placeholder="0" half readOnly={readOnly} onChange={v => {
            const newEnd = recalcEnd(form.start, v, form.optionDays);
            onChange({...form, firmDays:v, end:newEnd});
          }} />
          <Field label="Опционы (дней)" value={form.optionDays} type="number" placeholder="0" half readOnly={readOnly} onChange={v => {
            const newEnd = recalcEnd(form.start, form.firmDays, v);
            onChange({...form, optionDays:v, end:newEnd});
          }} />
        </div>

        {(firmN>0 || optN>0) && (
          <div style={{ background:T.bg3, borderRadius:6, padding:"6px 10px", marginBottom:12, fontSize:11, color:T.text2, border:`1px solid ${T.border2}` }}>
            Твёрдый: <b>{firmN} дн.</b> · Опцион: <b>{optN} дн.</b> · Итого: <b>{firmN+optN} дн.</b> до <b>{fdate(form.end)}</b>
          </div>
        )}

        <Field label="Суточная ставка (₽)" value={form.rate} type="number" placeholder="0" readOnly={readOnly}
          onChange={v => onChange({...form, rate:v})} />

        <div style={{ display:"flex", gap:10 }}>
          <Field label="Мобилизация (₽)" value={form.mob} type="number" placeholder="0" half readOnly={readOnly} onChange={v => onChange({...form, mob:v})} />
          <Field label="Демобилизация (₽)" value={form.demob} type="number" placeholder="0" half readOnly={readOnly} onChange={v => onChange({...form, demob:v})} />
        </div>

        {days_>0 && (
          <div style={{ background:"#f0fdf4", borderRadius:6, padding:"7px 10px", marginBottom:12, fontSize:11, color:T.green, border:"1px solid #bbf7d0" }}>
            {days_} дней · Выручка: <b>{fmoney(preview)}</b>
            {form.priority !== "contract" && <span style={{ color:T.amber, marginLeft:8 }}>(не учитывается в итого — тип: {PRIORITY_LABELS[form.priority]})</span>}
          </div>
        )}

        <div style={{ display:"flex", gap:8 }}>
          {!readOnly && (
            <>
              <button onClick={onSave} style={{ flex:1, padding:9, borderRadius:6, border:"none", background:T.accent, color:"#fff", fontWeight:700, cursor:"pointer", fontSize:13 }}>
                {editId ? "Сохранить" : "Добавить"}
              </button>
              {editId && (
                <button onClick={onDelete} style={{ padding:"9px 12px", borderRadius:6, border:`1px solid ${T.red}`, background:"transparent", color:T.red, cursor:"pointer" }}>Удалить</button>
              )}
            </>
          )}
          <button onClick={onClose} style={{ padding:"9px 12px", borderRadius:6, border:`1px solid ${T.border}`, background:"transparent", color:T.text2, cursor:"pointer" }}>
            {readOnly ? "Закрыть" : "✕"}
          </button>
        </div>
      </div>
    </div>
  );
}
