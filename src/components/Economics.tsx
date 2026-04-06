import React from "react";
import type { Vessel, Contract } from "../lib/types";
import { COLORS, SPECIAL_COLORS, T } from "../lib/types";
import { cpShortKey, contractDays, fmoney, fdate, formatVesselName, formatVesselType, getType } from "../lib/utils";

interface Props {
  vessels: Vessel[];
  contracts: Contract[];
  onAddContract: (vesselId: number) => void;
  onEditContract: (contract: Contract) => void;
}

export function Economics({ vessels, contracts, onAddContract, onEditContract }: Props) {
  const cpKeys = [...new Set(contracts.map(c => cpShortKey(c.counterparty)))];
  const colorMap: Record<string, string> = Object.fromEntries(
    cpKeys.map((cp, i) => [cp, SPECIAL_COLORS[cp] || COLORS[i % COLORS.length]])
  );

  const totalRev = contracts
    .filter(c => vessels.some(v => v.id === c.vesselId))
    .reduce((s, c) => s + contractDays(c.start, c.end) * c.rate + c.mob + c.demob, 0);

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
        <colgroup>
         <col style={{ width: "22%" }} />
<col style={{ width: "8%" }} />   {/* Номер */}
<col style={{ width: "7%" }} />   {/* Дата */}
<col style={{ width: "7%" }} />
<col style={{ width: "7%" }} />
<col style={{ width: "5%" }} />
<col style={{ width: "6%" }} />
<col style={{ width: "8%" }} />
<col style={{ width: "8%" }} />
<col style={{ width: "8%" }} />
<col style={{ width: "8%" }} />
<col style={{ width: "2%" }} />
        </colgroup>
        <thead>
          <tr style={{ color: T.text2, borderBottom: `1px solid ${T.border}`, background: T.bg3, position: "sticky", top: 0, zIndex: 1 }}>
            <th style={{ textAlign: "left", padding: "6px 6px" }}>Контрагент</th>
<th style={{ textAlign: "left", padding: "6px 6px" }}>№</th>
<th style={{ textAlign: "left", padding: "6px 6px" }}>Дата</th>
<th style={{ textAlign: "left", padding: "6px 6px" }}>Начало</th>
            <th style={{ textAlign: "left", padding: "6px 6px" }}>Конец</th>
            <th style={{ textAlign: "right", padding: "6px 6px" }}>Тв.дней</th>
            <th style={{ textAlign: "right", padding: "6px 6px" }}>Опц.дней</th>
            <th style={{ textAlign: "right", padding: "6px 6px" }}>Всего</th>
            <th style={{ textAlign: "right", padding: "6px 6px" }}>Ставка/сут</th>
            <th style={{ textAlign: "right", padding: "6px 6px" }}>Моб</th>
            <th style={{ textAlign: "right", padding: "6px 6px" }}>Демоб</th>
            <th style={{ textAlign: "right", padding: "6px 6px" }}>Выручка</th>
            <th style={{ padding: "6px 6px" }} />
          </tr>
        </thead>
        <tbody>
          {vessels.map(v => {
            const vesselType = getType(v.name, ["МФАСС", "ТБС", "ССН", "МБС", "МВС", "МБ", "НИС", "АСС", "БП"]);
            const nameWithoutPrefix = v.name.replace(/^(МФАСС|ТБС|ССН|МБС|МВС|МБ|НИС|АСС|БП)\s+/i, "").trim();
            const formattedName = formatVesselName(nameWithoutPrefix);
            const formattedType = formatVesselType(vesselType);

            const ec = contracts.filter(c => c.vesselId === v.id).map(c => {
              const days = contractDays(c.start, c.end);
              return { ...c, days, revenue: days * c.rate + c.mob + c.demob };
            });
            const tot = ec.reduce((s, c) => s + c.revenue, 0);

            return (
              <React.Fragment key={v.id}>
                {/* Заголовок судна */}
                <tr style={{ background: T.bg3, borderTop: `2px solid ${T.border}` }}>
                  <td colSpan={12} style={{ padding: "6px 8px", fontWeight: 700, fontSize: 12, color: T.accent }}>
                    {vesselType && <span style={{ fontFamily: "monospace", fontWeight: 500, marginRight: 6 }}>{formattedType}</span>}
                    {formattedName}
                    {v.branch && <span style={{ color: T.amber, fontWeight: 400, fontSize: 11, marginLeft: 8 }}>{v.branch}</span>}
                  </td>
                  <td style={{ padding: "6px 4px", textAlign: "right" }}>
                    <button
                      onClick={() => onAddContract(v.id)}
                      title="Добавить контракт"
                      style={{ width: 20, height: 20, borderRadius: 4, border: `1px solid ${T.border}`, background: T.bg2, color: T.accent, cursor: "pointer", fontSize: 14, lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    >+</button>
                  </td>
                </tr>

                {ec.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ padding: "4px 8px", color: T.text3, fontSize: 11 }}>Нет контрактов</td>
                  </tr>
                ) : (
                  <>
                    {ec.map((c, i) => {
                      const shortKey = cpShortKey(c.counterparty);
                      return (
                        <tr
                          key={c.id}
                          style={{ borderBottom: `1px solid ${T.border2}`, background: i % 2 === 0 ? T.bg2 : T.bg3, cursor: "pointer" }}
                          onClick={() => onEditContract(c)}
                        >
                          <td style={{ padding: "4px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: colorMap[shortKey] || "#888", marginRight: 4 }} />
                            {c.counterparty}
                          </td>
                          <td style={{ padding: "4px 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: colorMap[shortKey] || "#888", marginRight: 4 }} />
  {c.counterparty}
</td>
<td style={{ padding: "4px 6px", color: T.text2, whiteSpace: "nowrap" }}>
  {c.contractNumber || "—"}
</td>
<td style={{ padding: "4px 6px", color: T.text2, whiteSpace: "nowrap" }}>
  {c.contractDate ? fdate(c.contractDate) : "—"}
</td>
<td style={{ padding: "4px 6px", color: T.text2 }}>{fdate(c.start)}</td>
                          <td style={{ padding: "4px 6px", color: T.text2 }}>{fdate(c.start)}</td>
                          <td style={{ padding: "4px 6px", color: T.text2 }}>{fdate(c.end)}</td>
                          <td style={{ padding: "4px 6px", textAlign: "right" }}>{c.firmDays || "—"}</td>
                          <td style={{ padding: "4px 6px", textAlign: "right" }}>{c.optionDays || "—"}</td>
                          <td style={{ padding: "4px 6px", textAlign: "right" }}>{c.days}</td>
                          <td style={{ padding: "4px 6px", textAlign: "right" }}>{fmoney(c.rate)}</td>
                          <td style={{ padding: "4px 6px", textAlign: "right" }}>{fmoney(c.mob)}</td>
                          <td style={{ padding: "4px 6px", textAlign: "right" }}>{fmoney(c.demob)}</td>
                          <td style={{ padding: "4px 6px", textAlign: "right", color: T.green, fontWeight: 700 }}>{fmoney(c.revenue)}</td>
                          <td style={{ padding: "4px 6px", textAlign: "center", color: T.text3, fontSize: 12 }}>✏️</td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: T.bg3 }}>
                      <td colSpan={11} style={{ padding: "4px 6px", textAlign: "right", fontSize: 11, color: T.text2 }}>Итого:</td>
                      <td style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: T.green }}>{fmoney(tot)}</td>
                      <td />
                    </tr>
                  </>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {totalRev > 0 && (
        <div style={{ background: T.accent, borderRadius: 8, padding: 12, textAlign: "center", fontSize: 16, fontWeight: 700, color: "#ffffff", marginTop: 12 }}>
          ИТОГО ПО ФЛОТУ: {fmoney(totalRev)}
        </div>
      )}
    </div>
  );
}
