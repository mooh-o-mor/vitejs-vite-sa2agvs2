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

function cls(stat: string | null | undefined): "asg" | "asd" | "rem" | "oth" {
  if (!stat) return "oth";
  const s = stat.toUpperCase();
  if (s.includes("АСГ")) return "asg";
  if (s.includes("АСД") || s.includes("КОНТР") || s.includes("ДОГО") ||
      s.includes("ЧАРТ") || s.includes("БУКСИР") ||
      /\bТ\/Ч\b/.test(s) || /\bТЧ\b/.test(s)) return "asd";
  if (s.includes("РЕМ") || s.includes("ВОССТ") || s.includes("ОСВИДЕТ")) return "rem";
  return "oth";
}

export function VesselListItem({ vessel, vesselType, isSelected, onClick, isMobile = false }: Props) {
  const c = cls(vessel.status);
  const bgColor = STATUS_BG[c];
  const fontSize = isMobile ? 10 : 11;
  const nameFontSize = isMobile ? 12 : 13;

  const nameWithoutPrefix = vessel.vessel_name.replace(/^(мфасс|тбс|ссн|мбс|мвс|мб|нис|асс|скб)\s+/i, "").trim();
  const formattedName = formatVesselName(nameWithoutPrefix);

  const today = new Date().toISOString().split('T')[0];
  const isStale = vessel.report_date && vessel.report_date !== today;

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
          {formattedName}
        </span>
        {vessel.branch && vessel.branch !== "0" && (
          <span style={{ fontSize: fontSize, color: T.text, padding: "0px", flexShrink: 0 }}>{vessel.branch}</span>
        )}
        {vessel.lat == null && <span style={{ fontSize: 9, color: "#c07800", flexShrink: 0 }}>📍?</span>}
        {isStale ? (
          <span
            title={`Нет ДПР за сегодня. Последняя: ${vessel.report_date}`}
            style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: "#ef4444",
              display: "inline-block",
            }}
          />
        ) : vessel.parse_ok != null ? (
          <span
            title={vessel.parse_ok ? "ДПР получена и распарсена" : "ДПР во вложении — не распарсена"}
            style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: vessel.parse_ok ? "#22c55e" : "#f59e0b",
              display: "inline-block",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
