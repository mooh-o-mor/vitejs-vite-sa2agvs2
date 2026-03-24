import { T } from "../../lib/types";
import { STATUS_BG } from "./mapIcons";
import type { DprRow } from "../../lib/parseDpr";

interface Props {
  vessel: DprRow;
  vesselType: string;
  isSelected: boolean;
  onClick: () => void;
}

function cls(stat: string): "asg" | "asd" | "rem" | "oth" {
  if (!stat) return "oth";
  const s = stat.toUpperCase();
  if (s.startsWith("АСГ")) return "asg";
  if (s.startsWith("АСД")) return "asd";
  if (s.startsWith("РЕМ") || s.includes("РЕМОНТ") || s.includes("ОСВИДЕТ")) return "rem";
  return "oth";
}

export function VesselListItem({ vessel, vesselType, isSelected, onClick }: Props) {
  const c = cls(vessel.status);
  const bgColor = STATUS_BG[c];

  return (
    <div 
      onClick={onClick}
      style={{ 
        padding: "8px 10px", 
        borderBottom: `1px solid ${T.border}`, 
        cursor: "pointer", 
        borderLeft: `3px solid ${isSelected ? T.accent : "transparent"}`, 
        background: isSelected ? "rgba(30,144,255,0.06)" : bgColor,
        transition: "all 0.2s",
        whiteSpace: "nowrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap" }}>
        {vesselType && (
          <span style={{ 
            fontSize: 11, 
            color: T.text, 
            fontFamily: "monospace", 
            fontWeight: 500, 
            padding: "0px", 
            flexShrink: 0,
          }}>
            {vesselType}
          </span>
        )}
        <span style={{ fontSize: 13, fontWeight: 500, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{vessel.vessel_name}</span>
        {vessel.branch && vessel.branch !== "0" && (
          <span style={{ fontSize: 11, color: T.text, padding: "0px", flexShrink: 0 }}>{vessel.branch}</span>
        )}
        {vessel.lat == null && <span style={{ fontSize: 10, color: "#c07800", flexShrink: 0 }}>📍?</span>}
      </div>
    </div>
  );
}