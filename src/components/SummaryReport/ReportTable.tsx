import { EditableCell } from "./EditableCell";
import type { DprRow } from "./types";
import {
  STATUS_BG,
  STATUS_COLOR,
  branchBg,
  getSupply,
  shortStatus,
  statusCls,
  getPower,
} from "./types";
import { formatVesselName, formatVesselType } from "../../lib/utils";

interface Props {
  vessels: DprRow[];
  selDate: string;
  canView: boolean;
  getVesselType: (name: string) => string;
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
  position: "sticky",
  top: 0,
  background: "#37474F",
  zIndex: 1,
};

const tdBase: React.CSSProperties = {
  padding: "5px 8px",
  fontSize: 12,
  borderBottom: "1px solid #cfd8dc",
  borderRight: "1px solid #e8eaed",
  verticalAlign: "top",
};

export function ReportTable({ vessels, selDate, canView, getVesselType, onUpdateField }: Props) {
  return (
    <div style={{ overflow: "auto", maxHeight: "calc(100vh - 280px)", border: "1px solid #90a4ae", borderRadius: 4, background: "#fff" }}>
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
            {canView && <th style={{ ...thStyle, width: 70 }}>ДТ</th>}
            {canView && <th style={{ ...thStyle, width: 70 }}>Мазут/ТТ</th>}
          </tr>
        </thead>
        <tbody>
          {vessels.map((v, i) => {
            const sc = statusCls(v.status);
            const rowBg = branchBg(v.branch);
            const vType = getVesselType(v.vessel_name);
            const power = getPower(v.coord_raw);
            const coordDisplay = (v.coord_raw || "").replace(/\s*(БЭП|СЭП)\s*$/i, "").trim();

            let statusDisplay = v.status;
            if (canView && sc === "asd") {
              const parts = v.status.split(/[,/]/);
              if (parts.length > 1) {
                statusDisplay = parts[0].trim();
              }
            }
            if (!canView) {
              statusDisplay = shortStatus(v.status);
            }

            const isAsd = sc === "asd";

            return (
              <tr key={v.vessel_name} style={{ background: rowBg }}>
                <td style={{ ...tdBase, textAlign: "center", color: "#546E7A", fontFamily: "monospace", fontSize: 11 }}>{i + 1}</td>
                <td style={{ ...tdBase, textAlign: "center", fontSize: 10, color: "#546E7A", fontFamily: "monospace", fontWeight: 700 }}>{formatVesselType(vType)}</td>
                <td style={{ ...tdBase, fontWeight: 600, color: "#1a2a3a" }}>{formatVesselName(v.vessel_name)}</td>
                <td style={{ ...tdBase, textAlign: "center", fontWeight: 600, fontSize: 11, color: "#37474F" }}>{v.branch}</td>
                <td style={{ ...tdBase, background: STATUS_BG[sc], color: STATUS_COLOR[sc], fontWeight: 600, fontSize: 11 }}>{statusDisplay}</td>
                {canView && (
                  <td style={{ ...tdBase, background: rowBg }}>
                    <EditableCell
                      value={v.contract_info || ""}
                      vesselName={v.vessel_name}
                      reportDate={selDate}
                      field="contract_info"
                      onUpdate={onUpdateField}
                      editable={isAsd}
                      placeholder="✎ добавить"
                    />
                  </td>
                )}
                {canView && (
                  <td style={{ ...tdBase, background: rowBg }}>
                    <EditableCell
                      value={v.work_period || ""}
                      vesselName={v.vessel_name}
                      reportDate={selDate}
                      field="work_period"
                      onUpdate={onUpdateField}
                      editable={true}
                      placeholder="✎ добавить период"
                    />
                  </td>
                )}
                <td style={{ ...tdBase, fontSize: 11, fontFamily: "monospace", color: "#37474F" }}>{coordDisplay || "—"}</td>
                <td style={{ ...tdBase, textAlign: "center", fontSize: 11, fontWeight: 700, color: power === "БЭП" ? "#1565C0" : power === "СЭП" ? "#2E7D32" : "#ccc" }}>{power || "—"}</td>
                {canView && (
                  <td style={{ ...tdBase, background: rowBg }}>
                    <EditableCell
                      value={v.note || ""}
                      vesselName={v.vessel_name}
                      reportDate={selDate}
                      field="note"
                      onUpdate={onUpdateField}
                      editable={true}
                      placeholder="✎ добавить примечание"
                    />
                  </td>
                )}
                {canView && <td style={{ ...tdBase, textAlign: "right", fontFamily: "monospace", fontSize: 11, fontWeight: 500 }}>{getSupply(v.supplies, "ДТ") || ""}</td>}
                {canView && <td style={{ ...tdBase, textAlign: "right", fontFamily: "monospace", fontSize: 11, fontWeight: 500 }}>{getSupply(v.supplies, "Мазут") || getSupply(v.supplies, "ТТ") || ""}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
