import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { supabase } from "../lib/supabase";
import { parseMsgFiles, type DprSupply } from "../lib/parseDpr";
import { T } from "../lib/types";

/* ── Status helpers ── */
function cls(stat: string): "asg" | "asd" | "rem" | "oth" {
  if (!stat) return "oth";
  const s = stat.toUpperCase();
  if (s.startsWith("АСГ")) return "asg";
  if (s.startsWith("АСД")) return "asd";
  if (s.startsWith("РЕМ") || s.includes("РЕМОНТ") || s.includes("ОСВИДЕТ")) return "rem";
  return "oth";
}
const CLR = { asg: "#e53935", asd: "#2e7d32", rem: "#757575", oth: "#6b8aa8" };

function shortStatus(stat: string): string {
  const s = stat.toUpperCase();
  if (s.startsWith("АСГ")) return "АСГ";
  if (s.startsWith("АСД")) return "АСД";
  if (s.startsWith("РЕМ")) return "РЕМ";
  return stat;
}

function mkIcon(c: string) {
  const color = CLR[c as keyof typeof CLR] || CLR.oth;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="32" viewBox="0 0 26 32">
    <path d="M13 0C5.8 0 0 5.8 0 13c0 9 13 19 13 19s13-10 13-19C26 5.8 20.2 0 13 0z" fill="white"/>
    <path d="M13 1.5C6.6 1.5 1.5 6.6 1.5 13c0 8.3 11.5 17.5 11.5 17.5S24.5 21.3 24.5 13C24.5 6.6 19.4 1.5 13 1.5z" fill="${color}"/>
    <circle cx="13" cy="13" r="4.5" fill="white" opacity=".9"/>
  </svg>`;
  return L.divIcon({ html: svg, iconSize: [26, 32], iconAnchor: [13, 32], popupAnchor: [0, -34], className: "" });
}

/* ── Pie chart SVG for cluster icon ── */
function mkPieIcon(counts: Record<string, number>, total: number) {
  const sz = total < 5 ? 38 : total < 10 ? 44 : 50;
  const r = sz / 2;
  const ir = r * 0.55;

  const segments = [
    { key: "asg", count: counts.asg || 0, color: CLR.asg },
    { key: "asd", count: counts.asd || 0, color: CLR.asd },
    { key: "rem", count: counts.rem || 0, color: CLR.rem },
    { key: "oth", count: counts.oth || 0, color: CLR.oth },
  ].filter((s) => s.count > 0);

  let paths = "";
  if (segments.length === 1) {
    paths = `<circle cx="${r}" cy="${r}" r="${r}" fill="${segments[0].color}"/>`;
  } else {
    let startAngle = -Math.PI / 2;
    for (const seg of segments) {
      const angle = (seg.count / total) * 2 * Math.PI;
      const endAngle = startAngle + angle;
      const x1 = r + r * Math.cos(startAngle);
      const y1 = r + r * Math.sin(startAngle);
      const x2 = r + r * Math.cos(endAngle);
      const y2 = r + r * Math.sin(endAngle);
      const large = angle > Math.PI ? 1 : 0;
      paths += `<path d="M${r},${r} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${seg.color}"/>`;
      startAngle = endAngle;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}">
    <circle cx="${r}" cy="${r}" r="${r}" fill="white"/>
    ${paths}
    <circle cx="${r}" cy="${r}" r="${ir}" fill="white"/>
    <text x="${r}" y="${r}" text-anchor="middle" dominant-baseline="central"
      font-family="monospace" font-size="${total > 9 ? 11 : 13}" font-weight="700" fill="#1a2a3a">${total}</text>
  </svg>`;

  return L.divIcon({
    html: svg, className: "",
    iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2],
  });
}

/* ── DB row type ── */
interface DprRow {
  id: number;
  vessel_name: string;
  branch: string;
  report_date: string;
  status: string;
  coord_raw: string;
  lat: number | null;
  lng: number | null;
  note: string;
  supplies: DprSupply[];
}

/* ── Component ── */
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
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "asg" | "asd" | "rem">("all");
  const [selVessel, setSelVessel] = useState<DprRow | null>(null);

  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  // Mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Handle files passed from header button
  useEffect(() => {
    if (externalFiles && externalFiles.length > 0 && isAdmin) {
      handleUpload(externalFiles);
      onExternalFilesConsumed?.();
    }
  }, [externalFiles]);

  // Drag & drop handlers + header upload button
  useEffect(() => {
    const onEnter = (e: DragEvent) => { e.preventDefault(); dragCounter.current++; setDragging(true); };
    const onLeave = () => { dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragging(false); } };
    const onOver = (e: DragEvent) => { e.preventDefault(); };
    const onDrop = (e: DragEvent) => {
      e.preventDefault(); dragCounter.current = 0; setDragging(false);
      if (e.dataTransfer?.files?.length && isAdmin) handleUpload(e.dataTransfer.files);
    };
    const onDprUpload = (e: Event) => {
      const files = (e as CustomEvent).detail as FileList;
      if (files?.length) handleUpload(files);
    };
    document.addEventListener("dragenter", onEnter);
    document.addEventListener("dragleave", onLeave);
    document.addEventListener("dragover", onOver);
    document.addEventListener("drop", onDrop);
    window.addEventListener("dpr-upload", onDprUpload);
    return () => {
      document.removeEventListener("dragenter", onEnter);
      document.removeEventListener("dragleave", onLeave);
      document.removeEventListener("dragover", onOver);
      document.removeEventListener("drop", onDrop);
      window.removeEventListener("dpr-upload", onDprUpload);
    };
  }, [isAdmin]);

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;
   const map = L.map(mapRef.current, { center: [62, 90], zoom: 3, zoomControl: false, attributionControl: false });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: "", subdomains: "abcd", maxZoom: 19,
    }).addTo(map);
    // Zoom controls
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
        const total = children.length;
        return mkPieIcon(counts, total);
      },
    }).addTo(map);

    mapObj.current = map;
    return () => { map.remove(); mapObj.current = null; };
  }, []);

  // Load available dates
  useEffect(() => { loadDates(); }, []);

  async function loadDates() {
    const { data } = await supabase
      .from("dpr_entries")
      .select("report_date")
      .order("report_date", { ascending: false });
    if (data) {
      const unique = [...new Set(data.map((r: any) => r.report_date))];
      setDates(unique);
      if (unique.length > 0 && !selDate) setSelDate(unique[0]);
    }
    setLoading(false);
  }

  // Load vessels for selected date
  useEffect(() => {
    if (selDate) loadVessels(selDate);
  }, [selDate]);

  async function loadVessels(date: string) {
    setLoading(true);
    const { data } = await supabase
      .from("dpr_entries")
      .select("*")
      .eq("report_date", date)
      .order("vessel_name");
    setVessels(data || []);
    setSelVessel(null);
    setLoading(false);
  }

  // Render markers when vessels or filter change
  useEffect(() => {
    if (!mapObj.current || !markersRef.current) return;
    markersRef.current.clearLayers();

    const vis = filtered();
    const bounds: L.LatLng[] = [];

    vis.forEach((v) => {
      if (v.lat == null || v.lng == null) return;
      const c = cls(v.status);
      const marker = L.marker([v.lat, v.lng], { icon: mkIcon(c), _status: c } as any);
      marker.bindTooltip(v.vessel_name, {
        permanent: false, direction: "bottom", offset: [0, 4],
        className: "vessel-label-map",
      });
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

    return () => {
      if (mapObj.current) mapObj.current.off("zoomend", updateLabels);
    };
  }, [vessels, filter, search]);

  const filtered = useCallback(() => {
    return vessels.filter((v) => {
      const sq = search.toLowerCase();
      const mq = !sq || v.vessel_name.toLowerCase().includes(sq) || v.branch.toLowerCase().includes(sq);
      const mf = filter === "all" || cls(v.status) === filter;
      return mq && mf;
    });
  }, [vessels, filter, search]);

  // Upload handler
  async function handleUpload(files: FileList) {
    setUploading(true);
    setUploadMsg("Обработка...");
    try {
      const { vessels: parsed, date } = await parseMsgFiles(Array.from(files));
      if (!parsed.length) { setUploadMsg("⚠ Данные не найдены"); setUploading(false); return; }
      if (!date) { setUploadMsg("⚠ Дата не определена"); setUploading(false); return; }

      const dateStr = date.toISOString().slice(0, 10);
      setUploadMsg(`Найдено ${parsed.length} судов за ${dateStr}, сохраняю...`);

      const { data: vesselList } = await supabase.from("vessels").select("name, branch");
      const BRANCH_MAP: Record<string, string> = {
        "СевФ": "СВРФ", "БФ": "БЛТФ", "ПримФ": "ПРМФ", "СахФ": "СХЛФ",
      };
      const branchMap = new Map<string, string>();
      (vesselList || []).forEach((v: any) => {
        if (v.branch) {
          const normalized = BRANCH_MAP[v.branch] || v.branch;
          branchMap.set(v.name.toUpperCase().trim(), normalized);
        }
      });

      let ok = 0, fail = 0;
      for (const v of parsed) {
        const row = {
          vessel_name: v.name,
          branch: (v.branch && v.branch.trim()) || branchMap.get(v.name.toUpperCase().trim()) || "",
          report_date: dateStr,
          status: v.status,
          coord_raw: v.coordRaw,
          lat: v.lat,
          lng: v.lng,
          note: v.note,
          supplies: v.supplies,
        };
        const { error } = await supabase
          .from("dpr_entries")
          .upsert(row, { onConflict: "vessel_name,report_date" });
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

  // Stats
  const all = filtered();
  const cAsg = all.filter((v) => cls(v.status) === "asg").length;
  const cAsd = all.filter((v) => cls(v.status) === "asd").length;
  const cRem = all.filter((v) => cls(v.status) === "rem").length;
  const noPos = all.filter((v) => v.lat == null).length;

  const fmtDateRu = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}.${m}.${y}`;
  };

  const fbtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "5px 0", textAlign: "center", borderRadius: 4,
    fontSize: 11, fontWeight: 600, cursor: "pointer",
    border: `1px solid ${active ? T.accent : T.border}`,
    background: active ? T.accent : "transparent",
    color: active ? "#fff" : T.text2,
  });

  const showSidebar = isMobile ? sidebarOpen : true;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 90px)", gap: 0, overflow: "hidden", position: "relative", zIndex: 0 }}>

      {/* Drag overlay */}
      {dragging && isAdmin && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9000,
          background: "rgba(11,15,24,0.85)", border: "3px dashed #3b82f6",
          display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16,
          pointerEvents: "none",
        }}>
          <div style={{ fontSize: 52 }}>📂</div>
          <div style={{ fontSize: 18, color: "#3b82f6", fontFamily: "monospace", fontWeight: 600 }}>Отпустите файлы ДПР</div>
          <div style={{ fontSize: 13, color: "#9ca3af" }}>Поддерживаются .msg файлы от всех филиалов</div>
        </div>
      )}

      {/* Mobile hamburger */}
      {isMobile && !sidebarOpen && (
        <button onClick={() => setSidebarOpen(true)} style={{
          position: "absolute", top: 10, left: 10, zIndex: 800,
          width: 40, height: 40, borderRadius: 8,
          background: "#fff", border: `1px solid ${T.border}`,
          boxShadow: "0 2px 8px rgba(0,0,0,.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, cursor: "pointer", color: T.text,
        }}>☰</button>
      )}

      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} style={{
          position: "absolute", inset: 0, zIndex: 600,
          background: "rgba(0,0,0,0.3)",
        }} />
      )}

      {/* ── SIDEBAR ── */}
      {showSidebar && (
        <div style={{
          width: 280, minWidth: 280, background: "#fff",
          borderRight: `1px solid ${T.border}`,
          display: "flex", flexDirection: "column",
          ...(isMobile ? { position: "absolute", top: 0, left: 0, bottom: 0, zIndex: 700, boxShadow: "4px 0 20px rgba(0,0,0,.2)" } : {}),
        }}>

          {/* Mobile close button */}
          {isMobile && (
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 8px", borderBottom: `1px solid ${T.border}` }}>
              <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: T.text2 }}>✕</button>
            </div>
          )}

          {/* Date + stats */}
          <div style={{ padding: 10, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <select
                value={selDate}
                onChange={(e) => setSelDate(e.target.value)}
                style={{ flex: 1, padding: "5px 8px", borderRadius: 4, border: `1px solid ${T.border}`, fontSize: 12, fontFamily: "monospace", background: "#f8fafc" }}
              >
                {dates.length === 0 && <option value="">— нет данных —</option>}
                {dates.map((d) => <option key={d} value={d}>{fmtDateRu(d)}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
              <span><b style={{ color: CLR.asg }}>{cAsg}</b> <span style={{ color: T.text2 }}>АСГ</span></span>
              <span><b style={{ color: CLR.asd }}>{cAsd}</b> <span style={{ color: T.text2 }}>АСД</span></span>
              <span><b style={{ color: CLR.rem }}>{cRem}</b> <span style={{ color: T.text2 }}>РЕМ</span></span>
              <span style={{ color: T.text2 }}><b>{all.length}</b> всего</span>
            </div>
            {noPos > 0 && <div style={{ fontSize: 10, color: "#c07800", marginTop: 4 }}>⚠ без позиции: {noPos}</div>}
            {uploadMsg && <div style={{ fontSize: 11, color: uploading ? T.text2 : T.accent, marginTop: 6 }}>{uploadMsg}</div>}
          </div>

          {/* Search */}
          <div style={{ padding: 10, borderBottom: `1px solid ${T.border}` }}>
            <input
              placeholder="Поиск судна, филиала..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", borderRadius: 4, border: `1px solid ${T.border}`, fontSize: 12 }}
            />
          </div>

          {/* Filter buttons */}
          <div style={{ display: "flex", gap: 4, padding: "8px 10px", borderBottom: `1px solid ${T.border}` }}>
            {(["all", "asg", "asd", "rem"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={fbtn(filter === f)}>
                {f === "all" ? "Все" : f === "asg" ? "АСГ" : f === "asd" ? "АСД" : "РЕМ"}
              </button>
            ))}
          </div>

          {/* Vessel list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {all.map((v) => {
              const c = cls(v.status);
              const isSel = selVessel?.vessel_name === v.vessel_name;
              return (
                <div
                  key={v.vessel_name}
                  onClick={() => {
                    setSelVessel(v);
                    if (isMobile) setSidebarOpen(false);
                    if (v.lat != null && v.lng != null && mapObj.current) {
                      mapObj.current.setView([v.lat, v.lng], Math.max(mapObj.current.getZoom(), 7), { animate: true });
                    }
                  }}
                  style={{
                    padding: "8px 12px", borderBottom: `1px solid ${T.border}`, cursor: "pointer",
                    borderLeft: `3px solid ${isSel ? T.accent : "transparent"}`,
                    background: isSel ? "rgba(30,144,255,0.06)" : "transparent",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{v.vessel_name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                    <span style={{
                      display: "inline-block", padding: "1px 6px", borderRadius: 3,
                      fontFamily: "monospace", fontSize: 10, fontWeight: 600,
                      background: c === "asg" ? "#ffebee" : c === "asd" ? "#e8f5e9" : "#f5f5f5",
                      color: CLR[c],
                    }}>{canView ? v.status.split("/")[0].trim() : shortStatus(v.status)}</span>
                    <span style={{ fontSize: 11, color: T.text2 }}>{v.branch}</span>
                    {v.lat == null && <span style={{ fontSize: 10, color: "#c07800" }}>📍?</span>}
                  </div>
                </div>
              );
            })}
            {all.length === 0 && !loading && (
              <div style={{ padding: 20, textAlign: "center", color: T.text2, fontSize: 13 }}>
                {dates.length === 0 ? "Нет загруженных данных" : "Нет судов по фильтру"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MAP ── */}
      <div style={{ flex: 1, position: "relative" }}>
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

        {/* Empty state */}
        {dates.length === 0 && !loading && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none", zIndex: 500 }}>
            <div style={{ fontSize: 16, color: T.text2, fontWeight: 500, marginBottom: 6 }}>
              {isAdmin ? "Загрузите файлы ДПР" : "Данные ДПР не загружены"}
            </div>
            {isAdmin && <div style={{ fontSize: 12, color: T.text2 }}>Используйте кнопку «Загрузить .msg» в шапке или перетащите файлы на страницу</div>}
          </div>
        )}

        {/* Detail panel */}
        {selVessel && (
          <div style={{
            position: "absolute", right: isMobile ? 6 : 14, bottom: isMobile ? 6 : 36,
            width: isMobile ? "calc(100% - 12px)" : 320, maxHeight: "70vh",
            background: "#fff", border: `1px solid ${T.border}`, borderRadius: 8, zIndex: 900,
            boxShadow: "0 12px 48px rgba(0,0,0,.15)", display: "flex", flexDirection: "column", overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "flex-start", gap: 8, flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, flex: 1, lineHeight: 1.3 }}>{selVessel.vessel_name}</div>
              <button onClick={() => setSelVessel(null)} style={{ background: "none", border: "none", color: T.text2, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
            </div>
            {/* Body */}
            <div style={{ overflowY: "auto", padding: "12px 14px", flex: 1 }}>
              <DetailRow label="Статус" value={
                <span style={{
                  padding: "1px 6px", borderRadius: 3, fontFamily: "monospace", fontSize: 10, fontWeight: 600,
                  background: cls(selVessel.status) === "asg" ? "#ffebee" : cls(selVessel.status) === "asd" ? "#e8f5e9" : "#f5f5f5",
                  color: CLR[cls(selVessel.status)],
                }}>{canView ? selVessel.status : shortStatus(selVessel.status)}</span>
              } />
              <DetailRow label="Филиал" value={selVessel.branch} />
              <DetailRow label="Местоположение" value={selVessel.coord_raw || "—"} small />
              <DetailRow label="На карте" value={
                <span style={{ color: selVessel.lat != null ? "#00913f" : "#c07800" }}>
                  {selVessel.lat != null ? "✓ определена" : "— нет в базе портов"}
                </span>
              } />

              {canView && (
                <>
                  {selVessel.note && <DetailRow label="Примечание" value={selVessel.note} small />}
                  {selVessel.supplies && selVessel.supplies.length > 0 && (
                    <>
                      <div style={{ fontSize: 10, color: T.text2, textTransform: "uppercase", letterSpacing: 0.5, margin: "10px 0 4px", fontFamily: "monospace" }}>Запасы</div>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead>
                          <tr>
                            {["Вид", "Остаток", "%", "Расход", "До"].map((h) => (
                              <th key={h} style={{ color: T.text2, fontWeight: "normal", textAlign: "left", padding: "3px 4px", borderBottom: `1px solid ${T.border}`, fontFamily: "monospace" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(selVessel.supplies as DprSupply[]).map((s, i) => (
                            <tr key={i}>
                              <td style={{ padding: "4px 4px", borderBottom: `1px solid ${T.border}` }}>{s.type}</td>
                              <td style={{ padding: "4px 4px", borderBottom: `1px solid ${T.border}`, color: T.accent, fontWeight: 600, fontFamily: "monospace" }}>{s.amt}</td>
                              <td style={{ padding: "4px 4px", borderBottom: `1px solid ${T.border}`, color: T.text2, fontFamily: "monospace" }}>{s.pct && !isNaN(parseFloat(s.pct.replace(",", "."))) ? parseFloat(s.pct.replace(",", ".")).toFixed(1) + "%" : "—"}</td>
                              <td style={{ padding: "4px 4px", borderBottom: `1px solid ${T.border}`, color: "#c07800", fontFamily: "monospace" }}>{s.cons}</td>
                              <td style={{ padding: "4px 4px", borderBottom: `1px solid ${T.border}`, fontSize: 10, fontFamily: "monospace" }}>{s.lim || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Leaflet tooltip styles */}
      <style>{`
        .vessel-label-map {
          background: white !important;
          border: 1px solid #d1dce8 !important;
          border-radius: 3px !important;
          padding: 2px 6px !important;
          font-size: 11px !important;
          font-weight: 500 !important;
          color: #1a2a3a !important;
          box-shadow: 0 1px 4px rgba(0,0,0,.15) !important;
          white-space: nowrap !important;
        }
        .vessel-label-map::before { display: none !important; }
        .leaflet-control-attribution { display: none !important; }
      `}</style>
    </div>
  );
}

/* ── Tiny subcomponent ── */
function DetailRow({ label, value, small }: { label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "5px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
      <span style={{ color: T.text2, flexShrink: 0, paddingRight: 8 }}>{label}</span>
      <span style={{ color: T.text, textAlign: "right", fontFamily: "monospace", fontSize: small ? 10 : 11, maxWidth: 180, whiteSpace: small ? "normal" : undefined }}>{value}</span>
    </div>
  );
}
