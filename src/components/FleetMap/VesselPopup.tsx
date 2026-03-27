import { T } from "../../lib/types";
import type { DprSupply, DprRow } from "../../lib/parseDpr";
import { STATUS_HEADER_BG } from "./mapIcons";
import { formatVesselName, formatVesselType, getPower } from "../../lib/utils";
import { supabase } from "../../lib/supabase";
import { useState, useEffect } from "react";

interface Props {
  vessel: DprRow;
  vesselType: string;
  canView: boolean;
  onClose: () => void;
}

function cls(stat: string): "asg" | "asd" | "rem" | "oth" {
  if (!stat) return "oth";
  const s = stat.toUpperCase();
  if (s.startsWith("АСГ")) return "asg";
  if (s.startsWith("АСД")) return "asd";
  if (s.startsWith("РЕМ") || s.includes("РЕМОНТ") || s.includes("ОСВИДЕТ")) return "rem";
  return "oth";
}

export function VesselPopup({ vessel, vesselType, canView, onClose }: Props) {
  const c = cls(vessel.status);
  const power = getPower(vessel.coord_raw);
  const powerText = power === "БЭП" ? "БЕРЕГОВОЕ" : power === "СЭП" ? "СУДОВОЕ" : null;
  const coordDisplay = (vessel.coord_raw || "").replace(/\s*(БЭП|СЭП|CЭП)\s*$/i, "").trim();
  
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [imo, setImo] = useState<string>("");
  
  const nameWithoutPrefix = vessel.vessel_name.replace(/^(мфасс|тбс|ссн|мбс|мвс|мб|нис|асс|бп)\s+/i, "").trim();
  const formattedName = formatVesselName(nameWithoutPrefix);
  
  useEffect(() => {
    const fetchVesselData = async () => {
      const { data } = await supabase
        .from("vessels")
        .select("imo, photo_url")
        .ilike("name", `%${nameWithoutPrefix}%`)
        .maybeSingle();
      if (data) {
        setImo(data.imo || "");
        setPhotoUrl(data.photo_url || null);
      }
    };
    fetchVesselData();
  }, [nameWithoutPrefix]);
  
  const rsClassUrl = imo ? `https://rs-class.org/c/getves.php?imo=${imo}` : null;
  
  // Исключения для ссылок (судна, у которых не должно быть ссылки)
  const noRsClassExceptions = ["артемис оффшор", "артемис"];
  const showRsLink = rsClassUrl && canView && !noRsClassExceptions.some(ex => vessel.vessel_name.toLowerCase().includes(ex));

  return (
    <div style={{ position: "absolute", right: 14, bottom: 36, width: 420, maxWidth: "calc(100vw - 40px)", maxHeight: "70vh", background: "#fff", border: `1px solid ${T.border}`, borderRadius: 8, zIndex: 900, boxShadow: "0 12px 48px rgba(0,0,0,.15)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ 
        padding: "10px 14px", 
        borderBottom: `1px solid ${T.border}`, 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        flexWrap: "nowrap",
        gap: 8,
        background: STATUS_HEADER_BG[c],
        flexShrink: 0
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap", flex: 1, minWidth: 0, overflow: "hidden" }}>
          {vesselType && (
            <span style={{ 
              fontSize: 11, 
              color: T.text, 
              fontFamily: "monospace", 
              fontWeight: 500, 
              padding: "0px",
              flexShrink: 0,
            }}>
              {formatVesselType(vesselType)}
            </span>
          )}
          {showRsLink ? (
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
                cursor: "pointer"
              }}
            >
              {formattedName}
            </a>
          ) : (
            <span style={{ fontSize: 16, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {formattedName}
            </span>
          )}
          {vessel.branch && (
            <span style={{ 
              fontSize: 11, 
              color: T.text, 
              fontFamily: "monospace", 
              fontWeight: 500,
              padding: "0px",
              flexShrink: 0,
            }}>
              {vessel.branch}
            </span>
          )}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: T.text2, cursor: "pointer", fontSize: 18, lineHeight: 1, flexShrink: 0 }}>✕</button>
      </div>

      {photoUrl && (
        <div style={{ padding: "8px 14px", borderBottom: `1px solid ${T.border}`, background: "#f8f9fa", textAlign: "center" }}>
          <img 
            src={photoUrl} 
            alt={formattedName}
            style={{ 
              maxWidth: "100%", 
              maxHeight: "180px", 
              objectFit: "contain",
              borderRadius: 4
            }}
          />
        </div>
      )}

      <div style={{ overflowY: "auto", padding: "12px 14px", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "5px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
          <span style={{ color: T.text2 }}>Местоположение</span>
          <span style={{ color: T.text, textAlign: "right", fontFamily: "monospace", fontSize: 10, maxWidth: 250 }}>{coordDisplay || "—"}</span>
        </div>
        {canView && (
          <>
            {vessel.note && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "5px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
                <span style={{ color: T.text2 }}>Примечание</span>
                <span style={{ color: T.text, textAlign: "right", fontSize: 11, maxWidth: 250 }}>{vessel.note}</span>
              </div>
            )}
           {(vessel.supplies && vessel.supplies.length > 0) && (
  <>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "10px 0 4px" }}>
      <span style={{ fontSize: 10, color: T.text2, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "monospace" }}>Запасы</span>
      {powerText && <span style={{ fontSize: 10, color: T.text2 }}>Электропитание: <b>{powerText}</b></span>}
    </div>
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
  );
}
