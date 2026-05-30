import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { supabase } from "../../lib/supabase";
import { type DprRow } from "../../lib/parseDpr";
import { T, type VesselDprRow, type VesselDprMapRow } from "../../lib/types";
import { formatVesselName, getFleetType } from "../../lib/utils";
import { mkIcon } from "./mapIcons";
import { Sidebar } from "./Sidebar";
import { VesselPopup } from "./VesselPopup";
import { useMapInit } from "./useMapInit";
import { useFileUpload } from "./useFileUpload";

function cls(stat: string | null | undefined): "asg" | "asd" | "rem" | "oth" {
  if (!stat) return "oth";
  const s = stat.toUpperCase();
  if (s.includes("АСГ")) return "asg";
  if (s.includes("АСД") || s.includes("КОНТР") || s.includes("ДОГО") ||
      s.includes("ЧАРТ") || s.includes("БУКСИР") ||
      /\bТ\/Ч\b/.test(s) || /\bТЧ\b/.test(s)) return "asd";
  if (s.includes("РЕМ") || s.includes("ВОССТ") || s.includes("ОСВИДЕТ")) return "rem";
  return "oth";
}

export function FleetMap({
  isAdmin,
  canView,
  externalFiles,
  onExternalFilesConsumed,
}: {
  isAdmin: boolean;
  canView: boolean;
  externalFiles?: FileList | null;
  onExternalFilesConsumed?: () => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [selDate, setSelDate] = useState<string>("");
  const [vessels, setVessels] = useState<DprRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("Все");
  const [filterBranch, setFilterBranch] = useState<string>("Все");
  const [filterStatus, setFilterStatus] = useState<string>("Все");
  const [selVessel, setSelVessel] = useState<DprRow | null>(null);

  const [dataSource, setDataSource] = useState<"branches" | "vessels">("branches");

  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (externalFiles && externalFiles.length > 0 && isAdmin) {
      handleUpload(externalFiles);
      onExternalFilesConsumed?.();
    }
  }, [externalFiles]);

  useEffect(() => {
    const onEnter = (e: DragEvent) => { e.preventDefault(); dragCounter.current++; setDragging(true); };
    const onLeave = () => { dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragging(false); } };
    const onOver = (e: DragEvent) => { e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      e.preventDefault(); dragCounter.current = 0; setDragging(false);
      if (e.dataTransfer?.files?.length && isAdmin) handleUpload(e.dataTransfer.files);
    };
    document.addEventListener("dragenter", onEnter);
    document.addEventListener("dragleave", onLeave);
    document.addEventListener("dragover", onOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragenter", onEnter);
      document.removeEventListener("dragleave", onLeave);
      document.removeEventListener("dragover", onOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [isAdmin]);

  const { mapObj, markersRef } = useMapInit(mapRef);
  const { uploading, uploadMsg, handleUpload } = useFileUpload({ dataSource, setDataSource, loadDates, setSelDate });

  useEffect(() => { loadDates(); }, [dataSource]);

  async function loadDates() {
    setLoading(true);
    const table = dataSource === "branches" ? "dpr_entries" : "vessel_dpr";
    const { data } = await supabase.from(table).select("report_date").order("report_date", { ascending: false }).limit(500);
    if (data) {
      const unique = [...new Set(data.map((r: any) => r.report_date))];
      setDates(unique);
      if (unique.length > 0 && !selDate) setSelDate(unique[0]);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (dataSource === "vessels") {
      // vessel_dpr: не зависим от selDate — показываем всех с последней записью за 30 дней
      loadVessels("");
    } else if (selDate) {
      loadVessels(selDate);
    }
  }, [selDate, dataSource]);

  /** Маппинг VesselDprRow → DprRow + новые поля для vessel_dpr */
  const mapVesselDprToDprRow = useCallback((v: VesselDprRow): VesselDprMapRow => ({
    vessel_name: v.vessel_name,
    branch: v.branch,
    report_date: v.report_date,
    status: v.status_norm || v.status || v.dpr_type,  // нормализованный → сырой → тип ДПР
    status_norm: v.status_norm ?? null,
    coord_raw: v.coord_raw ?? "",
    lat: v.lat,
    lng: v.lng,
    note: v.email_subject ?? "",
    supplies: [],
    contract_info: "",
    work_period: "",
    dpr_type: v.dpr_type ?? null,
    fields_json: v.fields_json,
    msg_time: v.msg_time ?? null,
    parse_ok: v.parse_ok ?? null,
    weather: v.weather ?? null,
    course: v.course ?? null,
    speed_current: v.speed_current ?? null,
    distance_day: v.distance_day ?? null,
    eta_place: v.eta_place ?? null,
    eta_date: v.eta_date ?? null,
    power_source: v.power_source ?? null,
    port_status: v.port_status ?? null,
    crew: v.crew ?? null,
    fuel_dt_amt: v.fuel_dt_amt ?? null,
    fuel_dt_cons: v.fuel_dt_cons ?? null,
    fuel_tt_amt: v.fuel_tt_amt ?? null,
    fuel_tt_cons: v.fuel_tt_cons ?? null,
    oil_amt: v.oil_amt ?? null,
    oil_cons: v.oil_cons ?? null,
    water_amt: v.water_amt ?? null,
    water_cons: v.water_cons ?? null,
  }), []);

  async function loadVessels(date: string) {
    setLoading(true);
    if (dataSource === "branches") {
      const { data } = await supabase.from("dpr_entries").select("*").eq("report_date", date).order("vessel_name");
      setVessels(data || []);
    } else {
      const { data } = await supabase.rpc("get_latest_vessel_dpr", { days_back: 30 });
      const mapped = ((data || []) as VesselDprRow[]).map((v) => mapVesselDprToDprRow(v));
      mapped.sort((a, b) => a.vessel_name.localeCompare(b.vessel_name, "ru"));
      setVessels(mapped);
    }
    setSelVessel(null);
    setLoading(false);
  }

  const getVesselType = (vesselName: string): string => {
    const fleetType = getFleetType(vesselName);
    return fleetType ? fleetType.toUpperCase() : "";
  };

  const allTypes = useMemo(() => {
    const types = new Set<string>();
    vessels.forEach(v => { const t = getVesselType(v.vessel_name); if (t) types.add(t); });
    return ["Все", ...Array.from(types).sort()];
  }, [vessels, getVesselType]);

  const allBranches = useMemo(() => {
    const branches = new Set<string>();
    vessels.forEach(v => { if (v.branch) branches.add(v.branch); });
    return ["Все", ...Array.from(branches).sort()];
  }, [vessels]);

  const allStatuses = useMemo(() => {
    const seen = new Set(vessels.map(v => cls(v.status)).filter(c => c !== "oth"));
    const labels: string[] = [];
    if (seen.has("asg")) labels.push("АСГ");
    if (seen.has("asd")) labels.push("АСД");
    if (seen.has("rem")) labels.push("Ремонт");
    return ["Все", ...labels];
  }, [vessels, dataSource]);

  const filtered = useMemo(() => {
    return vessels.filter(v => {
      const typeOk = filterType === "Все" || getVesselType(v.vessel_name) === filterType;
      const branchOk = filterBranch === "Все" || v.branch === filterBranch;
      const statusOk = filterStatus === "Все"
        ? true
        : cls(v.status) === (filterStatus === "АСГ" ? "asg" : filterStatus === "АСД" ? "asd" : "rem");
      return typeOk && branchOk && statusOk;
    });
  }, [vessels, filterType, filterBranch, filterStatus, getVesselType, dataSource]);

  const searchFiltered = useMemo(() => {
    return filtered.filter(v => !search || v.vessel_name.toLowerCase().includes(search.toLowerCase()));
  }, [filtered, search]);

  useEffect(() => {
    if (!mapObj.current || !markersRef.current) return;
    markersRef.current.clearLayers();
    const bounds: L.LatLng[] = [];

    // Для vessel_dpr: цвет маркера зависит от parse_ok и времени суток
    const isToday = (d: string) => d === new Date().toISOString().slice(0, 10);

    const getVesselMarkerStatus = (v: DprRow): "asg" | "asd" | "rem" | "oth" | "yellow" | "red" | "gray" => {
      if (dataSource !== "vessels") return cls(v.status);
      const vr = v as VesselDprMapRow;
      // Сегодняшняя ДПР во вложении (не распарсена) — жёлтый
      if (isToday(v.report_date) && vr.parse_ok === false) return "yellow";
      // Во всех остальных случаях — цвет статуса
      return cls(v.status);
    };

    filtered.forEach((v) => {
      if (v.lat == null || v.lng == null) return;
      const markerStatus = getVesselMarkerStatus(v);
      const icon = markerStatus === "yellow" ? mkIcon("oth", "#eab308") :
                    markerStatus === "red" ? mkIcon("oth", "#dc2626") :
                    markerStatus === "gray" ? mkIcon("oth", "#9ca3af") :
                    mkIcon(markerStatus as "asg" | "asd" | "rem" | "oth");
      const marker = L.marker([v.lat, v.lng], { icon, _status: markerStatus } as any);
      const label = formatVesselName(v.vessel_name.replace(/^(мфасс|тбс|ссн|мбс|мвс|мб|нис|асс|скб)\s+/i, "").trim());
      marker.bindTooltip(label, { permanent: false, direction: "bottom", offset: [0, 4], className: "vessel-label-map" });
      marker.on("click", (e: any) => {
  L.DomEvent.stopPropagation(e);
  const savedZoom = mapObj.current?.getZoom();
  const savedCenter = mapObj.current?.getCenter();
  setSelVessel(v);
  if (isMobile) setSidebarOpen(false);
  setTimeout(() => {
    if (mapObj.current && savedZoom && savedCenter) {
      mapObj.current.setView(savedCenter, savedZoom, { animate: false });
    }
  }, 50);
});
      markersRef.current!.addLayer(marker);
      bounds.push(L.latLng(v.lat, v.lng));
    });
    const updateLabels = () => {
      markersRef.current!.getLayers().forEach((m: any) => {
        if (!m.getTooltip) return;
        const parent = markersRef.current!.getVisibleParent(m);
        if (parent === m) m.openTooltip(); else m.closeTooltip();
      });
    };
    markersRef.current.on("animationend", updateLabels);
    mapObj.current.on("zoomend", updateLabels);
    setTimeout(updateLabels, 300);
    return () => { if (mapObj.current) mapObj.current.off("zoomend", updateLabels); };
  }, [filtered, isMobile]);

  const cAsg = filtered.filter((v) => cls(v.status) === "asg").length;
  const cAsd = filtered.filter((v) => cls(v.status) === "asd").length;
  const cRem = filtered.filter((v) => cls(v.status) === "rem").length;
  const noPos = filtered.filter((v) => v.lat == null).length;

  const showSidebar = isMobile ? sidebarOpen : true;

  return (
    <div style={{ display: "flex", height: "calc(100dvh - 60px)", gap: 0, overflow: "hidden", position: "relative", zIndex: 0 }}>
      {dragging && isAdmin && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(11,15,24,0.85)", border: "3px dashed #3b82f6", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, pointerEvents: "none" }}>
          <div style={{ fontSize: 52 }}>📂</div>
          <div style={{ fontSize: 18, color: "#3b82f6", fontFamily: "monospace", fontWeight: 600 }}>Отпустите файлы ДПР</div>
          <div style={{ fontSize: 13, color: "#9ca3af" }}>Поддерживаются .msg и .eml файлы от всех филиалов</div>
        </div>
      )}

      {isMobile && !sidebarOpen && (
        <button onClick={() => setSidebarOpen(true)} style={{ position: "absolute", top: 10, left: 10, zIndex: 800, width: 40, height: 40, borderRadius: 8, background: "#fff", border: `1px solid ${T.border}`, boxShadow: "0 2px 8px rgba(0,0,0,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, cursor: "pointer", color: T.text }}>☰</button>
      )}

      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{ position: "absolute", inset: 0, zIndex: 600, background: "rgba(0,0,0,0.3)" }} />
      )}

      {showSidebar && (
        <Sidebar
          dates={dates}
          selDate={selDate}
          onDateChange={setSelDate}
          filterType={filterType}
          filterBranch={filterBranch}
          filterStatus={filterStatus}
          allTypes={allTypes}
          allBranches={allBranches}
          allStatuses={allStatuses}
          onFilterTypeChange={setFilterType}
          onFilterBranchChange={setFilterBranch}
          onFilterStatusChange={setFilterStatus}
          cAsg={cAsg}
          cAsd={cAsd}
          cRem={cRem}
          total={filtered.length}
          noPos={noPos}
          uploadMsg={uploadMsg}
          uploading={uploading}
          search={search}
          onSearchChange={setSearch}
          filteredVessels={searchFiltered}
          selectedVessel={selVessel}
          onSelectVessel={(v) => {
            setSelVessel(v);
            if (isMobile) setSidebarOpen(false);
            if (v.lat != null && v.lng != null && mapObj.current) {
              mapObj.current.setView([v.lat, v.lng], Math.max(mapObj.current.getZoom(), 7), { animate: true });
            }
          }}
          isMobile={isMobile}
          onCloseSidebar={() => setSidebarOpen(false)}
          sidebarOpen={sidebarOpen}
          dataSource={dataSource}
          onDataSourceChange={(ds) => {
            setDataSource(ds);
            setSelDate("");
            setFilterStatus("Все");
          }}
          isAdmin={isAdmin}
        />
      )}

      <div style={{ flex: 1, position: "relative" }}>
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

        {dates.length === 0 && !loading && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none", zIndex: 500 }}>
            <div style={{ fontSize: 16, color: T.text2, fontWeight: 500, marginBottom: 6 }}>{isAdmin ? "Загрузите файлы ДПР" : "Данные ДПР не загружены"}</div>
            {isAdmin && <div style={{ fontSize: 12, color: T.text2 }}>Используйте кнопку «Загрузить .msg» в шапке или перетащите файлы на страницу</div>}
          </div>
        )}

        {selVessel && (
          <VesselPopup
            vessel={selVessel}
            vesselType={getVesselType(selVessel.vessel_name)}
            canView={canView}
            dataSource={dataSource}
            onClose={() => setSelVessel(null)}
          />
        )}

      </div>

      <style>{`
        .vessel-label-map { background: white !important; border: 1px solid #d1dce8 !important; border-radius: 3px !important; padding: 2px 6px !important; font-size: 11px !important; font-weight: 500 !important; color: #1a2a3a !important; box-shadow: 0 1px 4px rgba(0,0,0,.15) !important; white-space: nowrap !important; }
        .vessel-label-map::before { display: none !important; }
        .leaflet-control-attribution { display: none !important; }
      `}</style>
    </div>
  );
}
