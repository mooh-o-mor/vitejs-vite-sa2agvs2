import { useState, useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { supabase } from "../../lib/supabase";
import { parseMsgFiles, type DprRow } from "../../lib/parseDpr";
import { T, typeOrder } from "../../lib/types";
import { getType, formatVesselName } from "../../lib/utils";
import { mkIcon, mkPieIcon } from "./mapIcons";
import { Sidebar } from "./Sidebar";
import { VesselPopup } from "./VesselPopup";

function cls(stat: string): "asg" | "asd" | "rem" | "oth" {
  if (!stat) return "oth";
  const s = stat.toUpperCase();
  if (s.startsWith("АСГ")) return "asg";
  if (s.startsWith("АСД")) return "asd";
  if (s.startsWith("РЕМ") || s.includes("РЕМОНТ") || s.includes("ОСВИДЕТ")) return "rem";
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
  const mapObj = useRef<L.Map | null>(null);
  const markersRef = useRef<any>(null);

  const [dates, setDates] = useState<string[]>([]);
  const [selDate, setSelDate] = useState<string>("");
  const [vessels, setVessels] = useState<DprRow[]>([]);
  const [typeMap, setTypeMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("Все");
  const [filterBranch, setFilterBranch] = useState<string>("Все");
  const [filterStatus, setFilterStatus] = useState<string>("Все");
  const [selVessel, setSelVessel] = useState<DprRow | null>(null);

  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Load type maps from vessels table
  useEffect(() => {
    supabase.from("vessels").select("name").then(({ data }) => {
      if (data) {
        const t = new Map<string, string>();
        data.forEach((v: any) => {
          const full = v.name.toUpperCase().trim();
          const typeStr = getType(v.name, typeOrder);
          if (typeStr) {
            t.set(full, typeStr);
            const short = full.replace(/^(МФАСС|ТБС|ССН|МБС|МВС|МБ|НИС|АСС|БП)\s+/i, "").trim();
            if (short !== full) t.set(short, typeStr);
          }
        });
        setTypeMap(t);
      }
    });
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

  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;
    const map = L.map(mapRef.current, { center: [62, 90], zoom: 3, zoomControl: false, attributionControl: false });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: "", subdomains: "abcd", maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);

    markersRef.current = (L as any).markerClusterGroup({
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (cluster: any) => {
        const children = cluster.getAllChildMarkers();
        const counts = { asg: 0, asd: 0, rem: 0, oth: 0 };
        children.forEach((m: any) => {
          if (m.options._status) counts[m.options._status as keyof typeof counts]++;
        });
        return mkPieIcon(counts, children.length);
      },
    }).addTo(map);

    mapObj.current = map;
    return () => { map.remove(); mapObj.current = null; };
  }, []);

  useEffect(() => { loadDates(); }, []);

  async function loadDates() {
    const { data } = await supabase.from("dpr_entries").select("report_date").order("report_date", { ascending: false });
    if (data) {
      const unique = [...new Set(data.map((r: any) => r.report_date))];
      setDates(unique);
      if (unique.length > 0 && !selDate) setSelDate(unique[0]);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (selDate) loadVessels(selDate);
  }, [selDate]);

  async function loadVessels(date: string) {
    setLoading(true);
    const { data } = await supabase.from("dpr_entries").select("*").eq("report_date", date).order("vessel_name");
    setVessels(data || []);
    setSelVessel(null);
    setLoading(false);
  }

  const getVesselType = (vesselName: string): string => {
    const normalized = vesselName.toUpperCase().trim();
    let type = typeMap.get(normalized);
    if (type) return type;
    const withoutPrefix = normalized.replace(/^(МФАСС|ТБС|ССН|МБС|МВС|МБ|НИС|АСС|БП)\s+/i, "").trim();
    type = typeMap.get(withoutPrefix);
    if (type) return type;
    for (const [key, val] of typeMap.entries()) {
      if (normalized.includes(key) || key.includes(normalized)) return val;
    }
    return "";
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

  const allStatuses = ["Все", "АСГ", "АСД", "РЕМ"];

  const filtered = useMemo(() => {
    return vessels.filter(v => {
      const typeOk = filterType === "Все" || getVesselType(v.vessel_name) === filterType;
      const branchOk = filterBranch === "Все" || v.branch === filterBranch;
      const statusOk = filterStatus === "Все" || cls(v.status) === (filterStatus === "АСГ" ? "asg" : filterStatus === "АСД" ? "asd" : "rem");
      return typeOk && branchOk && statusOk;
    });
  }, [vessels, filterType, filterBranch, filterStatus, getVesselType]);

  const searchFiltered = useMemo(() => {
    return filtered.filter(v => !search || v.vessel_name.toLowerCase().includes(search.toLowerCase()));
  }, [filtered, search]);

  useEffect(() => {
    if (!mapObj.current || !markersRef.current) return;
    markersRef.current.clearLayers();
    const bounds: L.LatLng[] = [];
    filtered.forEach((v) => {
      if (v.lat == null || v.lng == null) return;
      const c = cls(v.status);
      const marker = L.marker([v.lat, v.lng], { icon: mkIcon(c), _status: c } as any);
      const label = formatVesselName(v.vessel_name.replace(/^(мфасс|тбс|ссн|мбс|мвс|мб|нис|асс|бп)\s+/i, "").trim());
      marker.bindTooltip(label, { permanent: false, direction: "bottom", offset: [0, 4], className: "vessel-label-map" });
      marker.on("click", () => {
        setSelVessel(v);
        if (isMobile) setSidebarOpen(false);
        mapObj.current?.setView([v.lat!, v.lng!], Math.max(mapObj.current.getZoom(), 7), { animate: true });
      });
      markersRef.current!.addLayer(marker);
      bounds.push(L.latLng(v.lat, v.lng));
    });
    if (bounds.length > 1) {
      mapObj.current.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], animate: true });
    }
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

  async function handleUpload(files: FileList) {
    setUploading(true);
    setUploadMsg("Обработка...");
    try {
      const { data: vesselList } = await supabase.from("vessels").select("name, branch");
      const branchMap = new Map<string, string>();
      (vesselList || []).forEach((v: any) => {
        const original = v.name.trim();
        const upper = original.toUpperCase();
        branchMap.set(original, v.branch);
        branchMap.set(upper, v.branch);
        const withoutPrefix = original.replace(/^(МФАСС|ТБС|ССН|МБС|МВС|МБ|НИС)\s+/i, "");
        if (withoutPrefix !== original) {
          branchMap.set(withoutPrefix, v.branch);
          branchMap.set(withoutPrefix.toUpperCase(), v.branch);
        }
      });

      const { vessels: parsed, date } = await parseMsgFiles(Array.from(files), branchMap);

      if (!parsed.length) { setUploadMsg("⚠ Данные не найдены"); setUploading(false); return; }
      if (!date) { setUploadMsg("⚠ Дата не определена"); setUploading(false); return; }

      const dateStr = date.toISOString().slice(0, 10);
      setUploadMsg(`Найдено ${parsed.length} судов за ${dateStr}, сохраняю...`);

      // Загружаем записи за ту же дату (если перезаливка)
      const { data: existing } = await supabase
        .from("dpr_entries")
        .select("vessel_name, contract_info, work_period")
        .eq("report_date", dateStr);

      // Если для этой даты нет данных о контрактах — берём из последней предыдущей даты
      let prevData = existing || [];
      if (prevData.filter((r: any) => r.contract_info || r.work_period).length === 0) {
        const { data: prevDates } = await supabase
          .from("dpr_entries")
          .select("report_date")
          .lt("report_date", dateStr)
          .order("report_date", { ascending: false })
          .limit(1);
        if (prevDates && prevDates.length > 0) {
          const { data: prevRecords } = await supabase
            .from("dpr_entries")
            .select("vessel_name, contract_info, work_period")
            .eq("report_date", prevDates[0].report_date);
          prevData = prevRecords || [];
        }
      }

      const existingMap = new Map(prevData.map((r: any) => [r.vessel_name, r]));

      let ok = 0, fail = 0;
      for (const v of parsed) {
        const prev = existingMap.get(v.name);
        const row = {
          vessel_name: v.name,
          branch: v.branch,
          report_date: dateStr,
          status: v.status,
          coord_raw: v.coordRaw,
          lat: v.lat,
          lng: v.lng,
          note: v.note,
          supplies: v.supplies,
          contract_info: prev?.contract_info || null,
          work_period: prev?.work_period || null,
        };
        const { error } = await supabase.from("dpr_entries").upsert(row, { onConflict: "vessel_name,report_date" });
        if (error) { fail++; console.error(v.name, error); } else ok++;
      }

      setUploadMsg(`✓ Загружено: ${ok} судов${fail ? `, ошибок: ${fail}` : ""}`);
      await loadDates();
      setSelDate(dateStr);
    } catch (e: any) {
      setUploadMsg("Ошибка: " + (e?.message || e));
    }
    setUploading(false);
  }

  const cAsg = filtered.filter((v) => cls(v.status) === "asg").length;
  const cAsd = filtered.filter((v) => cls(v.status) === "asd").length;
  const cRem = filtered.filter((v) => cls(v.status) === "rem").length;
  const noPos = filtered.filter((v) => v.lat == null).length;

  const showSidebar = isMobile ? sidebarOpen : true;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 90px)", gap: 0, overflow: "hidden", position: "relative", zIndex: 0 }}>
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
          typeMap={typeMap}
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
