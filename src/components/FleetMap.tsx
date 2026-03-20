import { useState, useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import { supabase } from "../lib/supabase";
import { parseMsgFiles } from "../lib/parseDpr";

/* ───────────── Types ───────────── */

type StatusKey = "asg" | "asd" | "rem" | "oth";

type FleetMapProps = {
  isAdmin: boolean;
  externalFiles?: FileList | null;
  onExternalFilesConsumed?: () => void;
};

interface Vessel {
  vessel_name: string;
  branch: string;
  status: string;
  lat: number | null;
  lng: number | null;

  _name: string;
  _branch: string;
  _status: StatusKey;
}

/* ───────────── Helpers ───────────── */

const STATUS_COLOR: Record<StatusKey, string> = {
  asg: "#e53935",
  asd: "#2e7d32",
  rem: "#757575",
  oth: "#6b8aa8",
};

function getStatus(s: string): StatusKey {
  if (!s) return "oth";
  const t = s.toUpperCase();
  if (t.startsWith("АСГ")) return "asg";
  if (t.startsWith("АСД")) return "asd";
  if (t.includes("РЕМ")) return "rem";
  return "oth";
}

/* ───────────── Component ───────────── */

export function FleetMap({
  isAdmin,
  externalFiles,
  onExternalFilesConsumed,
}: FleetMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<L.Map | null>(null);

  // 👇 FIX: any вместо MarkerClusterGroup
  const clusterRef = useRef<any>(null);

  const markersMap = useRef<Map<string, L.Layer>>(new Map());

  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | StatusKey>("all");

  const [selDate, setSelDate] = useState("");
  const [dates, setDates] = useState<string[]>([]);

  /* ───────────── INIT MAP ───────────── */

  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;

    const map = L.map(mapRef.current, {
      center: [60, 90],
      zoom: 3,
      zoomControl: false,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
    ).addTo(map);

    const cluster = (L as any).markerClusterGroup({
      maxClusterRadius: 40,
    });

    map.addLayer(cluster);

    mapObj.current = map;
    clusterRef.current = cluster;

    return () => {
      map.remove();
    };
  }, []);

  /* ───────────── LOAD DATES ───────────── */

  useEffect(() => {
    supabase
      .from("dpr_entries")
      .select("report_date")
      .order("report_date", { ascending: false })
      .then(({ data }) => {
        const unique = [...new Set((data || []).map((d: any) => d.report_date))];
        setDates(unique);
        if (unique.length > 0) setSelDate(unique[0]);
      });
  }, []);

  /* ───────────── LOAD DATA ───────────── */

  useEffect(() => {
    if (!selDate) return;

    supabase
      .from("dpr_entries")
      .select("*")
      .eq("report_date", selDate)
      .then(({ data }) => {
        const normalized: Vessel[] = (data || []).map((v: any) => ({
          ...v,
          _name: v.vessel_name.toLowerCase(),
          _branch: (v.branch || "").toLowerCase(),
          _status: getStatus(v.status),
        }));

        setVessels(normalized);
      });
  }, [selDate]);

  /* ───────────── FILTERED ───────────── */

  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    return vessels.filter((v) => {
      const matchSearch =
        !q || v._name.includes(q) || v._branch.includes(q);

      const matchFilter =
        filter === "all" || v._status === filter;

      return matchSearch && matchFilter;
    });
  }, [vessels, search, filter]);

  /* ───────────── MARKERS DIFF UPDATE ───────────── */

  useEffect(() => {
    if (!clusterRef.current) return;

    const existing = markersMap.current;
    const nextIds = new Set(filtered.map((v) => v.vessel_name));

    // REMOVE
    existing.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        clusterRef.current.removeLayer(marker);
        existing.delete(id);
      }
    });

    // ADD
    filtered.forEach((v) => {
      if (v.lat == null || v.lng == null) return;

      if (!existing.has(v.vessel_name)) {
        const marker = L.circleMarker([v.lat, v.lng], {
          radius: 6,
          color: STATUS_COLOR[v._status],
          weight: 2,
          fillOpacity: 0.8,
        });

        marker.bindTooltip(v.vessel_name);

        clusterRef.current.addLayer(marker);
        existing.set(v.vessel_name, marker);
      }
    });
  }, [filtered]);

  /* ───────────── BULK UPLOAD ───────────── */

  async function handleUpload(files: FileList) {
    const { vessels: parsed, date } = await parseMsgFiles(Array.from(files));

    if (!parsed.length || !date) return;

    const dateStr = date.toISOString().slice(0, 10);

    const rows = parsed.map((v: any) => ({
      vessel_name: v.name,
      report_date: dateStr,
      status: v.status,
      coord_raw: v.coordRaw,
      lat: v.lat,
      lng: v.lng,
    }));

    await supabase.from("dpr_entries").upsert(rows);
  }

  /* ───────────── EXTERNAL FILES ───────────── */

  useEffect(() => {
    if (externalFiles && isAdmin) {
      handleUpload(externalFiles);
      onExternalFilesConsumed?.();
    }
  }, [externalFiles, isAdmin, onExternalFilesConsumed]);

  /* ───────────── UI ───────────── */

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* SIDEBAR */}
      <div style={{ width: 260, padding: 10 }}>
        <select
          value={selDate}
          onChange={(e) => setSelDate(e.target.value)}
        >
          {dates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <input
          placeholder="Поиск..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", marginTop: 8 }}
        />

        <div style={{ marginTop: 8 }}>
          {(["all", "asg", "asd", "rem"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                marginRight: 4,
                background: filter === f ? "#1976d2" : "#eee",
                color: filter === f ? "#fff" : "#000",
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* MAP */}
      <div ref={mapRef} style={{ flex: 1 }} />
    </div>
  );
}
