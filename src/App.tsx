import { lazy, Suspense, useState, useEffect, useMemo } from "react";
import { supabase } from "./lib/supabase";
import type { Vessel, Contract, FormState } from "./lib/types";
import { T, YEAR } from "./lib/types";
import { getType, cpKey } from "./lib/utils";

import { FilterBar } from "./components/FilterBar";
import { LoginForm } from "./components/LoginForm";
import { VesselForm } from "./components/VesselForm";
import { ContractForm } from "./components/ContractForm";

// lazy-компоненты
const GanttChart    = lazy(() => import("./components/GanttChart"));
const FleetMap      = lazy(() => import("./components/FleetMap"));
const SummaryReport = lazy(() => import("./components/SummaryReport"));
const Economics     = lazy(() => import("./components/Economics"));
const VesselList    = lazy(() => import("./components/VesselList"));

const EMPTY_FORM: FormState = {
  counterparty: "", start: `${YEAR}-01-01`, end: `${YEAR}-12-31`,
  rate: "", mob: "", demob: "", firmDays: "", optionDays: "",
  priority: "contract", altGroup: ""
};

export default function App() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  const [access, setAccess] = useState<"guest" | "viewer" | "admin">("guest");
  const isAdmin = access === "admin";
  const canView = isAdmin || access === "viewer";

  const [showLogin, setShowLogin] = useState(false);
  const [activeTab, setActiveTab] = useState("gantt");

  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterBranches, setFilterBranches] = useState<string[]>([]);
  const [filterCp, setFilterCp] = useState("Все");
  const [sortBy, setSortBy] = useState<"type" | "name" | "branch">("type");

  const [showContractForm, setShowContractForm] = useState(false);
  const [editContractId, setEditContractId] = useState<number | null>(null);
  const [activeVesselId, setActiveVesselId] = useState<number | null>(null);
  const [contractForm, setContractForm] = useState<FormState>(EMPTY_FORM);

  const [showVesselForm, setShowVesselForm] = useState(false);
  const [editingVessel, setEditingVessel] = useState<Vessel | null>(null);

  useEffect(() => {
    loadData();
    const s1 = supabase.channel("vessels").on("postgres_changes", { event: "*", schema: "public", table: "vessels" }, loadData).subscribe();
    const s2 = supabase.channel("contracts").on("postgres_changes", { event: "*", schema: "public", table: "contracts" }, loadData).subscribe();
    return () => { supabase.removeChannel(s1); supabase.removeChannel(s2); };
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: vData }, { data: cData }] = await Promise.all([
        supabase.from("vessels").select("*"),
        supabase.from("contracts").select("*")
      ]);
      setVessels(vData || []);
      setContracts(cData || []);
    } catch (err) {
      console.error("loadData error", err);
    } finally {
      setLoading(false);
    }
  }

  // ── Фильтрация и сортировка (мемоизация) ──
  const filteredVessels = useMemo(() => {
    let list = [...vessels];

    if (filterTypes.length > 0) {
      list = list.filter(v => filterTypes.includes(getType(v.name)));
    }
    if (filterBranches.length > 0) {
      list = list.filter(v => filterBranches.includes(v.branch));
    }

    if (sortBy === "type") {
      list.sort((a, b) => getType(a.name).localeCompare(getType(b.name)));
    } else if (sortBy === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "branch") {
      list.sort((a, b) => a.branch.localeCompare(b.branch));
    }

    return list;
  }, [vessels, filterTypes, filterBranches, sortBy]);

  const visibleContracts = useMemo(() => {
    const vesselIds = new Set(filteredVessels.map(v => v.id));
    return contracts.filter(c => vesselIds.has(c.vesselId));
  }, [contracts, filteredVessels]);

  // ── Обработчики фильтров (useCallback) ──
  const toggleType = useCallback((t: string) => {
    setFilterTypes(prev =>
      t === "Все" ? [] : prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
  }, []);

  const toggleBranch = useCallback((b: string) => {
    setFilterBranches(prev =>
      b === "Все" ? [] : prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]
    );
  }, []);

  // ── Модалки контрактов и судов ──
  const openAddContract = useCallback((vesselId: number) => {
    setActiveVesselId(vesselId);
    setEditContractId(null);
    setContractForm(EMPTY_FORM);
    setShowContractForm(true);
  }, []);

  const openEditContract = useCallback((c: Contract) => {
    setActiveVesselId(c.vesselId);
    setEditContractId(c.id);
    setContractForm({
      counterparty: c.counterparty,
      start: c.start,
      end: c.end,
      rate: String(c.rate),
      mob: String(c.mob),
      demob: String(c.demob),
      firmDays: String(c.firmDays),
      optionDays: String(c.optionDays),
      priority: c.priority,
      altGroup: c.altGroup ? String(c.altGroup) : ""
    });
    setShowContractForm(true);
  }, []);

  // ── Сохранение / удаление (заглушки — подставь свою логику) ──
  const saveContract = useCallback(async () => {
    // здесь supabase.upsert / insert
    setShowContractForm(false);
  }, []);

  const deleteContract = useCallback(async () => {
    // здесь supabase.delete
    setShowContractForm(false);
  }, []);

  const saveVessel = useCallback(async (name: string, branch: string, imo: string) => {
    // supabase upsert
    setShowVesselForm(false);
  }, []);

  const deleteVessel = useCallback(async (id: number) => {
    // supabase.delete
  }, []);

  // ── Рендер ──
  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Загрузка данных...</div>;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "system-ui, sans-serif" }}>
      {/* шапка, табы, логин — оставляем как было или выносим в Header.tsx */}

      <div style={{ padding: activeTab === "map" ? 0 : "12px" }}>
        {(activeTab === "gantt" || activeTab === "economics") && (
          <FilterBar
            allTypes={/* вычисляем уникальные типы */}
            allBranches={/* уникальные филиалы */}
            allCps={/* уникальные контрагенты */}
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

        <Suspense fallback={<div style={{ padding: 40 }}>Загрузка модуля...</div>}>
          {activeTab === "gantt" && (
            <GanttChart
              vessels={filteredVessels}
              contracts={visibleContracts}
              isAdmin={isAdmin}
              canView={canView}
              onAddContract={openAddContract}
              onEditContract={openEditContract}
            />
          )}
          {activeTab === "map" && <FleetMap isAdmin={isAdmin} canView={canView} />}
          {activeTab === "summary" && <SummaryReport isAdmin={isAdmin} canView={canView} />}
          {activeTab === "economics" && isAdmin && <Economics vessels={filteredVessels} contracts={visibleContracts} />}
          {activeTab === "vessels" && isAdmin && (
            <VesselList vessels={vessels} contracts={contracts} onAdd={saveVessel} onEdit={v => { setEditingVessel(v); setShowVesselForm(true); }} onDelete={deleteVessel} />
          )}
        </Suspense>
      </div>

      {showLogin && <LoginForm onLogin={setAccess} onClose={() => setShowLogin(false)} />}
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
        <VesselForm vessel={editingVessel} onSave={saveVessel} onClose={() => setShowVesselForm(false)} />
      )}
    </div>
  );
}
