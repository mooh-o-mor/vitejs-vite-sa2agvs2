import { useState, useEffect } from "react";
import { supabase } from "./lib/supabase";
import type { Vessel, Contract, FormState } from "./lib/types";
import { T, YEAR, typeOrder } from "./lib/types";
import { getType, cpKey, contractDays } from "./lib/utils";
import { exportToPPTX } from "./lib/exportPPTX";
import { GanttChart } from "./components/GanttChart";
import { Economics } from "./components/Economics";
import { VesselList } from "./components/VesselList";
import { ContractForm } from "./components/ContractForm";
import { VesselForm } from "./components/VesselForm";
import { LoginForm } from "./components/LoginForm";

const EMPTY_FORM: FormState = {
  counterparty:"", start:`${YEAR}-01-01`, end:`${YEAR}-12-31`,
  rate:"", mob:"", demob:"", firmDays:"", optionDays:""
};

export default function App() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Уровни доступа: "guest" | "viewer" | "admin"
  const [access, setAccess] = useState<"guest"|"viewer"|"admin">("guest");
  const isAdmin = access === "admin";
  const canView = access === "admin" || access === "viewer";

  const [showLogin, setShowLogin] = useState(false);
  const [activeTab, setActiveTab] = useState("gantt");
  const [filterType, setFilterType] = useState("Все");
  const [filterBranch, setFilterBranch] = useState("Все");
  const [filterCp, setFilterCp] = useState("Все");
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Форма контракта
  const [showContractForm, setShowContractForm] = useState(false);
  const [editContractId, setEditContractId] = useState<number|null>(null);
  const [activeVesselId, setActiveVesselId] = useState<number|null>(null);
  const [contractForm, setContractForm] = useState<FormState>(EMPTY_FORM);

  // Форма судна
  const [showVesselForm, setShowVesselForm] = useState(false);
  const [editingVessel, setEditingVessel] = useState<Vessel|null>(null);

  useEffect(() => {
    loadData();
    const s1 = supabase.channel("vessels-ch").on("postgres_changes", { event:"*", schema:"public", table:"vessels" }, () => loadData()).subscribe();
    const s2 = supabase.channel("contracts-ch").on("postgres_changes", { event:"*", schema:"public", table:"contracts" }, () => loadData()).subscribe();
    return () => { supabase.removeChannel(s1); supabase.removeChannel(s2); };
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: vData }, { data: cData }] = await Promise.all([
      supabase.from("vessels").select("*").order("id"),
      supabase.from("contracts").select("*").order("id"),
    ]);
    setVessels((vData||[]).map((v: any) => ({ id:v.id, name:v.name, branch:v.branch||"" })));
    setContracts((cData||[]).map((c: any) => ({
      id:c.id, vesselId:c.vessel_id, counterparty:c.counterparty,
      start:c.start_date, end:c.end_date,
      rate:c.rate, mob:c.mob, demob:c.demob,
      firmDays:c.firm_days||0, optionDays:c.option_days||0,
    })));
    setLoading(false);
  }

  function openAddContract(vesselId: number) {
    setEditContractId(null);
    setContractForm(EMPTY_FORM);
    setActiveVesselId(vesselId);
    setShowContractForm(true);
  }

  function openEditContract(contract: Contract) {
    setEditContractId(contract.id);
    setContractForm({
      counterparty:contract.counterparty, start:contract.start, end:contract.end,
      rate:String(contract.rate), mob:String(contract.mob), demob:String(contract.demob),
      firmDays:String(contract.firmDays||""), optionDays:String(contract.optionDays||"")
    });
    setActiveVesselId(contract.vesselId);
    setShowContractForm(true);
  }

  async function saveContract() {
    if (!contractForm.counterparty || !contractForm.start || !contractForm.end) return;
    setSyncing(true);
    const data = {
      vessel_id:activeVesselId, counterparty:contractForm.counterparty,
      start_date:contractForm.start, end_date:contractForm.end,
      rate:+contractForm.rate||0, mob:+contractForm.mob||0, demob:+contractForm.demob||0,
      firm_days:+contractForm.firmDays||0, option_days:+contractForm.optionDays||0,
    };
    if (editContractId) {
      const { error } = await supabase.from("contracts").update(data).eq("id", editContractId);
      if (error) alert("Ошибка: " + error.message);
    } else {
      const { error } = await supabase.from("contracts").insert(data);
      if (error) alert("Ошибка: " + error.message);
    }
    setSyncing(false); setShowContractForm(false); await loadData();
  }

  async function deleteContract() {
    if (!editContractId) return;
    setSyncing(true);
    await supabase.from("contracts").delete().eq("id", editContractId);
    setSyncing(false); setShowContractForm(false); await loadData();
  }

  async function addVessel(name: string, branch: string) {
    setSyncing(true);
    const maxId = vessels.reduce((m, v) => Math.max(m, v.id), 0);
    const { error } = await supabase.from("vessels").insert({ id:maxId+1, name, branch });
    if (error) alert("Ошибка: " + error.message);
    setSyncing(false); await loadData();
  }

  async function saveVessel(name: string, branch: string) {
    if (!editingVessel) return;
    setSyncing(true);
    await supabase.from("vessels").update({ name, branch }).eq("id", editingVessel.id);
    setSyncing(false); setShowVesselForm(false); await loadData();
  }

  async function deleteVessel(id: number) {
    setSyncing(true);
    await supabase.from("contracts").delete().eq("vessel_id", id);
    await supabase.from("vessels").delete().eq("id", id);
    setSyncing(false); await loadData();
  }

  // Производные данные
  const cpKeys = [...new Set(contracts.map(c => cpKey(c.counterparty)))];
  const allTypes = ["Все", ...typeOrder.filter(t => vessels.some(v => getType(v.name, typeOrder)===t))];
  const allBranches = ["Все", ...Array.from(new Set(vessels.map(v => v.branch).filter(Boolean)))];
  const allCps = ["Все", ...cpKeys.filter(cp => !["Ремонт","АСГ"].includes(cp))];

  const filtered = vessels.filter(v => {
    const typeOk = filterType==="Все" || getType(v.name, typeOrder)===filterType;
    const branchOk = filterBranch==="Все" || v.branch===filterBranch;
    return typeOk && branchOk;
  });
  const visibleContracts = filterCp==="Все" ? contracts : contracts.filter(c => cpKey(c.counterparty)===filterCp);
  const totalRev = visibleContracts.filter(c => filtered.some(v => v.id===c.vesselId))
    .reduce((s,c) => s+contractDays(c.start,c.end)*c.rate+c.mob+c.demob, 0);

  const btnFilter = (active: boolean, amber?: boolean) => ({
    padding:"4px 12px", borderRadius:20, border:"1px solid", cursor:"pointer", fontSize:12, fontWeight:600,
    borderColor: active ? (amber ? T.amber : T.accent) : T.border,
    background: active ? (amber ? T.amber : T.accent) : T.bg2,
    color: active ? "#ffffff" : T.text2
  } as React.CSSProperties);

  function fmoney(n: number) {
    if (!n && n !== 0) return "—";
    return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
  }

  // Метка уровня доступа в шапке
  function accessLabel() {
    if (access === "admin") return "👤 Админ";
    if (access === "viewer") return "👁 Просмотр";
    return null;
  }

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:T.bg, flexDirection:"column", gap:16 }}>
      <div style={{ fontSize:32 }}>⚓</div>
      <div style={{ fontSize:16, color:T.text2 }}>Загрузка данных...</div>
    </div>
  );

  return (
    <div style={{ fontFamily:"Arial,sans-serif", background:T.bg, minHeight:"100vh", color:T.text }}>

      {/* Шапка */}
      <div style={{ background:T.header, padding:"12px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ fontSize:18, fontWeight:700, color:"#ffffff" }}>⚓ Флот МСС — {YEAR}</span>
        <span style={{ fontSize:12, color:"#bfdbfe" }}>{contracts.filter(c => !["Ремонт","АСГ"].includes(cpKey(c.counterparty))).length} контрактов</span>
        {syncing && <span style={{ fontSize:11, color:"#93c5fd" }}>⟳ сохранение...</span>}
        <span style={{ marginLeft:"auto", fontSize:13, marginRight:12, color:"#ffffff" }}>
          {isAdmin && <>Выручка: <b style={{ color:"#86efac" }}>{fmoney(totalRev)}</b></>}
        </span>
        {access !== "guest" && (
          <span style={{ fontSize:11, color:"#bfdbfe", marginRight:8 }}>{accessLabel()}</span>
        )}
        {access !== "guest" ? (
          <button onClick={() => { setAccess("guest"); setActiveTab("gantt"); }} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #93c5fd", background:"rgba(255,255,255,0.15)", color:"#ffffff", cursor:"pointer", fontSize:12, fontWeight:600, marginRight:8 }}>🔓 Выйти</button>
        ) : (
          <button onClick={() => setShowLogin(true)} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #93c5fd", background:"rgba(255,255,255,0.15)", color:"#ffffff", cursor:"pointer", fontSize:12, fontWeight:600, marginRight:8 }}>🔒 Войти</button>
        )}
        {isAdmin && (
          <div style={{ position:"relative" }}>
            <button onClick={() => setShowExportMenu(v => !v)} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #93c5fd", background:"rgba(255,255,255,0.15)", color:"#ffffff", cursor:"pointer", fontSize:12, fontWeight:600 }}>⬇ Экспорт PPTX ▾</button>
            {showExportMenu && (
              <div style={{ position:"absolute", right:0, top:"110%", background:T.bg2, border:`1px solid ${T.border}`, borderRadius:8, padding:16, zIndex:50, width:300, boxShadow:"0 8px 32px rgba(0,0,0,0.15)" }}>
                <div style={{ fontSize:12, color:T.text2, marginBottom:10 }}>Выберите что экспортировать:</div>
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Тип судна</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>{allTypes.map(t => <button key={t} onClick={() => setFilterType(t)} style={btnFilter(filterType===t)}>{t}</button>)}</div>
                </div>
                {allBranches.length>1 && (
                  <div style={{ marginBottom:8 }}>
                    <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Филиал</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>{allBranches.map(b => <button key={b} onClick={() => setFilterBranch(b)} style={btnFilter(filterBranch===b, true)}>{b||"Без филиала"}</button>)}</div>
                  </div>
                )}
                {allCps.length>1 && (
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:T.text3, marginBottom:4 }}>Контрагент</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>{allCps.map(cp => <button key={cp} onClick={() => setFilterCp(cp)} style={btnFilter(filterCp===cp)}>{cp}</button>)}</div>
                  </div>
                )}
                <div style={{ fontSize:11, color:T.text2, marginBottom:8 }}>Будет экспортировано: <b style={{ color:T.text }}>{filtered.length} судов</b></div>
                <button onClick={() => { exportToPPTX(filtered, contracts, filterCp, isAdmin); setShowExportMenu(false); }} style={{ width:"100%", padding:9, borderRadius:6, border:"none", background:T.accent, color:"#ffffff", fontWeight:700, cursor:"pointer", fontSize:13 }}>⬇ Скачать PPTX</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Табы */}
      <div style={{ display:"flex", background:T.bg2, borderBottom:`1px solid ${T.border}`, padding:"0 16px" }}>
        {[["gantt","📊 Расстановка"], ...(isAdmin ? [["economics","💰 Экономика"],["vessels","🚢 Суда"]] : [])].map(([k,l]) => (
          <button key={k} onClick={() => setActiveTab(k)} style={{ padding:"10px 18px", border:"none", cursor:"pointer", fontSize:13, fontWeight:600, marginRight:4, background:"transparent", color:activeTab===k?T.accent:T.text2, borderBottom:activeTab===k?`2px solid ${T.accent}`:"2px solid transparent" }}>{l}</button>
        ))}
      </div>

      <div style={{ padding:16 }}>
        {/* Фильтры */}
        {(activeTab==="gantt"||activeTab==="economics") && (
          <>
            <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap", alignItems:"center" }}>
              <span style={{ fontSize:11, color:T.text3, minWidth:80 }}>Тип судна:</span>
              {allTypes.map(t => <button key={t} onClick={() => setFilterType(t)} style={btnFilter(filterType===t)}>{t}</button>)}
            </div>
            {allBranches.length>1 && (
              <div style={{ display:"flex", gap:6, marginBottom:6, flexWrap:"wrap", alignItems:"center" }}>
                <span style={{ fontSize:11, color:T.text3, minWidth:80 }}>Филиал:</span>
                {allBranches.map(b => <button key={b} onClick={() => setFilterBranch(b)} style={btnFilter(filterBranch===b, true)}>{b||"Без филиала"}</button>)}
              </div>
            )}
            {canView && allCps.length>1 && (
              <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
                <span style={{ fontSize:11, color:T.text3, minWidth:80 }}>Контрагент:</span>
                {allCps.map(cp => <button key={cp} onClick={() => setFilterCp(cp)} style={btnFilter(filterCp===cp)}>{cp}</button>)}
              </div>
            )}
          </>
        )}

        {/* Вкладки */}
        {activeTab==="gantt" && (
          <GanttChart
            vessels={filtered}
            contracts={visibleContracts}
            isAdmin={isAdmin}
            canView={canView}
            onAddContract={openAddContract}
            onEditContract={openEditContract}
          />
        )}
        {activeTab==="economics" && isAdmin && (
          <Economics vessels={filtered} contracts={visibleContracts} />
        )}
        {activeTab==="vessels" && isAdmin && (
          <VesselList
            vessels={vessels}
            contracts={contracts}
            onAdd={addVessel}
            onEdit={v => { setEditingVessel(v); setShowVesselForm(true); }}
            onDelete={deleteVessel}
          />
        )}
      </div>

      {/* Модалы */}
      {showLogin && (
        <LoginForm
          onLogin={level => { setAccess(level); setShowLogin(false); }}
          onClose={() => setShowLogin(false)}
        />
      )}

      {showContractForm && canView && (
        <ContractForm
          form={contractForm}
          editId={editContractId}
          vesselName={vessels.find(v => v.id===activeVesselId)?.name||""}
          readOnly={!isAdmin}
          onChange={setContractForm}
          onSave={saveContract}
          onDelete={deleteContract}
          onClose={() => setShowContractForm(false)}
        />
      )}

      {showVesselForm && isAdmin && editingVessel && (
        <VesselForm
          vessel={editingVessel}
          onSave={saveVessel}
          onClose={() => setShowVesselForm(false)}
        />
      )}

      {showExportMenu && <div style={{ position:"fixed", inset:0, zIndex:40 }} onClick={() => setShowExportMenu(false)} />}
    </div>
  );
}
