import { useState, useEffect, useRef, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { supabase } from "../../lib/supabase";
import { parseMsgFiles, type DprRow } from "../../lib/parseDpr";
import { T, typeOrder } from "../../lib/types";
import { getType } from "../../lib/utils";
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

  // Load type maps from vessels table (case-insensitive)
  useEffect(() => {
    supabase.from("vessels").select("name").then(({ data }) => {
      if (data) {
        const t = new Map<string, string>();
        data.forEach((v: any) => {
          const originalName = v.name;
          const upperName = originalName.toUpperCase().trim();
          const typeStr = getType(originalName, typeOrder);
          
          if (typeStr) {
            // Сохраняем оригинальное название (с учётом регистра)
            t.set(originalName, typeStr);
            // Сохраняем в верхнем регистре
            t.set(upperName, typeStr);
            // Сохраняем без префикса (в верхнем регистре)
            const withoutPrefix = upperName.replace(/^(МФАСС|ТБС|ССН|МБС|МВС|МБ|НИС|АСС|БП)\s+/i, "").trim();
            if (withoutPrefix !== upperName) {
              t.set(withoutPrefix, typeStr);
            }
            // Сохраняем в нижнем регистре для поиска
            t.set(originalName.toLowerCase(), typeStr);
          }
        });
        setTypeMap(t);
      }
    });
  }, []);

  // ... остальной код без изменений ...
  
  // Функция для получения типа судна по имени
  const getVesselType = (vesselName: string): string => {
    const normalized = vesselName.toUpperCase().trim();
    // Прямое совпадение
    let type = typeMap.get(normalized);
    if (type) return type;
    
    // Без префикса
    const withoutPrefix = normalized.replace(/^(МФАСС|ТБС|ССН|МБС|МВС|МБ|НИС|АСС|БП)\s+/i, "").trim();
    type = typeMap.get(withoutPrefix);
    if (type) return type;
    
    // Поиск по части названия (если название судна короткое)
    for (const [key, val] of typeMap.entries()) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return val;
      }
    }
    
    return "";
  };

  // ... остальной код ...
  
  // Внутри рендера списка и попапа используйте getVesselType(v.vessel_name)