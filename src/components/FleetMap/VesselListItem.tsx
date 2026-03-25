import { T } from "../../lib/types";
import { STATUS_BG } from "./mapIcons";
import { formatVesselName, formatVesselType } from "../../lib/utils";
import type { DprRow } from "../../lib/parseDpr";

interface Props {
  vessel: DprRow;
  vesselType: string;
  isSelected: boolean;
  onClick: () => void;
  isMobile?: boolean;
}

function cls(stat: string): "asg" | "asd" | "rem" | "oth" {
  if (!stat) return "oth";
  const s = stat.toUpperCase();
  if (s.startsWith("АСГ")) return "asg";
  if (s.startsWith("АСД")) return "asd";
  if (s.startsWith("РЕМ") || s.includes("РЕМОНТ") || s.includes("ОСВИДЕТ")) return "rem";
  return "oth";
}

export function VesselListItem({ vessel, vesselType, isSelected, onClick, isMobile = false }: Props) {
  const c = cls(vessel.status);
  const bgColor = STATUS_BG[c];
  const fontSize = isMobile ? 10 : 11;
  const nameFontSize = isMobile ? 12 : 13;

  return (
    <div 
      onClick={onClick}
      style={{ 
        padding: isMobile ? "6px 8px" : "8px 10px", 
        borderBottom: `1px solid ${T.border}`, 
        cursor: "pointer", 
        borderLeft: `3px solid ${isSelected ? T.accent : "transparent"}`, 
        background: isSelected ? "rgba(30,144,255,0.06)" : bgColor,
        transition: "all 0.2s",
        whiteSpace: "nowrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 8, flexWrap: "nowrap" }}>
        {vesselType && (
          <span style={{ 
            fontSize: fontSize, 
            color: T.text, 
            fontFamily: "monospace", 
            fontWeight: 500, 
            padding: "0px", 
            flexShrink: 0,
          }}>
            {formatVesselType(vesselType)}
          </span>
        )}
        <span style={{ fontSize: nameFontSize, fontWeight: 500, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {formatVesselName(vessel.vessel_name)}
        </span>
        {vessel.branch && vessel.branch !== "0" && (
          <span style={{ fontSize: fontSize, color: T.text, padding: "0px", flexShrink: 0 }}>{vessel.branch}</span>
        )}
        {vessel.lat == null && <span style={{ fontSize: 9, color: "#c07800", flexShrink: 0 }}>📍?</span>}
      </div>
    </div>
  );
}