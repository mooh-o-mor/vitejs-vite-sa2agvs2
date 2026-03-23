import { T } from "../../lib/types";
import { CLR, STATUS_BG } from "./mapIcons";

interface Props {
  vessel: {
    vessel_name: string;
    branch: string;
    status: string;
    lat: number | null;
    lng: number | null;
  };
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
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {vesselType && (
          <span style={{ 
            fontSize: 10, 
            color: T.text2, 
            fontFamily: "monospace", 
            fontWeight: 500, 
            background: "#f0f0f0", 
            padding: "2px 6px", 
            borderRadius: 3,
            display: "inline-block"
          }}>
            {vesselType}
          </span>
        )}
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{vessel.vessel_name}</span>
        {vessel.branch && vessel.branch !== "0" && (
          <span style={{ fontSize: 10, color: T.text2, background: "#f0f0f0", padding: "2px 6px", borderRadius: 3 }}>{vessel.branch}</span>
        )}
        {vessel.lat == null && <span style={{ fontSize: 10, color: "#c07800" }}>📍?</span>}
      </div>
    </div>
  );
}
