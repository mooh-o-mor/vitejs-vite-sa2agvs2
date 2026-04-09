import { useState, useEffect } from "react";
import { T } from "../../lib/types";
import type { DprSupply, DprRow } from "../../lib/parseDpr";
import { STATUS_HEADER_BG } from "./mapIcons";
import { extractLocation } from "../../lib/locationNormalizer";
import { formatVesselName, formatVesselType } from "../../lib/utils";
import { supabase } from "../../lib/supabase";

interface Props {
  vessel: DprRow;
  vesselType: string;
  canView: boolean;
  onClose: () => void;
}

/* ── Статус → CSS-класс заголовка ── */
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
  label: string; // "+6ч", "+12ч" …
  temp: number;
  wind: number;
  windDir: number;
  wave: number | null;
}

/* ── Градусы → русская сторона света ── */
function deg2dir(deg: number): string {
  const dirs = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
  return dirs[Math.round(deg / 45) % 8];
}

/* ── Стрелка направления ветра ── */
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

/* ── Загрузить погоду ── */
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

    const waveNow: number | null = marine?.current?.wave_height ?? null;

    const current: WeatherCurrent = {
      temp: atmo.current.temperature_2m,
      wind: atmo.current.windspeed_10m,
      windDir: atmo.current.winddirection_10m,
      wave: waveNow,
    };

    /* Прогноз: берём ближайший текущий час + следующие слоты каждые 6 часов */
    const times: string[] = atmo.hourly.time;
    const temps: number[] = atmo.hourly.temperature_2m;
    const winds: number[] = atmo.hourly.windspeed_10m;
    const windDirs: number[] = atmo.hourly.winddirection_10m;
    const waves: (number | null)[] = marine?.hourly?.wave_height ?? new Array(times.length).fill(null);

    const nowMs = Date.now();

    /* Найти индекс текущего часа */
    let startIdx = 0;
    for (let i = 0; i < times.length; i++) {
      if (new Date(times[i]).getTime() >= nowMs) {
        startIdx = i;
        break;
      }
    }

    /* Снимки каждые 6 часов, 4 шага = 24 часа */
    const forecast: WeatherHour[] = [];
    for (let step = 1; step <= 4; step++) {
      const idx = startIdx + step * 6;
      if (idx >= times.length) break;
      const hours = step * 6;
      forecast.push({
        label: `+${hours}ч`,
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

export function VesselPopup({ vessel, vesselType, canView, onClose }: Props) {
  const c = cls(vessel.status);
  const powerMatch = /(БЭП|СЭП)/i.exec(vessel.coord_raw || "");
  const power = powerMatch ? powerMatch[1].toUpperCase() : null;
  const powerText = power === "БЭП" ? "БЕРЕГОВОЕ" : power === "СЭП" ? "СУДОВОЕ" : null;
  const coordDisplay = extractLocation(vessel.coord_raw || "");
  const nameWithoutPrefix = vessel.vessel_name
    .replace(/^(мфасс|тбс|ссн|мбс|мвс|мб|нис|асс|скб)\s+/i, "")
    .trim();
  const formattedName = formatVesselName(nameWithoutPrefix);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [specUrl, setSpecUrl] = useState<string | null>(null);
  const [imo, setImo] = useState<string>("");

  /* ── Погода ── */
  const hasCoords =
    typeof vessel.lat === "number" &&
    typeof vessel.lng === "number" &&
    vessel.lat !== 0 &&
    vessel.lng !== 0;

  const [weather, setWeather] = useState<{
    current: WeatherCurrent;
    forecast: WeatherHour[];
  } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  /* ── Загрузка данных судна ── */
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

  /* ── Загрузка погоды ── */
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

  const rsClassUrl =
    imo && !NO_RS_CLASS.some((ex) => vessel.vessel_name.toLowerCase().includes(ex))
      ? `https://rs-class.org/c/getves.php?imo=${imo}`
      : null;

  /* ── Стиль ячейки строки данных ── */
  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "5px 0",
    borderBottom: `1px solid ${T.border}`,
    fontSize: 12,
  };

  return (
    <div
      style={{
        position: "absolute",
        right: 14,
        bottom: 36,
        width: 420,
        maxWidth: "calc(100vw - 40px)",
        background: "#fff",
        border: `1px solid ${T.border}`,
        borderRadius: 8,
        zIndex: 900,
        boxShadow: "0 12px 48px rgba(0,0,0,.15)",
        overflow: "hidden",
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
          flexWrap: "nowrap",
          gap: 8,
          background: STATUS_HEADER_BG[c],
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "nowrap",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
          }}
        >
          {vesselType && (
            <span
              style={{
                fontSize: 11,
                color: T.text,
                fontFamily: "monospace",
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              {formatVesselType(vesselType)}
            </span>
          )}
          {rsClassUrl ? (
            <a
              href={rsClassUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: T.accent,
                textDecoration: "underline",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {formattedName}
            </a>
          ) : (
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: T.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {formattedName}
            </span>
          )}
          {vessel.branch && (
            <span
              style={{
                fontSize: 11,
                color: T.text,
                fontFamily: "monospace",
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
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
            fontSize: 18,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {/* ── Фото ── */}
      {photoUrl && (
        <div
          style={{
            padding: "8px 14px",
            borderBottom: `1px solid ${T.border}`,
            background: "#f8f9fa",
            textAlign: "center",
            position: "relative",
          }}
        >
          {specUrl ? (
            <a href={specUrl} target="_blank" rel="noopener noreferrer" title="Открыть спецификацию (PDF)">
              <img
                src={photoUrl}
                alt={formattedName}
                style={{
                  maxWidth: "100%",
                  maxHeight: "180px",
                  objectFit: "contain",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: 12,
                  right: 18,
                  background: "rgba(0,0,0,0.55)",
                  color: "#fff",
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 4,
                  pointerEvents: "none",
                }}
              >
                📄 Спецификация
              </div>
            </a>
          ) : (
            <img
              src={photoUrl}
              alt={formattedName}
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
          <span
            style={{
              color: T.text,
              textAlign: "right",
              fontFamily: "monospace",
              fontSize: 10,
              maxWidth: 250,
            }}
          >
            {(canView ? coordDisplay : coordDisplay.replace(/,.*$/, "").trim()) || "—"}
          </span>
        </div>

        {canView && (
          <>
            {/* Примечание */}
            {vessel.note && (
              <div style={rowStyle}>
                <span style={{ color: T.text2 }}>Примечание</span>
                <span style={{ color: T.text, textAlign: "right", fontSize: 11, maxWidth: 250 }}>
                  {vessel.note}
                </span>
              </div>
            )}

            {/* ── Блок погоды ── */}
            {hasCoords && (
              <div style={{ marginTop: 10 }}>
                {/* Заголовок секции */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: T.text2,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      fontFamily: "monospace",
                    }}
                  >
                    Погода
                  </span>
                  {weather && (
                    <span style={{ fontSize: 9, color: T.text2, fontFamily: "monospace" }}>
                      Open-Meteo
                    </span>
                  )}
                </div>

                {weatherLoading && (
                  <div
                    style={{
                      fontSize: 11,
                      color: T.text2,
                      fontFamily: "monospace",
                      paddingBottom: 6,
                    }}
                  >
                    Загрузка…
                  </div>
                )}

                {weather && !weatherLoading && (
                  <>
                    {/* Текущие условия */}
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        marginBottom: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      {/* Температура */}
                      <div
                        style={{
                          flex: "1 1 auto",
                          background: "#f0f4ff",
                          borderRadius: 6,
                          padding: "5px 8px",
                          textAlign: "center",
                          minWidth: 70,
                        }}
                      >
                        <div style={{ fontSize: 9, color: T.text2, fontFamily: "monospace", marginBottom: 2 }}>
                          🌡 воздух
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: "monospace" }}>
                          {weather.current.temp > 0 ? "+" : ""}
                          {Math.round(weather.current.temp)}°
                        </div>
                      </div>

                      {/* Ветер */}
                      <div
                        style={{
                          flex: "1 1 auto",
                          background: "#f0f7f0",
                          borderRadius: 6,
                          padding: "5px 8px",
                          textAlign: "center",
                          minWidth: 80,
                        }}
                      >
                        <div style={{ fontSize: 9, color: T.text2, fontFamily: "monospace", marginBottom: 2 }}>
                          💨 ветер
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: T.text,
                            fontFamily: "monospace",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 4,
                          }}
                        >
                          <WindArrow deg={weather.current.windDir} />
                          {Math.round(weather.current.wind)}&thinsp;м/с&nbsp;
                          <span style={{ fontSize: 10, fontWeight: 400 }}>
                            {deg2dir(weather.current.windDir)}
                          </span>
                        </div>
                      </div>

                      {/* Волнение */}
                      {weather.current.wave !== null && (
                        <div
                          style={{
                            flex: "1 1 auto",
                            background: "#edf6ff",
                            borderRadius: 6,
                            padding: "5px 8px",
                            textAlign: "center",
                            minWidth: 70,
                          }}
                        >
                          <div style={{ fontSize: 9, color: T.text2, fontFamily: "monospace", marginBottom: 2 }}>
                            🌊 волна
                          </div>
                          <div
                            style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: "monospace" }}
                          >
                            {weather.current.wave.toFixed(1)}&thinsp;м
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Прогноз — следующие 24 часа */}
                    {weather.forecast.length > 0 && (
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          fontSize: 11,
                          marginBottom: 8,
                        }}
                      >
                        <thead>
                          <tr>
                            {["", "°C", "м/с", ...(weather.current.wave !== null ? ["волна"] : [])].map(
                              (h) => (
                                <th
                                  key={h}
                                  style={{
                                    color: T.text2,
                                    fontWeight: "normal",
                                    textAlign: h === "" ? "left" : "right",
                                    padding: "2px 4px",
                                    borderBottom: `1px solid ${T.border}`,
                                    fontFamily: "monospace",
                                    fontSize: 10,
                                  }}
                                >
                                  {h}
                                </th>
                              )
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {weather.forecast.map((row) => (
                            <tr key={row.label}>
                              <td
                                style={{
                                  padding: "3px 4px",
                                  borderBottom: `1px solid ${T.border}`,
                                  fontFamily: "monospace",
                                  color: T.text2,
                                  fontSize: 10,
                                }}
                              >
                                {row.label}
                              </td>
                              <td
                                style={{
                                  padding: "3px 4px",
                                  borderBottom: `1px solid ${T.border}`,
                                  fontFamily: "monospace",
                                  textAlign: "right",
                                }}
                              >
                                {row.temp > 0 ? "+" : ""}
                                {Math.round(row.temp)}°
                              </td>
                              <td
                                style={{
                                  padding: "3px 4px",
                                  borderBottom: `1px solid ${T.border}`,
                                  fontFamily: "monospace",
                                  textAlign: "right",
                                }}
                              >
                                <WindArrow deg={row.windDir} />
                                &nbsp;{Math.round(row.wind)}&nbsp;
                                <span style={{ fontSize: 9, color: T.text2 }}>
                                  {deg2dir(row.windDir)}
                                </span>
                              </td>
                              {weather.current.wave !== null && (
                                <td
                                  style={{
                                    padding: "3px 4px",
                                    borderBottom: `1px solid ${T.border}`,
                                    fontFamily: "monospace",
                                    textAlign: "right",
                                    color: T.accent,
                                  }}
                                >
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

                {!weatherLoading && !weather && (
                  <div
                    style={{
                      fontSize: 10,
                      color: T.text2,
                      fontFamily: "monospace",
                      paddingBottom: 6,
                    }}
                  >
                    Нет данных
                  </div>
                )}
              </div>
            )}

            {/* ── Запасы ── */}
            {vessel.supplies && vessel.supplies.length > 0 && (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    margin: "10px 0 4px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: T.text2,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      fontFamily: "monospace",
                    }}
                  >
                    Запасы
                  </span>
                  {powerText && (
                    <span style={{ fontSize: 10, color: T.text2 }}>
                      Электропитание: <b>{powerText}</b>
                    </span>
                  )}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      {["Вид", "Остаток", "%", "Расход", "До"].map((h) => (
                        <th
                          key={h}
                          style={{
                            color: T.text2,
                            fontWeight: "normal",
                            textAlign: "left",
                            padding: "3px 4px",
                            borderBottom: `1px solid ${T.border}`,
                            fontFamily: "monospace",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(vessel.supplies as DprSupply[]).map((s, i) => (
                      <tr key={i}>
                        <td style={{ padding: "4px 4px", borderBottom: `1px solid ${T.border}` }}>
                          {s.type}
                        </td>
                        <td
                          style={{
                            padding: "4px 4px",
                            borderBottom: `1px solid ${T.border}`,
                            color: T.accent,
                            fontWeight: 600,
                            fontFamily: "monospace",
                          }}
                        >
                          {s.amt}
                        </td>
                        <td
                          style={{
                            padding: "4px 4px",
                            borderBottom: `1px solid ${T.border}`,
                            color: T.text2,
                            fontFamily: "monospace",
                          }}
                        >
                          {(() => {
                            const p = parseFloat((s.pct || "").replace(",", "."));
                            if (isNaN(p)) return "—";
                            return (p > 100 ? p / 1000 : p).toFixed(1) + "%";
                          })()}
                        </td>
                        <td
                          style={{
                            padding: "4px 4px",
                            borderBottom: `1px solid ${T.border}`,
                            color: "#c07800",
                            fontFamily: "monospace",
                          }}
                        >
                          {s.cons}
                        </td>
                        <td
                          style={{
                            padding: "4px 4px",
                            borderBottom: `1px solid ${T.border}`,
                            fontSize: 10,
                            fontFamily: "monospace",
                          }}
                        >
                          {s.lim || "—"}
                        </td>
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
  );
}
