import { EditableCell } from "./EditableCell";
import type { DprRow } from "./types";
import {
  STATUS_BG,
  STATUS_COLOR,
  branchBg,
  shortStatus,
  statusCls,
  getPower,
} from "./types";
import { formatVesselName, formatVesselType } from "../../lib/utils";
import { extractLocation } from "../../lib/locationNormalizer";

interface Props {
  vessels: DprRow[];
  selDate: string;
  canView: boolean;
  getVesselType: (name: string) => string;
  specMap: Map<string, string>;
  onUpdateField: (vesselName: string, field: string, newValue: string) => void;
}

const thStyle: React.CSSProperties = {
  padding: "8px 8px",
  textAlign: "center",
  fontSize: 11,
  fontWeight: 700,
  color: "#fff",
  borderBottom: "2px solid #90a4ae",
  borderRight: "1px solid #546E7A",
  whiteSpace: "nowrap",
  //position: "sticky",
  //top: 0,
  //background: "#37474F",
  //zIndex: 1,
};

const tdBase: React.CSSProperties = {
  padding: "5px 8px",
  fontSize: 12,
  borderBottom: "1px solid #cfd8dc",
  borderRight: "1px solid #e8eaed",
  verticalAlign: "top",
};

function getSupplyAmt(supplies: any[], keyword: string): string {
  if (!supplies || !Array.isArray(supplies)) return "";
  const s = supplies.find(x => x.type && x.type.toLowerCase().includes(keyword.toLowerCase()));
  if (!s || !s.amt || s.amt === "—") return "";
  
  const pctNum = s.pct ? parseFloat(s.pct.replace(",", ".")) : NaN;
  
  let pct = "";
  if (!isNaN(pctNum) && pctNum >= 0) {
    const pctDisplay = pctNum > 100 ? pctNum / 1000 : pctNum;
    pct = ` (${pctDisplay.toFixed(1)}%)`;
  }
  
  return `${s.amt}${pct}`;
}

function getSupplyCons(supplies: any[], keyword: string): string {
  if (!supplies || !Array.isArray(supplies)) return "";
  const s = supplies.find(x => x.type && x.type.toLowerCase().includes(keyword.toLowerCase()));
  if (!s) return "";
  const cons = s.cons && s.cons !== "—" ? s.cons : "0";
  return cons;
}


function ConsCell({ supplies }: { supplies: any[] }) {
  const dt = getSupplyCons(supplies, "ДТ");
  const tt = getSupplyCons(supplies, "Мазут") || getSupplyCons(supplies, "ТТ");
  return (
    <div style={{ fontFamily: "monospace", fontSize: 11, lineHeight: 1.6, textAlign: "right" }}>
      <div>{dt || "—"}</div>
      <div style={{ color: "#888" }}>{tt || "—"}</div>
    </div>
  );
}

export function ReportTable({ vessels, selDate, canView, getVesselType, specMap, onUpdateField }: Props) {
  return (
 <div style={{ border: "1px solid #90a4ae", borderRadius: 4, background: "#fff" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 36 }}>№</th>
            <th style={{ ...thStyle, width: 50 }}>Тип</th>
            <th style={{ ...thStyle, textAlign: "left", minWidth: 160 }}>Название судна</th>
            <th style={thStyle}>Филиал</th>
            <th style={{ ...thStyle, textAlign: "left", minWidth: 80 }}>Статус</th>
            {canView && <th style={{ ...thStyle, textAlign: "left", minWidth: 180 }}>Контракт</th>}
            {canView && <th style={{ ...thStyle, textAlign: "left", minWidth: 160 }}>Период работ</th>}
            <th style={{ ...thStyle, textAlign: "left", minWidth: 140 }}>Местоположение</th>
            <th style={{ ...thStyle, width: 50 }}>Эл-е</th>
            {canView && <th style={{ ...thStyle, textAlign: "left", minWidth: 200 }}>Примечание</th>}
            {canView && <th style={{ ...thStyle, width: 110 }}>Топливо</th>}
            {canView && <th style={{ ...thStyle, width: 70 }}>Расход</th>}
          </tr>
        </thead>
        <tbody>
          {vessels.map((v, i) => {
            const sc = statusCls(v.status);
            const rowBg = branchBg(v.branch);
            const vType = getVesselType(v.vessel_name);
            const power = getPower(v.coord_raw);
            const coordDisplay = extractLocation(v.coord_raw || "");
            const coordPublic = coordDisplay.replace(/\s+\d.*$/, "").replace(/,.*$/, "").trim();
            const specUrl = specMap.get(v.vessel_name.toUpperCase().trim());

            let statusDisplay = v.status;
            if (canView && sc === "asd") {
              const parts = v.status.split(/[,/]/);
              if (parts.length > 1) statusDisplay = parts[0].trim();
            }
            if (!canView) statusDisplay = shortStatus(v.status);

            const isAsd = sc === "asd";

            return (
              <tr key={v.vessel_name} style={{ background: rowBg }}>
                <td style={{ ...tdBase, textAlign: "center", color: "#546E7A", fontFamily: "monospace", fontSize: 11 }}>{i + 1}</td>
                <td style={{ ...tdBase, textAlign: "center", fontSize: 10, color: "#546E7A", fontFamily: "monospace", fontWeight: 700 }}>{formatVesselType(vType)}</td>
                <td style={{ ...tdBase, fontWeight: 600, color: "#1a2a3a" }}>
                  {specUrl ? (
                    <a href={specUrl} target="_blank" rel="noopener noreferrer"
                      title="Спецификация (PDF)"
                      style={{ color: "#1a2a3a", textDecoration: "underline", fontWeight: 600, cursor: "pointer" }}>
                      {formatVesselName(v.vessel_name)}
                    </a>
                  ) : (
                    formatVesselName(v.vessel_name)
                  )}
                </td>
                <td style={{ ...tdBase, textAlign: "center", fontWeight: 600, fontSize: 11, color: "#37474F" }}>{v.branch}</td>
                <td style={{ ...tdBase, background: STATUS_BG[sc], color: STATUS_COLOR[sc], fontWeight: 600, fontSize: 11 }}>{statusDisplay}</td>
                {canView && (
                  <td style={{ ...tdBase, background: rowBg }}>
                    <EditableCell value={v.contract_info || ""} vesselName={v.vessel_name} reportDate={selDate} field="contract_info" onUpdate={onUpdateField} editable={isAsd} placeholder="✎ добавить" />
                  </td>
                )}
                {canView && (
                  <td style={{ ...tdBase, background: rowBg }}>
                    <EditableCell value={v.work_period || ""} vesselName={v.vessel_name} reportDate={selDate} field="work_period" onUpdate={onUpdateField} editable={true} placeholder="✎ добавить период" />
                  </td>
                )}
                <td style={{ ...tdBase, fontSize: 11, fontFamily: "monospace", color: "#37474F" }}>{(canView ? coordDisplay : coordPublic) || "—"}</td>
                <td style={{ ...tdBase, textAlign: "center", fontSize: 11, fontWeight: 700, color: power === "БЭП" ? "#1565C0" : power === "СЭП" ? "#2E7D32" : "#ccc" }}>{power || "—"}</td>
                {canView && (
                  <td style={{ ...tdBase, background: rowBg }}>
                    <EditableCell value={v.note || ""} vesselName={v.vessel_name} reportDate={selDate} field="note" onUpdate={onUpdateField} editable={true} placeholder="✎ добавить примечание" />
                  </td>
                )}
                {canView && (
                  <td style={{ ...tdBase }}>
                    <div style={{ fontFamily: "monospace", fontSize: 11, lineHeight: 1.6 }}>
                      <div>{getSupplyAmt(v.supplies, "ДТ") || "—"}</div>
                      <div style={{ color: "#888" }}>{getSupplyAmt(v.supplies, "Мазут") || getSupplyAmt(v.supplies, "ТТ") || "—"}</div>
                    </div>
                  </td>
                )}
                {canView && (
                  <td style={{ ...tdBase }}>
                    <ConsCell supplies={v.supplies} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
