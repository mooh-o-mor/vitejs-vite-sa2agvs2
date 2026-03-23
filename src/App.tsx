import { useState, useEffect, useCallback, useMemo } from "react";
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

  const [headerUploadFiles, setHeaderUploadFiles] = useState<FileList | null>(null);

  const [showContractForm, setShowContractForm] = useState(false);
  const [editContractId, setEditContractId] = useState<number|null>(null);
  const [activeVesselId, setActiveVesselId] = useState<number|null>(null);
  const [contractForm, setContractForm] = useState<FormState>(EMPTY_FORM);

  const [showVesselForm, setShowVesselForm] = useState(false);
  const [editingVessel, setEditingVessel] = useState<Vessel|null>(null);

  // Мемоизированная функция загрузки данных
  const loadData = useCallback(async () => {
    setLoading(true);
    const [, { data: vData }, { data: cData }] = await Promise.all([
      new Promise(r => setTimeout(r, 1500)),
      supabase.from("vessels").select("id,name,branch,imo").order("id"),
      supabase.from("contracts").select("*").order("id"),
    ]);
    setVessels((vData||[]).map((v: any) => ({ id:v.id, name:v.name, branch:v.branch||"", imo:v.imo||"" })));
    setContracts((cData||[]).map((c: any) => ({
      id:c.id, vesselId:c.vessel_id, counterparty:c.counterparty,
      start:c.start_date, end:c.end_date,
      rate:c.rate, mob:c.mob, demob:c.demob,
      firmDays:c.firm_days||0, optionDays:c.option_days||0,
      priority:c.priority||"contract", altGroup:c.alt_group||null,
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const s1 = supabase.channel("vessels-ch").on("postgres_changes", { event:"*", schema:"public", table:"vessels" }, () => loadData()).subscribe();
    const s2 = supabase.channel("contracts-ch").on("postgres_changes", { event:"*", schema:"public", table:"contracts" }, () => loadData()).subscribe();
    return () => { supabase.removeChannel(s1); supabase.removeChannel(s2); };
  }, [loadData]);

  const toggleType = useCallback((v: string) => {
    if (v === "Все") { setFilterTypes([]); return; }
    setFilterTypes(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  }, []);

  const toggleBranch = useCallback((v: string) => {
    if (v === "Все") { setFilterBranches([]); return; }
    setFilterBranches(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  }, []);

  const openAddContract = useCallback((vesselId: number) => {
    setEditContractId(null);
    setContractForm(EMPTY_FORM);
    setActiveVesselId(vesselId);
    setShowContractForm(true);
  }, []);

  const openEditContract = useCallback((contract: Contract) => {
    setEditContractId(contract.id);
    setContractForm({
      counterparty:contract.counterparty, start:contract.start, end:contract.end,
      rate:String(contract.rate), mob:String(contract.mob), demob:String(contract.demob),
      firmDays:String(contract.firmDays||""), optionDays:String(contract.optionDays||""),
      priority:contract.priority||"contract", altGroup:String(contract.altGroup||"")
    });
    setActiveVesselId(contract.vesselId);
    setShowContractForm(true);
  }, []);

  const saveContract = useCallback(async () => {
    if (!contractForm.counterparty || !contractForm.start || !contractForm.end) return;
    setSyncing(true);
    const data = {
      vessel_id:activeVesselId, counterparty:contractForm.counterparty,
      start_date:contractForm.start, end_date:contractForm.end,
      rate:+contractForm.rate||0, mob:+contractForm.mob||0, demob:+contractForm.demob||0,
      firm_days:+contractForm.firmDays||0, option_days:+contractForm.optionDays||0,
      priority:contractForm.priority||"contract",
      alt_group:contractForm.altGroup?+contractForm.altGroup:null,
    };
    if (editContractId) {
      const { error } = await supabase.from("contracts").update(data).eq("id", editContractId);
      if (error) alert("Ошибка: " + error.message);
    } else {
      const { error } = await supabase.from("contracts").insert(data);
      if (error) alert("Ошибка: " + error.message);
    }
    setSyncing(false); setShowContractForm(false); await loadData();
  }, [contractForm, activeVesselId, editContractId, loadData]);

  const deleteContract = useCallback(async () => {
    if (!editContractId) return;
    setSyncing(true);
    await supabase.from("contracts").delete().eq("id", editContractId);
    setSyncing(false); setShowContractForm(false); await loadData();
  }, [editContractId, loadData]);

  const addVessel = useCallback(async (name: string, branch: string, imo: string) => {
    setSyncing(true);
    const maxId = vessels.reduce((m, v) => Math.max(m, v.id), 0);
    const { error } = await supabase.from("vessels").insert({ id:maxId+1, name, branch, imo });
    if (error) alert("Ошибка: " + error.message);
    setSyncing(false); await loadData();
  }, [vessels, loadData]);

  const saveVessel = useCallback(async (name: string, branch: string, imo: string) => {
    if (!editingVessel) return;
    setSyncing(true);
    await supabase.from("vessels").update({ name, branch, imo }).eq("id", editingVessel.id);
    setSyncing(false); setShowVesselForm(false); await loadData();
  }, [editingVessel, loadData]);

  const deleteVessel = useCallback(async (id: number) => {
    setSyncing(true);
    await supabase.from("contracts").delete().eq("vessel_id", id);
    await supabase.from("vessels").delete().eq("id", id);
    setSyncing(false); await loadData();
  }, [loadData]);

  // Мемоизированные вычисления
  const cpKeys = useMemo(() => [...new Set(contracts.map(c => cpKey(c.counterparty)))], [contracts]);
  const allTypes = useMemo(() => ["Все", ...typeOrder.filter(t => vessels.some(v => getType(v.name, typeOrder)===t))], [vessels]);
  const allBranches = useMemo(() => ["Все", ...Array.from(new Set(vessels.map(v => v.branch).filter(Boolean)))], [vessels]);
  const allCps = useMemo(() => ["Все", ...cpKeys.filter(cp => !["Ремонт","АСГ"].includes(cp))], [cpKeys]);

  const filtered = useMemo(() => {
    return vessels.filter(v => {
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
  }, [vessels, filterTypes, filterBranches, sortBy]);

  const visibleContracts = useMemo(() => {
    return filterCp==="Все" ? contracts : contracts.filter(c => cpKey(c.counterparty)===filterCp);
  }, [contracts, filterCp]);

  const totalRev = useMemo(() => {
    return visibleContracts.filter(c => filtered.some(v => v.id===c.vesselId))
      .reduce((s,c) => s+contractDays(c.start,c.end)*c.rate+c.mob+c.demob, 0);
  }, [visibleContracts, filtered]);

  const btnFilter = useCallback((active: boolean, amber?: boolean) => ({
    padding:"4px 12px", borderRadius:20, border:"1px solid", cursor:"pointer", fontSize:12, fontWeight:600,
    borderColor: active ? (amber ? T.amber : T.accent) : T.border,
    background: active ? (amber ? T.amber : T.accent) : T.bg2,
    color: active ? "#ffffff" : T.text2
  } as React.CSSProperties), []);

  const fmoney = useCallback((n: number) => {
    if (!n && n !== 0) return "—";
    return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
  }, []);

  const accessLabel = useCallback(() => {
    if (access === "admin") return "👤 Админ";
    if (access === "viewer") return "👁 Просмотр";
    return null;
  }, [access]);

  // Определяем вкладки
  const tabs: [string, string][] = [
    ["gantt", "📊 Расстановка"],
    ...(isAdmin ? [["economics", "💰 Экономика"]] as [string, string][] : []),
    ["map", "🗺 Карта флота"],
    ["summary", "📋 Сводный отчёт"],
    ...(isAdmin ? [["vessels", "🚢 Суда"]] as [string, string][] : []),
  ];

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:T.bg, flexDirection:"column", gap:16 }}>
      <img src="/logoMSS.png" style={{ height:240, width:240, objectFit:"contain" }} alt="МСС" />
      <div style={{ fontSize:16, color:T.text2 }}>Загрузка данных...</div>
    </div>
  );

  return (
    <div style={{ fontFamily:"Arial,sans-serif", background:T.bg, minHeight:"100vh", color:T.text }}>

      {/* Верхняя строка с логотипом, вкладками и кнопками */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: T.header, padding: "8px 16px", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 700, color: "#ffffff" }}>
            <img src="/logo.png" style={{ height: 32, width: 32, objectFit: "contain" }} alt="МСС" />
            Флот МСС
          </span>
          
          {/* Вкладки в той же строке */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {tabs.map(([k, l]) => (
              <button 
                key={k} 
                onClick={() => setActiveTab(k)} 
                style={{ 
                  padding: "6px 14px", 
                  border: "none", 
                  cursor: "pointer", 
                  fontSize: 13, 
                  fontWeight: 600, 
                  borderRadius: 6,
                  background: activeTab === k ? "#ffffff" : "rgba(255,255,255,0.15)",
                  color: activeTab === k ? T.accent : "#ffffff",
                  transition: "all 0.2s"
                }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {syncing && <span style={{ fontSize: 11, color: "#93c5fd" }}>⟳ сохранение...</span>}
          
          {isAdmin && activeTab === "map" && (
            <label style={{ cursor: "pointer", fontSize: 12, color: "#bfdbfe", fontWeight: 600, display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: "1px solid #93c5fd", background: "rgba(255,255,255,0.1)" }}>
              📂 Загрузить .msg
              <input type="file" multiple accept=".msg,.eml" style={{ display: "none" }}
                onChange={(e) => { if (e.target.files) setHeaderUploadFiles(e.target.files); }} />
            </label>
          )}
          
          {isAdmin && activeTab === "gantt" && (
            <span style={{ fontSize: 12, color: "#bfdbfe" }}>
              Выручка: <b style={{ color: "#86efac" }}>{fmoney(totalRev)}</b>
            </span>
          )}
          
          {access !== "guest" && (
            <span style={{ fontSize: 11, color: "#bfdbfe" }}>{accessLabel()}</span>
          )}
          
          {access !== "guest" ? (
            <button onClick={() => { setAccess("guest"); setActiveTab("gantt"); }} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #93c5fd", background: "rgba(255,255,255,0.15)", color: "#ffffff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🔓 Выйти</button>
          ) : (
            <button onClick={() => setShowLogin(true)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #93c5fd", background: "rgba(255,255,255,0.15)", color: "#ffffff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>🔒 Войти</button>
          )}
          
          {isAdmin && activeTab === "gantt" && (
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowExportMenu(v => !v)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #93c5fd", background: "rgba(255,255,255,0.15)", color: "#ffffff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>⬇ Экспорт PPTX ▾</button>
              {showExportMenu && (
                <div style={{ position: "absolute", right: 0, top: "110%", background: T.bg2, border: `1px solid ${T.border}`, borderRadius: 8, padding: 16, zIndex: 50, width: 300, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
                  <div style={{ fontSize: 12, color: T.text2, marginBottom: 10 }}>Выберите что экспортировать:</div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>Тип судна</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{allTypes.map(t => <button key={t} onClick={() => toggleType(t)} style={btnFilter(t === "Все" ? filterTypes.length === 0 : filterTypes.includes(t))}>{t}</button>)}</div>
                  </div>
                  {allBranches.length > 1 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>Филиал</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{allBranches.map(b => <button key={b} onClick={() => toggleBranch(b)} style={btnFilter(b === "Все" ? filterBranches.length === 0 : filterBranches.includes(b), true)}>{b || "Без филиала"}</button>)}</div>
                    </div>
                  )}
                  {allCps.length > 1 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>Контрагент</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{allCps.map(cp => <button key={cp} onClick={() => setFilterCp(cp)} style={btnFilter(filterCp === cp)}>{cp}</button>)}</div>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: T.text2, marginBottom: 8 }}>Будет экспортировано: <b style={{ color: T.text }}>{filtered.length} судов</b></div>
                  <button onClick={() => { exportToPPTX(filtered, contracts, filterCp, isAdmin, filterBranches, filterTypes); setShowExportMenu(false); }} style={{ width: "100%", padding: 9, borderRadius: 6, border: "none", background: T.accent, color: "#ffffff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>⬇ Скачать PPTX</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Основной контент */}
      <div style={{ padding: activeTab === "map" ? "0" : "6px 6px" }}>
        {(activeTab === "gantt" || activeTab === "economics") && (
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

        {activeTab === "gantt" && (
          <GanttChart
            vessels={filtered}
            contracts={visibleContracts}
            isAdmin={isAdmin}
            canView={canView}
            onAddContract={openAddContract}
            onEditContract={openEditContract}
          />
        )}
        {activeTab === "map" && (
          <FleetMap
            isAdmin={isAdmin}
            canView={canView}
            externalFiles={headerUploadFiles}
            onExternalFilesConsumed={() => setHeaderUploadFiles(null)}
          />
        )}
        {activeTab === "summary" && (
          <SummaryReport isAdmin={isAdmin} canView={canView} />
        )}
        {activeTab === "economics" && isAdmin && (
          <Economics vessels={filtered} contracts={visibleContracts} />
        )}
        {activeTab === "vessels" && isAdmin && (
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
          vesselName={vessels.find(v => v.id === activeVesselId)?.name || ""}
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

      {showExportMenu && <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setShowExportMenu(false)} />}
    </div>
  );
}
