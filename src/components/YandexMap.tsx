import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { parseMsgFiles, type DprRow } from "../lib/parseDpr";
import { T, typeOrder } from "../lib/types";
import { getType } from "../lib/utils";
import { Sidebar } from "./FleetMap/Sidebar";
import { VesselPopup } from "./FleetMap/VesselPopup";

const YANDEX_API_KEY = "46fed8f6-b697-4a1b-b2e6-3f34572937b1";

declare global {
  interface Window {
    ymaps: any;
  }
}

// Статусы и цвета для маркеров
const STATUS_COLORS: Record<string, string> = {
  asg: "#e53935", // красный
  asd: "#2e7d32", // зелёный
  rem: "#757575", // серый
  oth: "#6b8aa8", // синий
};

function cls(stat: string): "asg" | "asd" | "rem" | "oth" {
  if (!stat) return "oth";
  const s = stat.toUpperCase();
  if (s.startsWith("АСГ")) return "asg";
  if (s.startsWith("АСД")) return "asd";
  if (s.startsWith("РЕМ") || s.includes("РЕМОНТ") || s.includes("ОСВИДЕТ")) return "rem";
  return "oth";
}

// Загружаем скрипт Яндекс.Карт
function loadYandexMaps(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.ymaps) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_API_KEY}&lang=ru_RU`;
    script.onload = () => {
      window.ymaps.ready(resolve);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export function YandexMap({
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
  const mapInstance = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const placemarksRef = useRef<any[]>([]);

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
  const [mapsReady, setMapsReady] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Загружаем Яндекс.Карты
  useEffect(() => {
    loadYandexMaps()
      .then(() => setMapsReady(true))
      .catch((err) => console.error("Ошибка загрузки Яндекс.Карт:", err));
  }, []);

  // Загрузка типов судов
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
            if (short !== full) {
              t.set(short, typeStr);
            }
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
    const onEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current++;
      setDragging(true);
    };
    const onLeave = () => {
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setDragging(false);
      }
    };
    const onOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setDragging(false);
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
    loadDates();
  }, []);

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

      if (!parsed.length) {
        setUploadMsg("⚠ Данные не найдены");
        setUploading(false);
        return;
      }
      if (!date) {
        setUploadMsg("⚠ Дата не определена");
        setUploading(false);
        return;
      }

      const dateStr = date.toISOString().slice(0, 10);
      setUploadMsg(`Найдено ${parsed.length} судов за ${dateStr}, сохраняю...`);

      let ok = 0,
        fail = 0;
      for (const v of parsed) {
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
          contract_info: v.contract_info || null,
          work_period: v.work_period || null,
        };
        const { error } = await supabase.from("dpr_entries").upsert(row, { onConflict: "vessel_name,report_date" });
        if (error) {
          fail++;
          console.error(v.name, error);
        } else ok++;
      }

      setUploadMsg(`✓ Загружено: ${ok} судов${fail ? `, ошибок: ${fail}` : ""}`);
      await loadDates();
      setSelDate(dateStr);
    } catch (e: any) {
      setUploadMsg("Ошибка: " + (e?.message || e));
    }
    setUploading(false);
  }

  const getVesselType = (vesselName: string): string => {
    const normalized = vesselName.toUpperCase().trim();
    let type = typeMap.get(normalized);
    if (type) return type;
    const withoutPrefix = normalized.replace(/^(МФАСС|ТБС|ССН|МБС|МВС|МБ|НИС|АСС|БП)\s+/i, "").trim();
    type = typeMap.get(withoutPrefix);
    if (type) return type;
    for (const [key, val] of typeMap.entries()) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return val;
      }
    }
    return "";
  };

  const allTypes = useMemo(() => {
    const types = new Set<string>();
    vessels.forEach((v) => {
      const t = getVesselType(v.vessel_name);
      if (t) types.add(t);
    });
    return ["Все", ...Array.from(types).sort()];
  }, [vessels, getVesselType]);

  const allBranches = useMemo(() => {
    const branches = new Set<string>();
    vessels.forEach((v) => {
      if (v.branch) branches.add(v.branch);
    });
    return ["Все", ...Array.from(branches).sort()];
  }, [vessels]);

  const allStatuses = ["Все", "АСГ", "АСД", "РЕМ"];

  const filtered = useMemo(() => {
    return vessels.filter((v) => {
      const typeOk = filterType === "Все" || getVesselType(v.vessel_name) === filterType;
      const branchOk = filterBranch === "Все" || v.branch === filterBranch;
      const statusOk = filterStatus === "Все" || cls(v.status) === (filterStatus === "АСГ" ? "asg" : filterStatus === "АСД" ? "asd" : "rem");
      return typeOk && branchOk && statusOk;
    });
  }, [vessels, filterType, filterBranch, filterStatus, getVesselType]);

  const searchFiltered = useMemo(() => {
    return filtered.filter((v) => !search || v.vessel_name.toLowerCase().includes(search.toLowerCase()));
  }, [filtered, search]);

  // Инициализация карты
  useEffect(() => {
    if (!mapsReady || !mapRef.current || mapInstance.current) return;

    const map = new window.ymaps.Map(mapRef.current, {
      center: [62, 90],
      zoom: 3,
      controls: ["zoomControl", "fullscreenControl"],
    });

    // Кластеризатор
    const clusterer = new window.ymaps.Clusterer({
      preset: "islands#invertedVioletClusterIcons",
      groupByCoordinates: false,
      clusterDisableClickZoom: false,
      clusterHideIconOnBalloonOpen: true,
      geoObjectHideIconOnBalloonOpen: false,
    });

    map.geoObjects.add(clusterer);
    mapInstance.current = map;
    clustererRef.current = clusterer;

    return () => {
      if (mapInstance.current) {
        mapInstance.current.destroy();
        mapInstance.current = null;
      }
    };
  }, [mapsReady]);

  // Обновление маркеров при изменении фильтров
  useEffect(() => {
    if (!mapsReady || !mapInstance.current || !clustererRef.current) return;

    // Удаляем старые маркеры
    clustererRef.current.removeAll();

    const newPlacemarks: any[] = [];

    filtered.forEach((v) => {
      if (v.lat == null || v.lng == null) return;

      const status = cls(v.status);
      const color = STATUS_COLORS[status];
      const vesselType = getVesselType(v.vessel_name);

      // Создаём метку
      const placemark = new window.ymaps.Placemark(
        [v.lat, v.lng],
        {
          balloonContentHeader: `
            <div style="font-weight:bold; font-size:14px; margin-bottom:5px;">
              ${vesselType ? `<span style="color:#666">${vesselType}</span> ` : ""}${v.vessel_name}
            </div>
            <div style="color:#888; font-size:12px;">${v.branch || ""}</div>
          `,
          balloonContentBody: `
            <div style="margin-top:8px;">
              <div><strong>Статус:</strong> ${v.status}</div>
              <div><strong>Местоположение:</strong> ${(v.coord_raw || "").replace(/\s*(БЭП|СЭП)\s*$/i, "").trim() || "—"}</div>
              ${v.note ? `<div><strong>Примечание:</strong> ${v.note}</div>` : ""}
            </div>
          `,
          balloonContentFooter: `<button onclick="window.selectVessel(${v.id})" style="margin-top:8px; padding:4px 12px; background:#1e40af; color:#fff; border:none; border-radius:4px; cursor:pointer;">Подробнее</button>`,
        },
        {
          preset: "islands#circleIcon",
          iconColor: color,
          draggable: false,
          balloonCloseButton: true,
          hideIconOnBalloonOpen: false,
        }
      );

      // Сохраняем id судна в метку для обработчика
      (placemark as any).vesselId = v.id;
      (placemark as any).vesselData = v;

      placemark.events.add("click", () => {
        setSelVessel(v);
        if (isMobile) setSidebarOpen(false);
      });

      newPlacemarks.push(placemark);
    });

    clustererRef.current.add(newPlacemarks);
    placemarksRef.current = newPlacemarks;

    // Центрируем карту по маркерам
    if (newPlacemarks.length > 0) {
      const bounds = clustererRef.current.getBounds();
      if (bounds) {
        mapInstance.current.setBounds(bounds, { checkZoomRange: true, zoomMargin: 50 });
      }
    }
  }, [filtered, mapsReady, getVesselType, isMobile]);

  const cAsg = filtered.filter((v) => cls(v.status) === "asg").length;
  const cAsd = filtered.filter((v) => cls(v.status) === "asd").length;
  const cRem = filtered.filter((v) => cls(v.status) === "rem").length;
  const noPos = filtered.filter((v) => v.lat == null).length;

  const showSidebar = isMobile ? sidebarOpen : true;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 90px)", gap: 0, overflow: "hidden", position: "relative", zIndex: 0 }}>
      {dragging && isAdmin && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9000,
            background: "rgba(11,15,24,0.85)",
            border: "3px dashed #3b82f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 16,
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 52 }}>📂</div>
          <div style={{ fontSize: 18, color: "#3b82f6", fontFamily: "monospace", fontWeight: 600 }}>Отпустите файлы ДПР</div>
          <div style={{ fontSize: 13, color: "#9ca3af" }}>Поддерживаются .msg и .eml файлы от всех филиалов</div>
        </div>
      )}

      {isMobile && !sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 800,
            width: 40,
            height: 40,
            borderRadius: 8,
            background: "#fff",
            border: `1px solid ${T.border}`,
            boxShadow: "0 2px 8px rgba(0,0,0,.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            cursor: "pointer",
            color: T.text,
          }}
        >
          ☰
        </button>
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
            if (v.lat != null && v.lng != null && mapInstance.current) {
              mapInstance.current.setCenter([v.lat, v.lng], 10);
            }
          }}
          isMobile={isMobile}
          onCloseSidebar={() => setSidebarOpen(false)}
          sidebarOpen={sidebarOpen}
        />
      )}

      <div style={{ flex: 1, position: "relative" }}>
        <div ref={mapRef} style={{ width: "100%", height: "100%" }} />

        {!mapsReady && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              textAlign: "center",
              background: "#fff",
              padding: "20px",
              borderRadius: 8,
              boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
              zIndex: 500,
            }}
          >
            <div style={{ fontSize: 16, color: T.text2 }}>Загрузка карты...</div>
          </div>
        )}

        {dates.length === 0 && !loading && mapsReady && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              textAlign: "center",
              pointerEvents: "none",
              zIndex: 500,
            }}
          >
            <div style={{ fontSize: 16, color: T.text2, fontWeight: 500, marginBottom: 6 }}>
              {isAdmin ? "Загрузите файлы ДПР" : "Данные ДПР не загружены"}
            </div>
            {isAdmin && (
              <div style={{ fontSize: 12, color: T.text2 }}>
                Используйте кнопку «Загрузить .msg» в шапке или перетащите файлы на страницу
              </div>
            )}
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
    </div>
  );
}
