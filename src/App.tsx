import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://otjiwxvszomwpqmwusqd.supabase.co",
  "sb_publishable_P2rqYUz4DyEuwEiFGs3nBQ_s1DK3JXh"
);

const COLORS = [
  "#1D4ED8","#059669","#D97706","#DC2626","#7C3AED",
  "#DB2777","#0891B2","#65A30D","#EA580C","#4F46E5",
  "#0D9488","#E11D48","#9333EA","#16A34A","#CA8A04"
];

const MONTHS = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];

const initialVessels = [
  {id:1,name:"МФАСС Балтика",branch:""},{id:2,name:"МФАСС Берингов Пролив",branch:""},
  {id:3,name:"МФАСС Мурман",branch:""},{id:4,name:"МФАСС Спасатель Карев",branch:""},
  {id:5,name:"МФАСС Спасатель Кавдейкин",branch:""},{id:6,name:"МФАСС Спасатель Заборщиков",branch:""},
  {id:7,name:"МФАСС Спасатель Демидов",branch:""},{id:8,name:"МФАСС Спасатель Ильин",branch:""},
  {id:9,name:"ТБС Умка",branch:""},{id:10,name:"ТБС Нарвал",branch:""},
  {id:11,name:"ТБС Сивуч",branch:""},{id:12,name:"ТБС Финвал",branch:""},
  {id:13,name:"ТБС Сейвал",branch:""},{id:14,name:"ССН Балтийский Исследователь",branch:""},
  {id:15,name:"МФАСС Бахтемир",branch:""},{id:16,name:"МФАСС Бейсуг",branch:""},
  {id:17,name:"МФАСС Калас",branch:""},{id:18,name:"МФАСС Пильтун",branch:""},
  {id:19,name:"ССН Артемис Оффшор",branch:""},{id:20,name:"ТБС Нефтегаз-55",branch:""},
  {id:21,name:"ТБС Отто Шмидт",branch:""},{id:22,name:"ТБС Капитан Мартышкин",branch:""},
  {id:23,name:"ТБС Ясный",branch:""},{id:24,name:"МБС Капитан Беклемишев",branch:""},
  {id:25,name:"МБС Эпрон",branch:""},{id:26,name:"МБС Атлас",branch:""},
  {id:27,name:"МБС Рубин",branch:""},{id:28,name:"МБС Лазурит",branch:""},
  {id:29,name:"ТБС Светломор-3",branch:""},{id:30,name:"МВС Ст. Град Ярославль",branch:""},
  {id:31,name:"МВС Углич",branch:""},{id:32,name:"МВС Ростов Великий",branch:""},
  {id:33,name:"МВС Рыбинск",branch:""},{id:34,name:"МБ Амбер",branch:""},
  {id:35,name:"МБ Руби",branch:""},{id:36,name:"МБ Бэй",branch:""},
  {id:37,name:"ССН Игорь Ильин",branch:""},{id:38,name:"МБ Пенай",branch:""},
  {id:39,name:"НИС Виктор Буйницкий",branch:""},{id:40,name:"НИС Импульс",branch:""},
];

const YEAR = 2026;
const yearStart = new Date(YEAR, 0, 1);
const yearEnd = new Date(YEAR, 11, 31);
const totalDays = (yearEnd.getTime() - yearStart.getTime()) / 86400000 + 1;
const typeOrder = ["МФАСС","ТБС","ССН","МБС","МВС","МБ","НИС"];

const T = {
  bg:"#f8fafc", bg2:"#ffffff", bg3:"#f1f5f9",
  border:"#cbd5e1", border2:"#e2e8f0",
  text:"#0f172a", text2:"#475569", text3:"#94a3b8",
  accent:"#1d4ed8", green:"#059669", amber:"#d97706", red:"#dc2626",
  header:"#1e40af",
};

function getType(name: string) {
  for (const t of typeOrder) if (name.startsWith(t)) return t;
  return "Другие";
}
function dayOffset(dateStr: string) {
  const d = new Date(dateStr);
  return Math.max(0, Math.min((d.getTime() - yearStart.getTime()) / 86400000, totalDays));
}
function contractDaysGantt(start: string, end: string) {
  const s = new Date(Math.max(new Date(start).getTime(), yearStart.getTime()));
  const e = new Date(Math.min(new Date(end).getTime(), yearEnd.getTime()));
  return Math.max(0, (e.getTime() - s.getTime()) / 86400000 + 1);
}
function contractDays(start: string, end: string) {
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 86400000 + 1);
}
function fmoney(n: number) {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
}
function fdate(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}
function formatInput(val: string): string {
  const digits = val.replace(/\D/g, "");
  if (!digits) return "";
  return new Intl.NumberFormat("ru-RU").format(Number(digits));
}
function unformat(val: string): string {
  return val.replace(/\D/g, "");
}

async function exportToPPTX(vesselsToExport: Vessel[], contractsToExport: Contract[], filterCp: string) {
  const pptxgen = (await import("pptxgenjs")).default;
  const prs = new pptxgen();
  prs.defineLayout({ name: "A3", width: 16.54, height: 11.69 });
  prs.layout = "A3";
  const slide = prs.addSlide();
  slide.background = { color: "ffffff" };
  const filteredContracts = filterCp === "Все" ? contractsToExport : contractsToExport.filter(c => c.counterparty === filterCp);
  slide.addText(`Флот МСС — Диаграмма Ганта ${YEAR}`, { x:0.2, y:0.1, w:16, h:0.4, fontSize:18, bold:true, color:"1e40af", fontFace:"Arial" });
  const LEFT=2.2, TOP=0.65, ROW_H=0.22, ROW_GAP=0.02, CHART_W=13.8, TOTAL=totalDays;
  const cpList = [...new Set(filteredContracts.map(c => c.counterparty))];
  const colorMap: Record<string,string> = Object.fromEntries(cpList.map((cp,i) => [cp, COLORS[i%COLORS.length].replace("#","")]));
  let legendX = LEFT;
  cpList.forEach(cp => {
    slide.addShape(prs.ShapeType.rect, { x:legendX, y:0.48, w:0.12, h:0.12, fill:{color:colorMap[cp]}, line:{color:colorMap[cp]} });
    slide.addText(cp, { x:legendX+0.15, y:0.46, w:1.6, h:0.16, fontSize:7, color:"0f172a", fontFace:"Arial" });
    legendX += 1.8;
  });
  let mx = LEFT;
  MONTHS.forEach((m,i) => {
    const daysInMonth = new Date(YEAR,i+1,0).getDate();
    const w = (daysInMonth/TOTAL)*CHART_W;
    slide.addText(m, { x:mx, y:TOP-0.18, w, h:0.16, fontSize:7, color:"475569", align:"center", fontFace:"Arial" });
    slide.addShape(prs.ShapeType.line, { x:mx, y:TOP-0.18, w:0, h:vesselsToExport.length*(ROW_H+ROW_GAP)+0.2, line:{color:"cbd5e1",width:0.5} });
    mx += w;
  });
  vesselsToExport.forEach((v,idx) => {
    const y = TOP + idx*(ROW_H+ROW_GAP);
    const vc = filteredContracts.filter(c => c.vesselId === v.id);
    slide.addShape(prs.ShapeType.rect, { x:0.1, y, w:LEFT+CHART_W+0.1, h:ROW_H, fill:{color:idx%2===0?"f8fafc":"f1f5f9"}, line:{color:idx%2===0?"f8fafc":"f1f5f9"} });
    slide.addText(v.name, { x:0.12, y:y+0.01, w:LEFT-0.15, h:ROW_H-0.02, fontSize:6.5, color:"0f172a", fontFace:"Arial", valign:"middle" });
    if (v.branch) slide.addText(v.branch, { x:0.12, y:y+0.01, w:LEFT-0.15, h:ROW_H-0.02, fontSize:5.5, color:"d97706", fontFace:"Arial", valign:"middle", align:"right" });
    vc.forEach(c => {
      const s = new Date(Math.max(new Date(c.start).getTime(), yearStart.getTime()));
      const e = new Date(Math.min(new Date(c.end).getTime(), yearEnd.getTime()));
      if (e < s) return;
      const startOff = (s.getTime()-yearStart.getTime())/86400000;
      const duration = (e.getTime()-s.getTime())/86400000+1;
      const bx = LEFT+(startOff/TOTAL)*CHART_W;
      const bw = Math.max((duration/TOTAL)*CHART_W, 0.05);
      const color = colorMap[c.counterparty]||"1D4ED8";
      slide.addShape(prs.ShapeType.rect, { x:bx, y:y+0.025, w:bw, h:ROW_H-0.05, fill:{color}, line:{color} });
      if (bw>0.4) slide.addText(c.counterparty, { x:bx+0.03, y:y+0.025, w:bw-0.04, h:ROW_H-0.05, fontSize:5.5, color:"ffffff", fontFace:"Arial", valign:"middle", bold:true });
    });
  });
  const totalRev = filteredContracts.reduce((s,c) => s+contractDays(c.start,c.end)*c.rate+c.mob+c.demob, 0);
  slide.addText(`Выручка: ${fmoney(totalRev)}`, { x:0.2, y:11.3, w:16, h:0.3, fontSize:10, bold:true, color:"059669", fontFace:"Arial" });
  await prs.writeFile({ fileName:`флот_МСС_${YEAR}.pptx` });
}

interface FieldProps {
  label: string; value: string; type: string;
  placeholder?: string; half?: boolean; onChange: (v: string) => void;
}
function Field({ label, value, type, placeholder, half, onChange }: FieldProps) {
  const isNumeric = type === "number";
  return (
    <div style={{ marginBottom:12, flex: half ? 1 : "unset" as any }}>
      <div style={{ fontSize:11, color:T.text2, marginBottom:3 }}>{label}</div>
      <input
        type={isNumeric ? "text" : type}
        value={isNumeric ? formatInput(value) : value}
        placeholder={placeholder}
        onChange={e => onChange(isNumeric ? unformat(e.target.value) : e.target.value)}
        style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bg2, color:T.text, fontSize:13, boxSizing:"border-box" }}
      />
    </div>
  );
}

interface Vessel { id: number; name: string; branch: string; }
interface Contract {
  id: number; vesselId: number; counterparty: string;
  start: string; end: string; rate: number; mob: number; demob: number;
}
interface FormState {
  counterparty: string; start: string; end: string;
  rate: string; mob: string; demob: string;
}

let nextId = 1000;

export default function App() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState("gantt");
  const [filterType, setFilterType] = useState("Все");
  const [filterBranch, setFilterBranch] = useState("Все");
  const [filterCp, setFilterCp] = useState("Все");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showVesselForm, setShowVesselForm] = useState(false);
  const [editVesselId, setEditVesselId] = useState<number|null>(null);
  const [editId, setEditId] = useState<number|null>(null);
  const [activeVessel, setActiveVessel] = useState<number|null>(null);
  const [newName, setNewName] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [editingBranch, setEditingBranch] = useState("");
  const [editingName, setEditingName] = useState("");
  const [form, setForm] = useState<FormState>({
    counterparty:"", start:`${YEAR}-01-01`, end:`${YEAR}-12-31`, rate:"", mob:"", demob:""
  });

  // Загрузка данных из Supabase
  useEffect(() => {
    loadData();

    // Подписка на изменения в реальном времени
    const vesselsSub = supabase.channel("vessels-changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"vessels" }, () => loadData())
      .subscribe();
    const contractsSub = supabase.channel("contracts-changes")
      .on("postgres_changes", { event:"*", schema:"public", table:"contracts" }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(vesselsSub);
      supabase.removeChannel(contractsSub);
    };
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: vData }, { data: cData }] = await Promise.all([
      supabase.from("vessels").select("*").order("id"),
      supabase.from("contracts").select("*").order("id"),
    ]);

    if (vData && vData.length === 0) {
      // Первый запуск — заполняем начальными данными
      await supabase.from("vessels").insert(initialVessels);
      setVessels(initialVessels);
    } else {
      setVessels((vData || []).map((v: any) => ({ id:v.id, name:v.name, branch:v.branch||"" })));
    }

    setContracts((cData || []).map((c: any) => ({
      id: c.id, vesselId: c.vessel_id, counterparty: c.counterparty,
      start: c.start_date, end: c.end_date,
      rate: c.rate, mob: c.mob, demob: c.demob
    })));
    setLoading(false);
  }

 async function save() {
    if (!form.counterparty || !form.start || !form.end) return;
    setSyncing(true);
    const data = {
      vessel_id: activeVessel,
      counterparty: form.counterparty,
      start_date: form.start,
      end_date: form.end,
      rate: +form.rate||0,
      mob: +form.mob||0,
      demob: +form.demob||0,
    };
    if (editId) {
      const { error } = await supabase.from("contracts").update(data).eq("id", editId);
      if (error) alert("Ошибка обновления: " + error.message);
    } else {
      const { data: result, error } = await supabase.from("contracts").insert({ ...data }).select();
console.log("result:", result, "error:", error);
alert(JSON.stringify({ result, error }));
      if (error) alert("Ошибка добавления: " + error.message);
    }
    setSyncing(false);
    setShowForm(false);
    await loadData();
  }
  async function delC(id: number) {
    setSyncing(true);
    await supabase.from("contracts").delete().eq("id", id);
    setSyncing(false);
    setShowForm(false);
    await loadData();
  }

  async function addV() {
    if (!newName.trim()) return;
    setSyncing(true);
    const maxId = vessels.reduce((m, v) => Math.max(m, v.id), 0);
    await supabase.from("vessels").insert({ id: maxId+1, name: newName.trim(), branch: newBranch.trim() });
    setNewName(""); setNewBranch("");
    setSyncing(false);
    await loadData();
  }

  async function delV(id: number) {
    setSyncing(true);
    await supabase.from("contracts").delete().eq("vessel_id", id);
    await supabase.from("vessels").delete().eq("id", id);
    setSyncing(false);
    await loadData();
  }

  async function saveVessel() {
    setSyncing(true);
    await supabase.from("vessels").update({ name: editingName, branch: editingBranch }).eq("id", editVesselId);
    setSyncing(false);
    setShowVesselForm(false);
    await loadData();
  }

  function openAdd(vid: number) {
    setEditId(null);
    setForm({ counterparty:"", start:`${YEAR}-01-01`, end:`${YEAR}-12-31`, rate:"", mob:"", demob:"" });
    setActiveVessel(vid); setShowForm(true);
  }
  function openEdit(c: Contract) {
    setEditId(c.id);
    setForm({ counterparty:c.counterparty, start:c.start, end:c.end, rate:String(c.rate), mob:String(c.mob), demob:String(c.demob) });
    setActiveVessel(c.vesselId); setShowForm(true);
  }
  function openEditVessel(v: Vessel) {
    setEditVesselId(v.id); setEditingName(v.name); setEditingBranch(v.branch); setShowVesselForm(true);
  }
  function econ(vid: number) {
    return visibleContracts.filter(c => c.vesselId===vid).map(c => {
      const days = contractDays(c.start, c.end);
      return { ...c, days, revenue: days*c.rate+c.mob+c.demob };
    });
  }

  const cpList = [...new Set(contracts.map(c => c.counterparty))];
  const colorMap: Record<string,string> = Object.fromEntries(cpList.map((cp,i) => [cp, COLORS[i%COLORS.length]]));
  const allTypes = ["Все", ...typeOrder.filter(t => vessels.some(v => getType(v.name)===t))];
  const allBranches = ["Все", ...Array.from(new Set(vessels.map(v => v.branch).filter(Boolean)))];
  const allCps = ["Все", ...cpList];
  const filtered = vessels.filter(v => {
    const typeOk = filterType==="Все" || getType(v.name)===filterType;
    const branchOk = filterBranch==="Все" || v.branch===filterBranch;
    return typeOk && branchOk;
  });
  const visibleContracts = filterCp==="Все" ? contracts : contracts.filter(c => c.counterparty===filterCp);
  const totalRev = visibleContracts.filter(c => filtered.some(v => v.id===c.vesselId))
    .reduce((s,c) => s+contractDays(c.start,c.end)*c.rate+c.mob+c.demob, 0);
  const days_ = form.start && form.end ? contractDays(form.start, form.end) : 0;
  const preview = days_*(+form.rate||0)+(+form.mob||0)+(+form.demob||0);
  const activeVesselName = vessels.find(v => v.id===activeVessel)?.name;

  const btnFilter = (active: boolean, amber?: boolean) => ({
    padding:"4px 12px", borderRadius:20, border:"1px solid", cursor:"pointer", fontSize:12, fontWeight:600,
    borderColor: active ? (amber ? T.amber : T.accent) : T.border,
    background: active ? (amber ? T.amber : T.accent) : T.bg2,
    color: active ? "#ffffff" : T.text2
  } as React.CSSProperties);

  const modal = { position:"fixed" as const, inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 };
  const modalBox = { background:T.bg2, borderRadius:10, padding:22, border:`1px solid ${T.border}`, boxShadow:"0 8px 40px rgba(0,0,0,0.15)" };

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:T.bg, flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:32 }}>⚓</div>
      <div style={{ fontSize:16, color:T.text2 }}>Загрузка данных...</div>
    </div>
  );

  return (
    <div style={{ fontFamily:"Arial,sans-serif", background:T.bg, minHeight:"100vh", color:T.text }}>

      <div style={{ background:T.header, borderBottom:`1px solid ${T.border}`, padding:"12px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ fontSize:18, fontWeight:700, color:"#ffffff" }}>⚓ Флот МСС — {YEAR}</span>
        <span style={{ fontSize:12, color:"#bfdbfe" }}>{vessels.length} судов · {contracts.length} контрактов</span>
        {syncing && <span style={{ fontSize:11, color:"#93c5fd" }}>⟳ сохранение...</span>}
        <span style={{ marginLeft:"auto", fontSize:13, marginRight:12, color:"#ffffff" }}>
          Выручка: <b style={{ color:"#86efac" }}>{fmoney(totalRev)}</b>
        </span>
        <div style={{ position:"relative" }}>
          <button onClick={() => setShowExportMenu(v => !v)} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #93c5fd", background:"rgba(255,255,255,0.15)", color:"#ffffff", cursor:"pointer", fontSize:12, fontWeight:600 }}>
            ⬇ Экспорт PPTX ▾
          </button>
          {showExportMenu && (
            <div style={{ position:"absolute", right:0, top:"110%", background:T.bg2, border:`1px solid ${T.border}`, borderRadius:8, padding:16, zIndex:50, width:300, boxShadow:"0 8px 32px rgba(0,0,0,0.15)" }}>
              <div style={{ fontSize:12, color:T.text2, marginBottom:10 }}>Выберите что экспортировать:</div>
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Тип судна</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                  {allTypes.map(t => <button key={t} onClick={() => setFilterType(t)} style={btnFilter(filterType===t)}>{t}</button>)}
                </div>
              </div>
              {allBranches.length>1 && (
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Филиал</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                    {allBranches.map(b => <button key={b} onClick={() => setFilterBranch(b)} style={btnFilter(filterBranch===b, true)}>{b||"Без филиала"}</button>)}
                  </div>
                </div>
              )}
              {allCps.length>1 && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Контрагент</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                    {allCps.map(cp => <button key={cp} onClick={() => setFilterCp(cp)} style={btnFilter(filterCp===cp)}>{cp}</button>)}
                  </div>
                </div>
              )}
              <div style={{ fontSize:11, color:T.text2, marginBottom:8 }}>
                Будет экспортировано: <b style={{ color:T.text }}>{filtered.length} судов</b>
                {filterCp!=="Все" && <span style={{ color:T.accent }}> · только {filterCp}</span>}
              </div>
              <button onClick={() => { exportToPPTX(filtered, contracts, filterCp); setShowExportMenu(false); }} style={{ width:"100%", padding:9, borderRadius:6, border:"none", background:T.accent, color:"#ffffff", fontWeight:700, cursor:"pointer", fontSize:13 }}>
                ⬇ Скачать PPTX
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display:"flex", background:T.bg2, borderBottom:`1px solid ${T.border}`, padding:"0 16px" }}>
        {[["gantt","📊 Ганта"],["economics","💰 Экономика"],["vessels","🚢 Суда"]].map(([k,l]) => (
          <button key={k} onClick={() => setActiveTab(k)} style={{
            padding:"10px 18px", border:"none", cursor:"pointer", fontSize:13, fontWeight:600, marginRight:4, background:"transparent",
            color: activeTab===k ? T.accent : T.text2,
            borderBottom: activeTab===k ? `2px solid ${T.accent}` : "2px solid transparent"
          }}>{l}</button>
        ))}
      </div>

      <div style={{ padding:16 }}>
        {(activeTab==="gantt"||activeTab==="economics") && (
          <>
            <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap" }}>
              {allTypes.map(t => <button key={t} onClick={() => setFilterType(t)} style={btnFilter(filterType===t)}>{t}</button>)}
            </div>
            {allBranches.length>1 && (
              <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap" }}>
                {allBranches.map(b => <button key={b} onClick={() => setFilterBranch(b)} style={btnFilter(filterBranch===b, true)}>{b||"Без филиала"}</button>)}
              </div>
            )}
            {allCps.length>1 && (
              <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
                <span style={{ fontSize:11, color:T.text3 }}>Контрагент:</span>
                {allCps.map(cp => <button key={cp} onClick={() => setFilterCp(cp)} style={btnFilter(filterCp===cp)}>{cp}</button>)}
              </div>
            )}
          </>
        )}

        {activeTab==="gantt" && (
          <div style={{ background:T.bg2, borderRadius:8, padding:12, border:`1px solid ${T.border}` }}>
            {cpList.length>0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
                {cpList.map(cp => (
                  <div key={cp} style={{ display:"flex", alignItems:"center", gap:5, background:T.bg3, padding:"2px 10px", borderRadius:20, fontSize:11, border:`1px solid ${T.border2}` }}>
                    <div style={{ width:9, height:9, borderRadius:2, background:colorMap[cp] }}/>{cp}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:"flex", marginLeft:190, marginBottom:2 }}>
              {MONTHS.map((m,i) => {
                const d = new Date(YEAR,i+1,0).getDate();
                return <div key={m} style={{ width:`${(d/totalDays)*100}%`, textAlign:"center", fontSize:10, color:T.text2, borderLeft:`1px solid ${T.border2}` }}>{m}</div>;
              })}
            </div>
            {filtered.map((v,idx) => {
              const vc = visibleContracts.filter(c => c.vesselId===v.id);
              return (
                <div key={v.id} style={{ display:"flex", alignItems:"center", marginBottom:3 }}>
                  <div style={{ width:190, flexShrink:0, fontSize:11, color:T.text, paddingRight:8, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }} title={`${v.name}${v.branch?` (${v.branch})`:""}`}>
                    {v.name}
                    {v.branch && <span style={{ color:T.amber, marginLeft:4, fontSize:10 }}>{v.branch}</span>}
                  </div>
                  <div style={{ flex:1, height:28, background:idx%2===0?T.bg3:T.bg2, borderRadius:4, position:"relative", border:`1px solid ${T.border2}`, cursor:"pointer" }} onClick={() => openAdd(v.id)}>
                    {MONTHS.map((_,i) => {
                      const off = (new Date(YEAR,i,1).getTime()-yearStart.getTime())/86400000;
                      return <div key={i} style={{ position:"absolute", left:`${(off/totalDays)*100}%`, top:0, bottom:0, width:1, background:T.border2, pointerEvents:"none" }}/>;
                    })}
                    {vc.map(c => {
                      const left = (dayOffset(c.start)/totalDays)*100;
                      const width = (contractDaysGantt(c.start,c.end)/totalDays)*100;
                      const color = colorMap[c.counterparty]||COLORS[0];
                      return (
                        <div key={c.id} title={`${c.counterparty}\n${fdate(c.start)} → ${fdate(c.end)}\n${fmoney(c.rate)}/сут`}
                          onClick={e => { e.stopPropagation(); openEdit(c); }}
                          style={{ position:"absolute", left:`${left}%`, width:`${Math.max(width,0.4)}%`, top:3, bottom:3, background:color, borderRadius:3, cursor:"pointer", display:"flex", alignItems:"center", overflow:"hidden", fontSize:10, fontWeight:600, color:"#fff", paddingLeft:5, boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}>
                          <span style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{c.counterparty}</span>
                        </div>
                      );
                    })}
                    {vc.length===0 && <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", paddingLeft:8, fontSize:10, color:T.text3 }}>+ добавить контракт</div>}
                  </div>
                  <button onClick={() => openAdd(v.id)} style={{ marginLeft:5, width:22, height:22, borderRadius:4, border:`1px solid ${T.border}`, background:T.bg2, color:T.accent, cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>+</button>
                </div>
              );
            })}
            <div style={{ fontSize:10, color:T.text3, marginTop:6 }}>Нажмите строку или «+» для добавления · Нажмите блок для редактирования</div>
          </div>
        )}

        {activeTab==="economics" && (
          <div>
            {filtered.map(v => {
              const ec = econ(v.id);
              const tot = ec.reduce((s,c) => s+c.revenue, 0);
              return (
                <div key={v.id} style={{ background:T.bg2, borderRadius:8, padding:12, marginBottom:10, border:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:13, fontWeight:700, color:T.accent, marginBottom:6 }}>
                    {v.name}
                    {v.branch && <span style={{ color:T.amber, fontWeight:400, fontSize:11, marginLeft:8 }}>{v.branch}</span>}
                  </div>
                  {ec.length===0 ? <div style={{ color:T.text3, fontSize:11 }}>Нет контрактов</div> : (
                    <>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                        <thead><tr style={{ color:T.text2, borderBottom:`1px solid ${T.border}`, background:T.bg3 }}>
                          {["Контрагент","Начало","Конец","Дней","Ставка/сут","Моб","Демоб","Выручка"].map(h => <th key={h} style={{ textAlign:"left", padding:"4px 6px" }}>{h}</th>)}
                        </tr></thead>
                        <tbody>{ec.map((c,i) => (
                          <tr key={c.id} style={{ borderBottom:`1px solid ${T.border2}`, background:i%2===0?T.bg2:T.bg3 }}>
                            <td style={{ padding:"4px 6px" }}><span style={{ display:"inline-block", width:8, height:8, borderRadius:2, background:colorMap[c.counterparty]||"#888", marginRight:4 }}/>{c.counterparty}</td>
                            <td style={{ padding:"4px 6px", color:T.text2 }}>{fdate(c.start)}</td>
                            <td style={{ padding:"4px 6px", color:T.text2 }}>{fdate(c.end)}</td>
                            <td style={{ padding:"4px 6px" }}>{c.days}</td>
                            <td style={{ padding:"4px 6px" }}>{fmoney(c.rate)}</td>
                            <td style={{ padding:"4px 6px" }}>{fmoney(c.mob)}</td>
                            <td style={{ padding:"4px 6px" }}>{fmoney(c.demob)}</td>
                            <td style={{ padding:"4px 6px", color:T.green, fontWeight:700 }}>{fmoney(c.revenue)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                      <div style={{ textAlign:"right", marginTop:5, fontSize:12, fontWeight:700, color:T.green }}>Итого: {fmoney(tot)}</div>
                    </>
                  )}
                </div>
              );
            })}
            {totalRev>0 && <div style={{ background:T.accent, borderRadius:8, padding:12, textAlign:"center", fontSize:16, fontWeight:700, color:"#ffffff" }}>ИТОГО ПО ФЛОТУ: {fmoney(totalRev)}</div>}
          </div>
        )}

        {activeTab==="vessels" && (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Название судна..."
                style={{ flex:2, padding:"8px 12px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bg2, color:T.text, fontSize:13 }} />
              <input value={newBranch} onChange={e => setNewBranch(e.target.value)} onKeyDown={e => e.key==="Enter" && addV()} placeholder="Филиал..."
                style={{ flex:1, padding:"8px 12px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bg2, color:T.text, fontSize:13 }} />
              <button onClick={addV} style={{ padding:"8px 16px", borderRadius:6, border:"none", background:T.accent, color:"#fff", fontWeight:700, cursor:"pointer" }}>+ Добавить</button>
            </div>
            {typeOrder.map(type => {
              const grp = vessels.filter(v => getType(v.name)===type);
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
                      <button onClick={() => openEditVessel(v)} style={{ padding:"2px 8px", borderRadius:4, border:`1px solid ${T.border}`, background:"transparent", color:T.text2, cursor:"pointer", fontSize:11, marginRight:4 }}>✎</button>
                      <button onClick={() => delV(v.id)} style={{ padding:"2px 8px", borderRadius:4, border:`1px solid ${T.red}`, background:"transparent", color:T.red, cursor:"pointer", fontSize:11 }}>✕</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <div style={modal}>
          <div style={{ ...modalBox, width:430 }}>
            <div style={{ fontSize:15, fontWeight:700, color:T.accent, marginBottom:4 }}>{editId?"✏️ Редактировать контракт":"➕ Новый контракт"}</div>
            <div style={{ fontSize:11, color:T.text2, marginBottom:14 }}>{activeVesselName}</div>
            <Field label="Контрагент" value={form.counterparty} type="text" placeholder="Название компании" onChange={v => setForm(f => ({...f, counterparty:v}))} />
            <div style={{ display:"flex", gap:10 }}>
              <Field label="Начало" value={form.start} type="date" half onChange={v => setForm(f => ({...f, start:v}))} />
              <Field label="Конец" value={form.end} type="date" half onChange={v => setForm(f => ({...f, end:v}))} />
            </div>
            <Field label="Суточная ставка (₽)" value={form.rate} type="number" placeholder="0" onChange={v => setForm(f => ({...f, rate:v}))} />
            <div style={{ display:"flex", gap:10 }}>
              <Field label="Мобилизация (₽)" value={form.mob} type="number" placeholder="0" half onChange={v => setForm(f => ({...f, mob:v}))} />
              <Field label="Демобилизация (₽)" value={form.demob} type="number" placeholder="0" half onChange={v => setForm(f => ({...f, demob:v}))} />
            </div>
            {days_>0 && (
              <div style={{ background:"#f0fdf4", borderRadius:6, padding:"7px 10px", marginBottom:12, fontSize:11, color:T.green, border:"1px solid #bbf7d0" }}>
                📊 {days_} дней · Выручка: <b>{fmoney(preview)}</b>
              </div>
            )}
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={save} style={{ flex:1, padding:9, borderRadius:6, border:"none", background:T.accent, color:"#fff", fontWeight:700, cursor:"pointer", fontSize:13 }}>{editId?"Сохранить":"Добавить"}</button>
              {editId && <button onClick={() => delC(editId)} style={{ padding:"9px 12px", borderRadius:6, border:`1px solid ${T.red}`, background:"transparent", color:T.red, cursor:"pointer" }}>Удалить</button>}
              <button onClick={() => setShowForm(false)} style={{ padding:"9px 12px", borderRadius:6, border:`1px solid ${T.border}`, background:"transparent", color:T.text2, cursor:"pointer" }}>✕</button>
            </div>
          </div>
        </div>
      )}

      {showVesselForm && (
        <div style={modal}>
          <div style={{ ...modalBox, width:380 }}>
            <div style={{ fontSize:15, fontWeight:700, color:T.accent, marginBottom:16 }}>✏️ Редактировать судно</div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:T.text2, marginBottom:3 }}>Название</div>
              <input value={editingName} onChange={e => setEditingName(e.target.value)}
                style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bg2, color:T.text, fontSize:13, boxSizing:"border-box" }} />
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:T.text2, marginBottom:3 }}>Филиал</div>
              <input value={editingBranch} onChange={e => setEditingBranch(e.target.value)} placeholder="Например: Северо-Западный"
                style={{ width:"100%", padding:"8px 10px", borderRadius:6, border:`1px solid ${T.border}`, background:T.bg2, color:T.text, fontSize:13, boxSizing:"border-box" }} />
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={saveVessel} style={{ flex:1, padding:9, borderRadius:6, border:"none", background:T.accent, color:"#fff", fontWeight:700, cursor:"pointer", fontSize:13 }}>Сохранить</button>
              <button onClick={() => setShowVesselForm(false)} style={{ padding:"9px 12px", borderRadius:6, border:`1px solid ${T.border}`, background:"transparent", color:T.text2, cursor:"pointer" }}>✕</button>
            </div>
          </div>
        </div>
      )}

      {showExportMenu && <div style={{ position:"fixed", inset:0, zIndex:40 }} onClick={() => setShowExportMenu(false)} />}
    </div>
  );
}
