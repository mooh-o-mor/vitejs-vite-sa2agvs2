import { lazy, Suspense, useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./lib/supabase";
import type { Vessel, Contract, FormState } from "./lib/types";
import { T, YEAR, typeOrder } from "./lib/types";
import { getType, cpKey } from "./lib/utils";

import FilterBar from "./components/FilterBar";
import LoginForm from "./components/LoginForm";
import VesselForm from "./components/VesselForm";
import ContractForm from "./components/ContractForm";

// Для lazy-импортов используем промежуточные объекты с .default
const GanttChart = lazy(() => import("./components/GanttChart").then(module => ({ default: module.GanttChart })));
const FleetMap = lazy(() => import("./components/FleetMap").then(module => ({ default: module.FleetMap })));
const SummaryReport = lazy(() => import("./components/SummaryReport").then(module => ({ default: module.SummaryReport })));
const Economics = lazy(() => import("./components/Economics").then(module => ({ default: module.Economics })));
const VesselList = lazy(() => import("./components/VesselList").then(module => ({ default: module.VesselList })));

const EMPTY_FORM: FormState = {
  counterparty: "",
  start: `${YEAR}-01-01`,
  end: `${YEAR}-12-31`,
  rate: "",
  mob: "",
  demob: "",
  firmDays: "",
  optionDays: "",
  priority: "contract",
  altGroup: "",
};

export default function App() {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  const [access, setAccess] = useState<"guest" | "viewer" | "admin">("guest");
  const isAdmin = access === "admin";
  const canView = isAdmin || access === "viewer";

  const [showLogin, setShowLogin] = useState(false);
  const [activeTab, setActiveTab] = useState<"gantt" | "map" | "summary" | "economics" | "vessels">("gantt");

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

    const vesselsChannel = supabase
      .channel("vessels-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vessels" },
        () => loadData(),
        (error) => console.error("Realtime vessels error:", error)
      )
      .subscribe();

    const contractsChannel = supabase
      .channel("contracts-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contracts" },
        () => loadData(),
        (error) => console.error("Realtime contracts error:", error)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(vesselsChannel);
      supabase.removeChannel(contractsChannel);
    };
  }, [loadData]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, cRes] = await Promise.all([
        supabase.from("vessels").select("*").order("name"),
        supabase.from("contracts").select("*"),
      ]);

      setVessels(vRes.data ?? []);
      setContracts(cRes.data ?? []);
    } catch (err) {
      console.error("Ошибка загрузки данных:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Мемоизация отфильтрованного списка
  const filteredVessels = useMemo(() => {
    let list = vessels.slice();

    if (filterTypes.length > 0) {
      list = list.filter((v) => filterTypes.some((t) => getType(v.name) === t));
    }

    if (filterBranches.length > 0) {
      list = list.filter((v) => filterBranches.includes(v.branch));
    }

    list.sort((a, b) => {
      if (sortBy === "type") {
        return typeOrder.indexOf(getType(a.name)) - typeOrder.indexOf(getType(b.name));
      }
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "branch") return a.branch.localeCompare(b.branch);
      return 0;
    });

    return list;
  }, [vessels, filterTypes, filterBranches, sortBy]);

  const visibleContracts = useMemo(() => {
    const ids = new Set(filteredVessels.map((v) => v.id));
    return contracts.filter((c) => ids.has(c.vesselId));
  }, [contracts, filteredVessels]);

  const toggleType = useCallback((t: string) => {
    setFilterTypes((prev) => {
      if (t === "Все") return [];
      return prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t];
    });
  }, []);

  const toggleBranch = useCallback((b: string) => {
    setFilterBranches((prev) => {
      if (b === "Все") return [];
      return prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b];
    });
  }, []);

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
      altGroup: c.altGroup ? String(c.altGroup) : "",
    });
    setShowContractForm(true);
  }, []);

  // ── Заглушки для сохранения (замени на реальную логику) ──
  const saveContract = useCallback(async () => {
    // await supabase.from("contracts").upsert(...)
    setShowContractForm(false);
  }, []);

  const deleteContract = useCallback(async () => {
    // await supabase.from("contracts").delete().eq("id", editContractId)
    setShowContractForm(false);
  }, []);

  const saveVessel = useCallback(
    async (name: string, branch: string, imo: string) => {
      // await supabase.from("vessels").upsert({ name, branch, imo })
      setShowVesselForm(false);
    },
    []
  );

  const deleteVessel = useCallback(async (id: number) => {
    // await supabase.from("vessels").delete().eq("id", id)
  }, []);

  if (loading) {
    return <div style={{ padding: "40px", textAlign: "center", color: T.text2 }}>Загрузка данных...</div>;
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.text }}>
      {/* Здесь должен быть ваш Header / Tabs / Login button */}

      <div style={{ padding: activeTab === "map" ? 0 : "12px" }}>
        {(activeTab === "gantt" || activeTab === "economics") && (
          <FilterBar
            allTypes={Array.from(new Set(vessels.map((v) => getType(v.name))))}
            allBranches={Array.from(new Set(vessels.map((v) => v.branch).filter(Boolean)))}
            allCps={Array.from(new Set(contracts.map((c) => cpKey(c.counterparty))))}
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

        <Suspense fallback={<div style={{ padding: "40px", textAlign: "center" }}>Загрузка модуля...</div>}>
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
          {activeTab === "economics" && isAdmin && (
            <Economics vessels={filteredVessels} contracts={visibleContracts} />
          )}
          {activeTab === "vessels" && isAdmin && (
            <VesselList
              vessels={vessels}
              contracts={contracts}
              onAdd={(name, branch, imo) => saveVessel(name, branch, imo)}
              onEdit={(v: Vessel) => {
                setEditingVessel(v);
                setShowVesselForm(true);
              }}
              onDelete={deleteVessel}
            />
          )}
        </Suspense>
      </div>

      {showLogin && (
        <LoginForm
          onLogin={(level) => {
            setAccess(level);
            setShowLogin(false);
          }}
          onClose={() => setShowLogin(false)}
        />
      )}

      {showContractForm && canView && (
        <ContractForm
          form={contractForm}
          editId={editContractId}
          vesselName={vessels.find((v) => v.id === activeVesselId)?.name ?? ""}
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
          onSave={(name, branch, imo) => saveVessel(name, branch, imo)}
          onClose={() => setShowVesselForm(false)}
        />
      )}
    </div>
  );
}
