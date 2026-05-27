import { useState, useEffect } from "react";
import { T, type VesselDprMapRow } from "../../lib/types";
import type { DprSupply, DprRow } from "../../lib/parseDpr";
import { STATUS_HEADER_BG } from "./mapIcons";
import { extractLocation } from "../../lib/locationNormalizer";
import { formatVesselName, formatVesselType } from "../../lib/utils";
import { supabase } from "../../lib/supabase";

interface Props {
  vessel: DprRow;
  vesselType: string;
  canView: boolean;
  dataSource: "branches" | "vessels";
  onClose: () => void;
}


/* ── Статус → класс заголовка ── */
function cls(stat: string): "asg" | "asd" | "rem" | "oth" {
  if (!stat) return "oth";
  const s = stat.toUpperCase();
  if (s.startsWith("АСГ")) return "asg";
  if (s.startsWith("АСД")) return "asd";
  if (s.startsWith("РЕМ") || s.includes("РЕМОНТ") || s.includes("ОСВИДЕТ")) return "rem";
  return "oth";
}

const NO_RS_CLASS = ["артемис оффшор", "артемис"];

/* ── Погода: типы ── */
interface WeatherCurrent {
  temp: number;
  wind: number;
  windDir: number;
  wave: number | null;
}
interface WeatherHour {
  label: string;
  temp: number;
  wind: number;
  windDir: number;
  wave: number | null;
}

function deg2dir(deg: number): string {
  const dirs = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
  return dirs[Math.round(deg / 45) % 8];
}

function WindArrow({ deg }: { deg: number }) {
  return (
    <span
      style={{ display: "inline-block", transform: `rotate(${deg}deg)`, fontSize: 12, lineHeight: 1 }}
      title={`${Math.round(deg)}°`}
    >
      ↑
    </span>
  );
}

async function fetchWeather(
  lat: number,
  lng: number,
  signal: AbortSignal
): Promise<{ current: WeatherCurrent; forecast: WeatherHour[] } | null> {
  try {
    const [atmoRes, marineRes] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${lat}&longitude=${lng}` +
          `&current=temperature_2m,windspeed_10m,winddirection_10m` +
          `&hourly=temperature_2m,windspeed_10m,winddirection_10m` +
          `&forecast_days=3&timezone=auto`,
        { signal }
      ),
      fetch(
        `https://marine-api.open-meteo.com/v1/marine` +
          `?latitude=${lat}&longitude=${lng}` +
          `&current=wave_height` +
          `&hourly=wave_height` +
          `&forecast_days=3&timezone=auto`,
        { signal }
      ),
    ]);

    if (!atmoRes.ok) return null;
    const atmo = await atmoRes.json();
    const marine = marineRes.ok ? await marineRes.json() : null;

    const current: WeatherCurrent = {
      temp: atmo.current.temperature_2m,
      wind: atmo.current.windspeed_10m,
      windDir: atmo.current.winddirection_10m,
      wave: marine?.current?.wave_height ?? null,
    };

    const times: string[] = atmo.hourly.time;
    const temps: number[] = atmo.hourly.temperature_2m;
    const winds: number[] = atmo.hourly.windspeed_10m;
    const windDirs: number[] = atmo.hourly.winddirection_10m;
    const waves: (number | null)[] =
      marine?.hourly?.wave_height ?? new Array(times.length).fill(null);

    const nowMs = Date.now();
    let startIdx = 0;
    for (let i = 0; i < times.length; i++) {
      if (new Date(times[i]).getTime() >= nowMs) { startIdx = i; break; }
    }

    const forecast: WeatherHour[] = [];
    for (let step = 1; step <= 4; step++) {
      const idx = startIdx + step * 6;
      if (idx >= times.length) break;
      forecast.push({
        label: `+${step * 6}ч`,
        temp: temps[idx],
        wind: winds[idx],
        windDir: windDirs[idx],
        wave: waves[idx],
      });
    }

    return { current, forecast };
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════ */

export function VesselPopup({ vessel, vesselType, canView, dataSource, onClose }: Props) {
  const c = cls(vessel.status);
  const powerMatch = /(БЭП|СЭП)/i.exec(vessel.coord_raw || "");
  const power = powerMatch ? powerMatch[1].toUpperCase() : null;
  const powerText = power === "БЭП" ? "БЕРЕГОВОЕ" : power === "СЭП" ? "СУДОВОЕ" : null;
  const coordDisplay = extractLocation(vessel.coord_raw || "");
  const nameWithoutPrefix = vessel.vessel_name
    .replace(/^(мфасс|тбс|ссн|мбс|мвс|мб|нис|асс|скб)\s+/i, "")
    .trim();
  const formattedName = formatVesselName(nameWithoutPrefix);

  const hasCoords =
    typeof vessel.lat === "number" &&
    typeof vessel.lng === "number" &&
    vessel.lat !== 0 &&
    vessel.lng !== 0;

  const hasSupplies = !!(vessel.supplies && vessel.supplies.length > 0);
  const hasFieldsJson = dataSource === "vessels" && !!(vessel.fields_json && Object.keys(vessel.fields_json).length > 0);
  const hasDataTab = hasSupplies || hasFieldsJson;

  /* Вкладки: только для canView + есть координаты + есть данные */
  const showTabs = canView && hasCoords && hasDataTab;

  const [activeTab, setActiveTab] = useState<"data" | "weather">(
    hasDataTab ? "data" : "weather"
  );

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [specUrl, setSpecUrl] = useState<string | null>(null);
  const [imo, setImo] = useState<string>("");
  const [prevAmts, setPrevAmts] = useState<{
    fuel_dt_amt: number | null;
    fuel_tt_amt: number | null;
    oil_amt: number | null;
    water_amt: number | null;
  } | null>(null);

  const [weather, setWeather] = useState<{
    current: WeatherCurrent;
    forecast: WeatherHour[];
  } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  /* Загрузка данных судна */
  useEffect(() => {
    setPhotoUrl(null);
    setSpecUrl(null);
    setImo("");
    const fetchData = async () => {
      const { data: vData } = await supabase
        .from("vessels")
        .select("photo_url, imo")
        .ilike("name", `%${nameWithoutPrefix}`)
        .maybeSingle();
      if (vData?.photo_url) setPhotoUrl(vData.photo_url);
      if (vData?.imo) setImo(String(vData.imo));

      const { data: specs } = await supabase
        .from("vessel_specs")
        .select("project, spec_url")
        .ilike("vessel_name", nameWithoutPrefix)
        .maybeSingle();
      if (specs?.spec_url) {
        setSpecUrl(specs.spec_url);
      } else if (specs?.project) {
        const { data: u } = supabase.storage.from("specs").getPublicUrl(`${specs.project}.pdf`);
        setSpecUrl(u.publicUrl);
      }
    };
    fetchData();
  }, [nameWithoutPrefix]);

  /* Загрузка предыдущей ДПР для расчёта расхода */
  useEffect(() => {
    if (dataSource !== "vessels") return;
    setPrevAmts(null);
    const fetchPrev = async () => {
      const { data } = await supabase
        .from("vessel_dpr")
        .select("fuel_dt_amt, fuel_tt_amt, oil_amt, water_amt")
        .eq("vessel_name", vessel.vessel_name)
        .lt("report_date", vessel.report_date)
        .order("report_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      setPrevAmts(data ?? null);
    };
    fetchPrev();
  }, [vessel.vessel_name, vessel.report_date, dataSource]);

  /* Загрузка погоды */
  useEffect(() => {
    if (!hasCoords) return;
    setWeather(null);
    setWeatherLoading(true);
    const ctrl = new AbortController();
    fetchWeather(vessel.lat as number, vessel.lng as number, ctrl.signal).then((w) => {
      setWeather(w);
      setWeatherLoading(false);
    });
    return () => ctrl.abort();
  }, [vessel.lat, vessel.lng, hasCoords]);

  /* Сброс вкладки при смене судна */
  useEffect(() => {
    setActiveTab(hasDataTab ? "data" : "weather");
  }, [vessel.vessel_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const rsClassUrl =
    imo && !NO_RS_CLASS.some((ex) => vessel.vessel_name.toLowerCase().includes(ex))
      ? `https://rs-class.org/c/getves.php?imo=${imo}`
      : null;

  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "5px 0",
    borderBottom: `1px solid ${T.border}`,
    fontSize: 12,
  };

  /* ── Стили вкладок ── */
  function tabStyle(active: boolean): React.CSSProperties {
    return {
      flex: 1,
      padding: "6px 0",
      fontSize: 11,
      fontFamily: "monospace",
      fontWeight: 500,
      textAlign: "center",
      cursor: "pointer",
      border: "none",
      background: "none",
      borderBottom: active ? `2px solid ${T.accent}` : "2px solid transparent",
      color: active ? T.accent : T.text2,
      letterSpacing: 0.3,
    };
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        right: 14,
        bottom: "auto",
        width: 420,
        maxWidth: "calc(100vw - 40px)",
        maxHeight: "calc(100vh - 80px)",
        background: "#fff",
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        zIndex: 900,
        boxShadow: "0 12px 48px rgba(0,0,0,.15)",
        overflow: "auto",
      }}
    >
      {/* ── Заголовок ── */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          background: STATUS_HEADER_BG[c],
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
          {vesselType && (
            <span style={{ fontSize: 11, color: T.text, fontFamily: "monospace", fontWeight: 500, flexShrink: 0 }}>
              {formatVesselType(vesselType)}
            </span>
          )}
          {rsClassUrl ? (
            <a href={rsClassUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 16, fontWeight: 700, color: T.accent, textDecoration: "underline", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {formattedName}
            </a>
          ) : (
            <span style={{ fontSize: 16, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {formattedName}
            </span>
          )}
          {vessel.branch && (
            <span style={{ fontSize: 11, color: T.text, fontFamily: "monospace", fontWeight: 500, flexShrink: 0 }}>
              {vessel.branch}
            </span>
          )}
        </div>
        <button 
          onClick={onClose} 
          style={{ 
            background: "none", 
            border: "none", 
            color: T.text2, 
            cursor: "pointer", 
            fontSize: 22,
            lineHeight: 1, 
            flexShrink: 0,
            padding: "4px 8px",
            minWidth: 36,
            minHeight: 36,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          ✕
        </button>
      </div>

      {/* ── Фото ── */}
      {photoUrl && (
        <div style={{ padding: "8px 14px", borderBottom: `1px solid ${T.border}`, background: "#f8f9fa", textAlign: "center", position: "relative" }}>
          {specUrl ? (
            <a href={specUrl} target="_blank" rel="noopener noreferrer" title="Открыть спецификацию (PDF)">
              <img src={photoUrl} alt={formattedName}
                style={{ maxWidth: "100%", maxHeight: "180px", objectFit: "contain", borderRadius: 4, cursor: "pointer" }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
              />
              <div style={{ position: "absolute", bottom: 12, right: 18, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 4, pointerEvents: "none" }}>
                📄 Спецификация
              </div>
            </a>
          ) : (
            <img src={photoUrl} alt={formattedName}
              style={{ maxWidth: "100%", maxHeight: "180px", objectFit: "contain", borderRadius: 4 }}
            />
          )}
        </div>
      )}

      {/* ── Тело ── */}
      <div style={{ padding: "12px 14px" }}>

        {/* Местоположение */}
        <div style={rowStyle}>
          <span style={{ color: T.text2 }}>Местоположение</span>
          <span style={{ color: T.text, textAlign: "right", fontFamily: "monospace", fontSize: 10, maxWidth: 250 }}>
            {(canView ? coordDisplay : coordDisplay.replace(/,.*$/, "").trim()) || "—"}
          </span>
        </div>

        {canView && (
          <>
            {/* Примечание */}
            {vessel.note && (
              <div style={rowStyle}>
                <span style={{ color: T.text2 }}>Примечание</span>
                <span style={{ color: T.text, textAlign: "right", fontSize: 11, maxWidth: 250 }}>{vessel.note}</span>
              </div>
            )}

            {/* ── vessel_dpr: время сообщения ── */}
            {dataSource === "vessels" && (vessel as VesselDprMapRow).msg_time && (
              <div style={rowStyle}>
                <span style={{ color: T.text2 }}>Время сообщения</span>
                <span style={{ color: T.text, textAlign: "right", fontFamily: "monospace", fontSize: 11 }}>
                  {new Date((vessel as VesselDprMapRow).msg_time!).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}
                </span>
              </div>
            )}

            {/* ── vessel_dpr: запасы из новых колонок ── */}
            {dataSource === "vessels" && (() => {
              const vr = vessel as VesselDprMapRow;
              const hasSupplies = vr.fuel_dt_amt != null || vr.fuel_tt_amt != null || vr.oil_amt != null || vr.water_amt != null;
              if (!hasSupplies) return null;

              const calcCons = (curr: number | null, prev: number | null): { text: string; received: boolean } => {
                if (curr === null || prev === null) return { text: "—", received: false };
                const delta = prev - curr;
                if (delta < 0) return { text: `+${(-delta).toFixed(2)}`, received: true }; // получено
                return { text: delta.toFixed(2), received: false }; // израсходовано
              };

              const rows: [string, number | null, number | null, number | null][] = [
                ["ДТ",    vr.fuel_dt_amt, prevAmts?.fuel_dt_amt ?? null, vr.fuel_dt_cons ?? null],
                ["ТТ",    vr.fuel_tt_amt, prevAmts?.fuel_tt_amt ?? null, vr.fuel_tt_cons ?? null],
                ["Масло", vr.oil_amt,     prevAmts?.oil_amt ?? null,     vr.oil_cons ?? null],
                ["Вода",  vr.water_amt,   prevAmts?.water_amt ?? null,   vr.water_cons ?? null],
              ];

              return (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, color: T.text2, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "monospace", marginBottom: 4 }}>Запасы</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ color: T.text2, fontWeight: "normal", textAlign: "left", padding: "3px 4px", borderBottom: `1px solid ${T.border}`, fontFamily: "monospace" }}></th>
                        <th style={{ color: T.text2, fontWeight: "normal", textAlign: "right", padding: "3px 4px", borderBottom: `1px solid ${T.border}`, fontFamily: "monospace" }}>Остаток</th>
                        <th style={{ color: T.text2, fontWeight: "normal", textAlign: "right", padding: "3px 4px", borderBottom: `1px solid ${T.border}`, fontFamily: "monospace" }}>Δ</th>
                        <th style={{ color: T.text2, fontWeight: "normal", textAlign: "right", padding: "3px 4px", borderBottom: `1px solid ${T.border}`, fontFamily: "monospace" }}>ДПР</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.filter(([, amt]) => amt != null).map(([label, amt, prevAmt, dbCons]) => {
                        const cons = calcCons(amt, prevAmt);
                        const dbConsText = dbCons != null ? dbCons.toFixed(2) : "—";
                        return (
                          <tr key={label}>
                            <td style={{ padding: "3px 4px", borderBottom: `1px solid ${T.border}`, color: T.text, fontFamily: "monospace", fontSize: 10 }}>{label}</td>
                            <td style={{ padding: "3px 4px", borderBottom: `1px solid ${T.border}`, color: T.accent, fontWeight: 600, fontFamily: "monospace", textAlign: "right" }}>{amt != null ? amt : "—"}</td>
                            <td style={{ padding: "3px 4px", borderBottom: `1px solid ${T.border}`, color: cons.received ? "#1565C0" : "#c07800", fontFamily: "monospace", textAlign: "right" }}>{cons.text}</td>
                            <td style={{ padding: "3px 4px", borderBottom: `1px solid ${T.border}`, color: "#c07800", fontFamily: "monospace", textAlign: "right", opacity: 0.7 }}>{dbConsText}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* ── vessel_dpr: МОРЕ — курс, скорость, мили, ETA ── */}
            {dataSource === "vessels" && vessel.status === "МОРЕ" && (() => {
              const vr = vessel as VesselDprMapRow;
              const hasNav = vr.course != null || vr.speed_current != null || vr.distance_day != null || vr.eta_place;
              if (!hasNav) return null;
              return (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, color: T.text2, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "monospace", marginBottom: 4 }}>Навигация</div>
                  {vr.course != null && (
                    <div style={rowStyle}>
                      <span style={{ color: T.text2 }}>Курс</span>
                      <span style={{ color: T.text, fontFamily: "monospace", fontSize: 11 }}>{vr.course}°</span>
                    </div>
                  )}
                  {vr.speed_current != null && (
                    <div style={rowStyle}>
                      <span style={{ color: T.text2 }}>Скорость</span>
                      <span style={{ color: T.text, fontFamily: "monospace", fontSize: 11 }}>{vr.speed_current} уз</span>
                    </div>
                  )}
                  {vr.distance_day != null && (
                    <div style={rowStyle}>
                      <span style={{ color: T.text2 }}>Миль за сутки</span>
                      <span style={{ color: T.text, fontFamily: "monospace", fontSize: 11 }}>{vr.distance_day}</span>
                    </div>
                  )}
                  {vr.eta_place && (
                    <div style={rowStyle}>
                      <span style={{ color: T.text2 }}>ETA</span>
                      <span style={{ color: T.text, fontFamily: "monospace", fontSize: 11 }}>
                        {vr.eta_place}{vr.eta_date ? ` (${vr.eta_date})` : ""}
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── vessel_dpr: ПОРТ — питание, статус ── */}
            {dataSource === "vessels" && vessel.status === "ПОРТ" && (() => {
              const vr = vessel as VesselDprMapRow;
              const hasPort = vr.power_source || vr.port_status;
              if (!hasPort) return null;
              return (
                <div style={{ marginTop: 6 }}>
                  {vr.power_source && (
                    <div style={rowStyle}>
                      <span style={{ color: T.text2 }}>Электропитание</span>
                      <span style={{ color: T.text, fontFamily: "monospace", fontSize: 11 }}>{vr.power_source}</span>
                    </div>
                  )}
                  {vr.port_status && (
                    <div style={rowStyle}>
                      <span style={{ color: T.text2 }}>Статус порта</span>
                      <span style={{ color: T.text, fontSize: 11, maxWidth: 250 }}>{vr.port_status}</span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Переключатель вкладок (только если есть координаты) ── */}
            {showTabs && (
              <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, marginTop: 10 }}>
                {hasDataTab && (
                  <button style={tabStyle(activeTab === "data")} onClick={() => setActiveTab("data")}>
                    {dataSource === "vessels"
                      ? `📋 ДПР ${(vessel as VesselDprMapRow).dpr_type || vessel.status || ''}`
                      : "📦 ЗАПАСЫ"}
                  </button>
                )}
                <button style={tabStyle(activeTab === "weather")} onClick={() => setActiveTab("weather")}>
                  🌤 ПОГОДА
                </button>
              </div>
            )}

            {/* ── Содержимое: Запасы (для ДПР филиалов) ── */}
            {(!showTabs || activeTab === "data") && hasSupplies && dataSource === "branches" && (
              <div style={{ marginTop: showTabs ? 8 : 0 }}>
                {/* Заголовок секции — только когда нет вкладок */}
                {!showTabs && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0 4px" }}>
                    <span style={{ fontSize: 10, color: T.text2, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "monospace" }}>Запасы</span>
                    {powerText && <span style={{ fontSize: 10, color: T.text2 }}>Электропитание: <b>{powerText}</b></span>}
                  </div>
                )}
                {showTabs && powerText && (
                  <div style={{ fontSize: 10, color: T.text2, marginBottom: 6, textAlign: "right" }}>
                    Электропитание: <b>{powerText}</b>
                  </div>
                )}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      {["Вид", "Остаток", "%", "Расход", "До"].map((h) => (
                        <th key={h} style={{ color: T.text2, fontWeight: "normal", textAlign: "left", padding: "3px 4px", borderBottom: `1px solid ${T.border}`, fontFamily: "monospace" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(vessel.supplies as DprSupply[]).map((s, i) => (
                      <tr key={i}>
                        <td style={{ padding: "4px 4px", borderBottom: `1px solid ${T.border}` }}>
                          {s.type === "Топливо ДТ" ? "ДТ" : s.type === "Топливо ТТ" ? "ТТ" : s.type}
                        </td>
                        <td style={{ padding: "4px 4px", borderBottom: `1px solid ${T.border}`, color: T.accent, fontWeight: 600, fontFamily: "monospace" }}>{s.amt}</td>
                        <td style={{ padding: "4px 4px", borderBottom: `1px solid ${T.border}`, color: T.text2, fontFamily: "monospace" }}>
                          {(() => {
                            const p = parseFloat((s.pct || "").replace(",", "."));
                            if (isNaN(p)) return "—";
                            return (p > 100 ? p / 1000 : p).toFixed(1) + "%";
                          })()}
                         </td>
                        <td style={{ padding: "4px 4px", borderBottom: `1px solid ${T.border}`, color: "#c07800", fontFamily: "monospace" }}>{s.cons}</td>
                        <td style={{ padding: "4px 4px", borderBottom: `1px solid ${T.border}`, fontSize: 10, fontFamily: "monospace" }}>{s.lim || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Содержимое: Поля ДПР (для ДПР судов) ── */}
            {(!showTabs || activeTab === "data") && hasFieldsJson && dataSource === "vessels" && (() => {
              const DPR_FIELD_NAMES_SEA: Record<string, string> = {
                "1": "Название судна",
                "2": "Состояние (АСГ/АСД/переход)",
                "3": "Дата и время",
                "4": "Местоположение",
                "5": "Запасы",
                "6": "Погода",
                "7": "Курс / скорость / мили",
                "8": "Бюджет времени",
                "9": "Время работы механизмов",
                "10": "Экипаж",
                "11": "ETA",
                "12": "Сроки запасов",
                "13": "Пополнение запасов",
                "14": "Доп. информация",
                "_note": "Примечание",
              };
              const DPR_FIELD_NAMES_PORT: Record<string, string> = {
                "1": "Название судна",
                "2": "Состояние (АСГ/АСД/ремонт)",
                "3": "Дата и время",
                "4": "Местоположение (порт/причал)",
                "5": "Запасы",
                "6": "Погода",
                "7": "Задача / задание",
                "8": "Плановая работа",
                "9": "Готовность / состояние мех.",
                "10": "Экипаж",
                "_note": "Примечание",
              };

              const vr = vessel as VesselDprMapRow;
              const dprType = vr.dpr_type || vessel.status;
              const isPort = dprType === "ПОРТ";
              const fieldNames = isPort ? DPR_FIELD_NAMES_PORT : DPR_FIELD_NAMES_SEA;

              // Нормализатор поля 4 — убирает префиксы "п. ", "порт ", "г. "
              function normalizeLocation(loc: string): string {
                return loc.replace(/^(п\.\s*порт\s+|порт\s+|г\.\s+|п\.\s+)/i, '').trim();
              }

              return (
                <div style={{ marginTop: showTabs ? 8 : 0 }}>
                  {!showTabs && (
                    <div style={{ margin: "10px 0 4px" }}>
                      <span style={{ fontSize: 10, color: T.text2, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "monospace" }}>
                        📋 ДПР {dprType || ''}
                      </span>
                    </div>
                  )}
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <tbody>
                      {Array.from({ length: isPort ? 10 : 14 }, (_, i) => String(i + 1)).map((key) => {
                        const rawValue = vessel.fields_json![key];
                        const hasValue = rawValue && rawValue.trim();
                        const displayValue = hasValue
                          ? (key === "4" ? normalizeLocation(rawValue) : rawValue)
                          : null;
                        return (
                          <tr key={key} title={fieldNames[key] || undefined}
                              style={{ cursor: "default" }}>
                            <td style={{ padding: "4px 4px", borderBottom: `1px solid ${T.border}`, color: hasValue ? T.text : T.text2, fontSize: 11, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                              <span style={{ color: T.text2, fontFamily: "monospace", fontSize: 9, marginRight: 6 }}>П.{key}</span>
                              {displayValue ?? <em style={{ opacity: 0.5 }}>Нет информации</em>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* ── Содержимое: Погода ── */}
            {showTabs && activeTab === "weather" && (
              <div style={{ paddingTop: 10 }}>
                {weatherLoading && (
                  <div style={{ fontSize: 11, color: T.text2, fontFamily: "monospace" }}>Загрузка…</div>
                )}
                {!weatherLoading && !weather && (
                  <div style={{ fontSize: 11, color: T.text2, fontFamily: "monospace" }}>Нет данных</div>
                )}
                {weather && (
                  <>
                    {/* Текущие условия: три плашки */}
                    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 auto", background: "#f0f4ff", borderRadius: 6, padding: "6px 8px", textAlign: "center", minWidth: 70 }}>
                        <div style={{ fontSize: 9, color: T.text2, fontFamily: "monospace", marginBottom: 3 }}>🌡 воздух</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, fontFamily: "monospace" }}>
                          {weather.current.temp > 0 ? "+" : ""}{Math.round(weather.current.temp)}°
                        </div>
                      </div>
                      <div style={{ flex: "1 1 auto", background: "#f0f7f0", borderRadius: 6, padding: "6px 8px", textAlign: "center", minWidth: 90 }}>
                        <div style={{ fontSize: 9, color: T.text2, fontFamily: "monospace", marginBottom: 3 }}>💨 ветер</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: "monospace", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          <WindArrow deg={weather.current.windDir} />
                          {Math.round(weather.current.wind)}&thinsp;м/с
                          <span style={{ fontSize: 10, fontWeight: 400 }}>{deg2dir(weather.current.windDir)}</span>
                        </div>
                      </div>
                      {weather.current.wave !== null && (
                        <div style={{ flex: "1 1 auto", background: "#edf6ff", borderRadius: 6, padding: "6px 8px", textAlign: "center", minWidth: 70 }}>
                          <div style={{ fontSize: 9, color: T.text2, fontFamily: "monospace", marginBottom: 3 }}>🌊 волна</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: T.text, fontFamily: "monospace" }}>
                            {weather.current.wave.toFixed(1)}&thinsp;м
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Прогноз +6..+24ч */}
                    {weather.forecast.length > 0 && (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead>
                          <tr>
                            {["", "°C", "м/с", ...(weather.current.wave !== null ? ["волна"] : [])].map((h) => (
                              <th key={h} style={{ color: T.text2, fontWeight: "normal", textAlign: h === "" ? "left" : "right", padding: "2px 4px", borderBottom: `1px solid ${T.border}`, fontFamily: "monospace", fontSize: 10 }}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {weather.forecast.map((row) => (
                            <tr key={row.label}>
                              <td style={{ padding: "3px 4px", borderBottom: `1px solid ${T.border}`, fontFamily: "monospace", color: T.text2, fontSize: 10 }}>
                                {row.label}
                               </td>
                              <td style={{ padding: "3px 4px", borderBottom: `1px solid ${T.border}`, fontFamily: "monospace", textAlign: "right" }}>
                                {row.temp > 0 ? "+" : ""}{Math.round(row.temp)}°
                               </td>
                              <td style={{ padding: "3px 4px", borderBottom: `1px solid ${T.border}`, fontFamily: "monospace", textAlign: "right" }}>
                                <WindArrow deg={row.windDir} />&nbsp;{Math.round(row.wind)}&nbsp;
                                <span style={{ fontSize: 9, color: T.text2 }}>{deg2dir(row.windDir)}</span>
                               </td>
                              {weather.current.wave !== null && (
                                <td style={{ padding: "3px 4px", borderBottom: `1px solid ${T.border}`, fontFamily: "monospace", textAlign: "right", color: T.accent }}>
                                  {row.wave !== null ? `${row.wave.toFixed(1)}м` : "—"}
                                 </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
