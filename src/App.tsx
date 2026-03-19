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
import { FilterBar } from "./components/FilterBar";
import { FleetMap } from "./components/FleetMap";
import { SummaryReport } from "./components/SummaryReport";

const EMPTY_FORM: FormState = {
  counterparty:"", start:`${YEAR}-01-01`, end:`${YEAR}-12-31`,
  rate:"", mob:"", demob:"", firmDays:"", optionDays:"",
  priority:"contract", altGroup:""
};

export default function App() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [access, setAccess] = useState<"guest"|"viewer"|"admin">("guest");
  const isAdmin = access === "admin";
  const canView = access === "admin" || access === "viewer";

  const [showLogin, setShowLogin] = useState(false);
  const [activeTab, setActiveTab] = useState("gantt");
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterBranches, setFilterBranches] = useState<string[]>([]);
  const [filterCp, setFilterCp] = useState("Все");
  const [sortBy, setSortBy] = useState<"type"|"name"|"branch">("type");
  const [showExportMenu, setShowExportMenu] = useState(false);

  const [showContractForm, setShowContractForm] = useState(false);
  const [editContractId, setEditContractId] = useState<number|null>(null);
  const [activeVesselId, setActiveVesselId] = useState<number|null>(null);
  const [contractForm, setContractForm] = useState<FormState>(EMPTY_FORM);

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
    const [, { data: vData }, { data: cData }] = await Promise.all([
      new Promise(r => setTimeout(r, 1500)),
      supabase.from("vessels").select("*").order("id"),
      supabase.from("contracts").select("*").order("id"),
    ]);
    setVessels((vData||[]).map((v: any) => ({ id:v.id, name:v.name, branch:v.branch||"" })));
    setContracts((cData||[]).map((c: any) => ({
      id:c.id, vesselId:c.vessel_id, counterparty:c.counterparty,
      start:c.start_date, end:c.end_date,
      rate:c.rate, mob:c.mob, demob:c.demob,
      firmDays:c.firm_days||0, optionDays:c.option_days||0,
      priority:c.priority||"contract", altGroup:c.alt_group||null,
    })));
    setLoading(false);
  }

  function toggleType(t: string) {
    if (t === "Все") { setFilterTypes([]); return; }
    setFilterTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  function toggleBranch(b: string) {
    if (b === "Все") { setFilterBranches([]); return; }
    setFilterBranches(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]);
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
      firmDays:String(contract.firmDays||""), optionDays:String(contract.optionDays||""),
      priority:contract.priority||"contract", altGroup:contract.altGroup ? String(contract.altGroup) : ""
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
      priority:contractForm.priority||"contract",
      alt_group:contractForm.altGroup ? +contractForm.altGroup : null,
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

  const cpKeys = [...new Set(contracts.map(c => cpKey(c.counterparty)))];
  const allTypes = ["Все", ...typeOrder.filter(t => vessels.some(v => getType(v.name, typeOrder)===t))];
  const allBranches = ["Все", ...Array.from(new Set(vessels.map(v => v.branch).filter(Boolean)))];
  const allCps = ["Все", ...cpKeys.filter(cp => !["Ремонт","АСГ"].includes(cp))];

  const filtered = vessels.filter(v => {
    const typeOk = filterTypes.length === 0 || filterTypes.includes(getType(v.name, typeOrder));
    const branchOk = filterBranches.length === 0 || filterBranches.includes(v.branch);
    return typeOk && branchOk;
  }).sort((a, b) => {
    if (sortBy==="type") return typeOrder.indexOf(getType(a.name, typeOrder)) - typeOrder.indexOf(getType(b.name, typeOrder));
    if (sortBy==="name") {
      const nameA = a.name.replace(/^(МФАСС|ТБС|ССН|МБС|МВС|МБ|НИС)\s+/, "");
      const nameB = b.name.replace(/^(МФАСС|ТБС|ССН|МБС|МВС|МБ|НИС)\s+/, "");
      return nameA.localeCompare(nameB, "ru");
    }
    if (sortBy==="branch") return (a.branch||"").localeCompare(b.branch||"", "ru");
    return 0;
  });

  const visibleContracts = filterCp==="Все" ? contracts : contracts.filter(c => cpKey(c.counterparty)===filterCp);

  const revenueContracts = visibleContracts.filter(c => {
    if (!filtered.some(v => v.id===c.vesselId)) return false;
    if (!c.altGroup) return c.priority === "contract";
    const group = visibleContracts.filter(g => g.vesselId===c.vesselId && g.altGroup===c.altGroup);
    const sorted = group.sort((a,b) => {
      const ord = ["contract","kp","plan"];
      return ord.indexOf(a.priority) - ord.indexOf(b.priority);
    });
    return sorted[0]?.id === c.id && c.priority === "contract";
  });
  const totalRev = revenueContracts.reduce((s,c) => s+contractDays(c.start,c.end)*c.rate+c.mob+c.demob, 0);

  function fmoney(n: number) {
    if (!n && n !== 0) return "—";
    return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
  }

  function accessLabel() {
    if (access === "admin") return "👤 Админ";
    if (access === "viewer") return "👁 Просмотр";
    return null;
  }

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:T.bg, flexDirection:"column", gap:16 }}>
      <img src="/logoMSS.png" alt="" style={{ height:240 }} />
      <div style={{ fontSize:16, color:T.text2 }}>Загрузка данных...</div>
    </div>
  );

  const tabs: [string, string][] = [
    ["gantt", "📊 Расстановка"],
    ...(isAdmin ? [["economics", "💰 Экономика"]] as [string, string][] : []),
    ["map", "🗺 Карта флота"],
    ["summary", "📋 Сводный отчёт"],
  ];

  return (
    <div style={{ fontFamily:"Arial,sans-serif", background:T.bg, minHeight:"100vh", color:T.text }}>

      <div style={{ background:T.header, padding:"12px 16px", display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ display:"flex", alignItems:"center", gap:8, fontSize:18, fontWeight:700, color:"#ffffff" }}>
          <img src="/logo.png" alt="" style={{ height:40 }} /> Флот МСС
        </span>
        {syncing && <span style={{ fontSize:11, color:"#93c5fd" }}>⟳ сохранение...</span>}
        <span style={{ marginLeft:"auto", fontSize:13, marginRight:12, color:"#ffffff" }}>
          {isAdmin && activeTab==="gantt" && <>Выручка: <b style={{ color:"#86efac" }}>{fmoney(totalRev)}</b></>}
        </span>
        {access !== "guest" && (
          <span style={{ fontSize:11, color:"#bfdbfe", marginRight:8 }}>{accessLabel()}</span>
        )}
        {access !== "guest" ? (
          <button onClick={() => { setAccess("guest"); setActiveTab("gantt"); }} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #93c5fd", background:"rgba(255,255,255,0.15)", color:"#ffffff", cursor:"pointer", fontSize:12, fontWeight:600, marginRight:8 }}>🔓 Выйти</button>
        ) : (
          <button onClick={() => setShowLogin(true)} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #93c5fd", background:"rgba(255,255,255,0.15)", color:"#ffffff", cursor:"pointer", fontSize:12, fontWeight:600, marginRight:8 }}>🔒 Войти</button>
        )}
        {isAdmin && activeTab==="map" && (
          <label style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #93c5fd", background:"rgba(255,255,255,0.15)", color:"#ffffff", cursor:"pointer", fontSize:12, fontWeight:600, marginRight:8, display:"flex", alignItems:"center", gap:6 }}>
            📂 .msg
            <input type="file" multiple accept=".msg" style={{ display:"none" }}
              onChange={(e) => {
                if (e.target.files) {
                  const event = new CustomEvent("dpr-upload", { detail: e.target.files });
                  window.dispatchEvent(event);
                  e.target.value = "";
                }
              }} />
          </label>
        )}
        {isAdmin && activeTab==="gantt" && (
          <div style={{ position:"relative" }}>
            <button onClick={() => setShowExportMenu(v => !v)} style={{ padding:"6px 14px", borderRadius:6, border:"1px solid #93c5fd", background:"rgba(255,255,255,0.15)", color:"#ffffff", cursor:"pointer", fontSize:12, fontWeight:600 }}>⬇ Экспорт PPTX ▾</button>
            {showExportMenu && (
              <div style={{ position:"absolute", right:0, top:"110%", background:T.bg2, border:`1px solid ${T.border}`, borderRadius:8, padding:16, zIndex:50, width:300, boxShadow:"0 8px 32px rgba(0,0,0,0.15)" }}>
                <div style={{ fontSize:12, color:T.text2, marginBottom:10 }}>Экспорт текущего фильтра:</div>
                <div style={{ fontSize:11, color:T.text2, marginBottom:4 }}>
                  Типы: <b>{filterTypes.length === 0 ? "Все" : filterTypes.join(", ")}</b>
                </div>
                <div style={{ fontSize:11, color:T.text2, marginBottom:4 }}>
                  Филиалы: <b>{filterBranches.length === 0 ? "Все" : filterBranches.join(", ")}</b>
                </div>
                <div style={{ fontSize:11, color:T.text2, marginBottom:8 }}>Будет экспортировано: <b style={{ color:T.text }}>{filtered.length} судов</b></div>
                <button onClick={() => { exportToPPTX(filtered, contracts, filterCp, isAdmin, filterBranches, filterTypes); setShowExportMenu(false); }} style={{ width:"100%", padding:9, borderRadius:6, border:"none", background:T.accent, color:"#ffffff", fontWeight:700, cursor:"pointer", fontSize:13 }}>⬇ Скачать PPTX</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ display:"flex", background:T.bg2, borderBottom:`1px solid ${T.border}`, padding:"0 8px" }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setActiveTab(k)} style={{ padding:"10px 18px", border:"none", cursor:"pointer", fontSize:13, fontWeight:600, marginRight:4, background:"transparent", color:activeTab===k?T.accent:T.text2, borderBottom:activeTab===k?`2px solid ${T.accent}`:"2px solid transparent" }}>{l}</button>
        ))}
        {isAdmin && (
          <>
            <div style={{ flex:1 }} />
            <button onClick={() => setActiveTab("vessels")} style={{ padding:"10px 18px", border:"none", cursor:"pointer", fontSize:13, fontWeight:600, background:"transparent", color:activeTab==="vessels"?T.accent:T.text2, borderBottom:activeTab==="vessels"?`2px solid ${T.accent}`:"2px solid transparent" }}>🚢 Суда</button>
          </>
        )}
      </div>

      <div style={{ padding: activeTab === "map" ? "0" : "6px 6px" }}>
        {(activeTab==="gantt"||activeTab==="economics") && (
          <FilterBar
            allTypes={allTypes}
            allBranches={allBranches}
            allCps={allCps}
            filterTypes={filterTypes}
            filterBranches={filterBranches}
            filterCp={filterCp}
            sortBy={sortBy}
            canView={canView}
            onToggleType={toggleType}
            onToggleBranch={toggleBranch}
            onFilterCp={setFilterCp}
            onSortBy={setSortBy}
          />
        )}

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
        {activeTab==="map" && (
          <FleetMap isAdmin={isAdmin} canView={canView} />
        )}
        {activeTab==="summary" && (
          <SummaryReport isAdmin={isAdmin} canView={canView} />
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
