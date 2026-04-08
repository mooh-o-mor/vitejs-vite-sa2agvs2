import type { Vessel, Contract } from "../lib/types";
import { MONTHS, COLORS, SPECIAL_COLORS, YEAR, totalDays, T, PRIORITY_LABELS } from "../lib/types";
import { cpShortKey, dayOffset, contractDaysGantt, fdate, addDays, formatVesselName, formatVesselType, getType } from "../lib/utils";

interface Props {
  vessels: Vessel[];
  contracts: Contract[];
  isAdmin: boolean;
  canView: boolean;
  onAddContract: (vesselId: number) => void;
  onEditContract: (contract: Contract) => void;
}

const LANE_H = 22;
const LANE_GAP = 2;
const LANE_PAD = 3;

const PUBLIC_CONTRACT_COLOR = "#22c55e"; // единый зелёный для паблик-режима
const ASG_BG = "repeating-linear-gradient(45deg, #dc2626, #dc2626 4px, #ef4444 4px, #ef4444 8px)";

const YEAR_START = new Date(YEAR, 0, 1);
const YEAR_END   = new Date(YEAR, 11, 31);

/** Greedy lane assignment */
function assignLanes(contracts: Contract[]): Contract[][] {
  const sorted = [...contracts].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );
  const lanes: Contract[][] = [];
  for (const c of sorted) {
    let placed = false;
    for (const lane of lanes) {
      const last = lane[lane.length - 1];
      if (new Date(c.start) >= new Date(last.end)) {
        lane.push(c);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([c]);
  }
  return lanes;
}

function rowHeight(laneCount: number): number {
  return laneCount * LANE_H + (laneCount - 1) * LANE_GAP + LANE_PAD * 2;
}

/** Возвращает пустые промежутки года (в формате ISO-дат), не покрытые ни одним контрактом */
function getAsgGaps(vc: Contract[]): { start: string; end: string }[] {
  if (vc.length === 0) {
    return [{ start: `${YEAR}-01-01`, end: `${YEAR}-12-31` }];
  }

  // Клипируем каждый контракт по границам года и сортируем
  const intervals: [number, number][] = vc
    .map(c => {
      const s = Math.max(new Date(c.start).getTime(), YEAR_START.getTime());
      const e = Math.min(new Date(c.end).getTime(),   YEAR_END.getTime());
      return [s, e] as [number, number];
    })
    .filter(([s, e]) => s <= e)
    .sort((a, b) => a[0] - b[0]);

  // Мёрджим перекрывающиеся интервалы
  const merged: [number, number][] = [];
  for (const [s, e] of intervals) {
    if (merged.length === 0 || s > merged[merged.length - 1][1] + 86400000) {
      merged.push([s, e]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    }
  }

  // Находим пробелы
  const gaps: { start: string; end: string }[] = [];
  let cursor = YEAR_START.getTime();

  for (const [s, e] of merged) {
    if (s > cursor) {
      gaps.push({
        start: new Date(cursor).toISOString().slice(0, 10),
        end:   new Date(s - 86400000).toISOString().slice(0, 10),
      });
    }
    cursor = e + 86400000;
  }

  if (cursor <= YEAR_END.getTime()) {
    gaps.push({
      start: new Date(cursor).toISOString().slice(0, 10),
      end:   `${YEAR}-12-31`,
    });
  }

  return gaps;
}

export function GanttChart({ vessels, contracts, isAdmin, canView, onAddContract, onEditContract }: Props) {
  const vesselIds = new Set(vessels.map(v => v.id));
  const visibleContracts = contracts.filter(c =>
    vesselIds.has(c.vesselId) && (canView || c.priority === "contract")
  );

  const cpKeys = [...new Set(visibleContracts.map(c => cpShortKey(c.counterparty)))];
  const colorMap: Record<string, string> = Object.fromEntries(
    cpKeys.map((cp, i) => [cp, SPECIAL_COLORS[cp] || COLORS[i % COLORS.length]])
  );

  return (
    <div style={{ background: T.bg2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}` }}>
      {/* Легенда — только для canView */}
      {canView && cpKeys.filter(cp => !["Ремонт", "АСГ"].includes(cp)).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {cpKeys.filter(cp => !["Ремонт", "АСГ"].includes(cp)).map(cp => (
            <div key={cp} style={{ display: "flex", alignItems: "center", gap: 5, background: T.bg3, padding: "2px 10px", borderRadius: 20, fontSize: 11, border: `1px solid ${T.border2}` }}>
              <div style={{ width: 9, height: 9, borderRadius: 2, background: colorMap[cp] }} />{cp}
            </div>
          ))}
        </div>
      )}

      {/* Заголовок месяцев */}
      <div style={{ display: "flex", marginLeft: 190, marginBottom: 2 }}>
        {MONTHS.map((m, i) => {
          const d = new Date(YEAR, i + 1, 0).getDate();
          return (
            <div key={m} style={{ width: `${(d / totalDays) * 100}%`, textAlign: "center", fontSize: 10, color: T.text2, borderLeft: `1px solid ${T.border2}` }}>
              {m}
            </div>
          );
        })}
      </div>

      {vessels.map((v, idx) => {
        const vc = visibleContracts.filter(c => c.vesselId === v.id);
        const lanes = assignLanes(vc);
        const nLanes = Math.max(1, lanes.length);
        const rh = rowHeight(nLanes);

        const vesselType = getType(v.name, ["МФАСС", "ТБС", "ССН", "МБС", "МВС", "МБ", "НИС", "АСС", "СКБ"]);
        const nameWithoutPrefix = v.name.replace(/^(МФАСС|ТБС|ССН|МБС|МВС|МБ|НИС|АСС|СКБ)\s+/i, "").trim();
        const formattedName = formatVesselName(nameWithoutPrefix);
        const formattedType = formatVesselType(vesselType);

        // Паблик: пустые промежутки → АСГ
        const asgGaps = !canView ? getAsgGaps(vc) : [];

        return (
          <div key={v.id} style={{ display: "flex", alignItems: "stretch", marginBottom: 3 }}>
            {/* Название судна */}
            <div
              style={{ width: 190, flexShrink: 0, fontSize: 11, color: T.text, paddingRight: 8, paddingLeft: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center" }}
              title={`${formattedType} ${formattedName}${v.branch ? ` (${v.branch})` : ""}`}
            >
              {vesselType && <span style={{ fontFamily: "monospace", fontWeight: 500 }}>{formattedType}&nbsp;</span>}
              {formattedName}
              {v.branch && <span style={{ color: T.amber, marginLeft: 4, fontSize: 10 }}>{v.branch}</span>}
            </div>

            {/* Таймлайн */}
            <div
              style={{ flex: 1, minHeight: rh, background: idx % 2 === 0 ? T.bg3 : T.bg2, borderRadius: 4, position: "relative", border: `1px solid ${T.border2}`, cursor: canView ? "pointer" : "default" }}
              onClick={() => isAdmin && onAddContract(v.id)}
            >
              {/* Вертикальные линии месяцев */}
              {MONTHS.map((_, i) => {
                const off = (new Date(YEAR, i, 1).getTime() - new Date(YEAR, 0, 1).getTime()) / 86400000;
                return <div key={i} style={{ position: "absolute", left: `${(off / totalDays) * 100}%`, top: 0, bottom: 0, width: 1, background: T.border2, pointerEvents: "none" }} />;
              })}

              {/* Горизонтальные разделители дорожек */}
              {nLanes > 1 && lanes.map((_, li) => {
                if (li === nLanes - 1) return null;
                const top = LANE_PAD + (li + 1) * (LANE_H + LANE_GAP) - LANE_GAP;
                return <div key={li} style={{ position: "absolute", left: 0, right: 0, top, height: 1, background: T.border2, opacity: 0.4, pointerEvents: "none" }} />;
              })}

              {/* Паблик: АСГ-заглушки на пустые периоды */}
              {!canView && asgGaps.map((gap, gi) => {
                const left  = (dayOffset(gap.start) / totalDays) * 100;
                const width = (contractDaysGantt(gap.start, gap.end) / totalDays) * 100;
                if (width <= 0) return null;
                return (
                  <div
                    key={`asg-${gi}`}
                    style={{
                      position: "absolute",
                      left: `${Math.max(0, left)}%`,
                      width: `${Math.max(width, 0.4)}%`,
                      top: LANE_PAD,
                      bottom: LANE_PAD,
                      background: ASG_BG,
                      borderRadius: 3,
                      pointerEvents: "none",
                      opacity: 0.85,
                    }}
                  />
                );
              })}

              {/* Бары по дорожкам */}
              {lanes.map((lane, laneIdx) =>
                lane.map(c => renderBar(c, colorMap, canView, onEditContract, laneIdx, nLanes))
              )}

              {isAdmin && vc.length === 0 && (
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", paddingLeft: 8, fontSize: 10, color: T.text3 }}>
                  + добавить контракт
                </div>
              )}
            </div>

            {isAdmin && (
              <button
                onClick={() => onAddContract(v.id)}
                style={{ marginLeft: 5, width: 22, height: 22, borderRadius: 4, border: `1px solid ${T.border}`, background: T.bg2, color: T.accent, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, alignSelf: "center" }}
              >+</button>
            )}
          </div>
        );
      })}

      {!canView && (
        <div style={{ marginTop: 8, fontSize: 11, color: T.text3 }}>
          🔒 Войдите чтобы увидеть контрагентов и редактировать данные
        </div>
      )}
    </div>
  );
}

function renderBar(
  c: Contract,
  colorMap: Record<string, string>,
  canView: boolean,
  onEditContract: (c: Contract) => void,
  laneIdx: number,
  laneCount: number
) {
  const shortKey = cpShortKey(c.counterparty);
  const rawColor = colorMap[shortKey] || COLORS[0];

  // Паблик-режим: АСГ и Ремонт остаются своим цветом, всё остальное — зелёным
  const isAsg = shortKey === "АСГ";
  const isRem = shortKey === "Ремонт" || shortKey === "РЕМ";
  const color = !canView && !isAsg && !isRem ? PUBLIC_CONTRACT_COLOR : rawColor;

  const isKpOrPlan = c.priority === "kp" || c.priority === "plan";

  const yearStart = new Date(YEAR, 0, 1);
  const yearEnd   = new Date(YEAR, 11, 31);

  const contractStart   = new Date(c.start);
  const firmEndDate     = c.firmDays > 0 ? new Date(addDays(c.start, c.firmDays)) : new Date(c.end);
  const optionStartDate = c.firmDays > 0 ? new Date(addDays(c.start, c.firmDays + 1)) : null;
  const contractEnd     = new Date(c.end);

  const displayStart   = contractStart < yearStart ? yearStart : contractStart;
  const displayFirmEnd = firmEndDate > yearEnd ? yearEnd : firmEndDate;

  let displayOptStart: Date | null = null;
  let displayOptEnd:   Date | null = null;
  let showOption = false;

  if (c.optionDays > 0 && optionStartDate) {
    displayOptStart = optionStartDate < yearStart ? yearStart : optionStartDate;
    displayOptEnd   = contractEnd > yearEnd ? yearEnd : contractEnd;
    if (displayOptEnd >= yearStart && displayOptStart <= yearEnd) showOption = true;
  }

  const showFirm = displayFirmEnd >= yearStart && displayStart <= yearEnd;
  if (!showFirm && !showOption) return null;

  const firmLeft  = showFirm ? (dayOffset(displayStart.toISOString().slice(0, 10)) / totalDays) * 100 : 0;
  const firmWidth = showFirm ? (contractDaysGantt(displayStart.toISOString().slice(0, 10), displayFirmEnd.toISOString().slice(0, 10)) / totalDays) * 100 : 0;

  let optLeft = 0, optWidth = 0;
  if (showOption && displayOptStart && displayOptEnd) {
    optLeft  = (dayOffset(displayOptStart.toISOString().slice(0, 10)) / totalDays) * 100;
    optWidth = (contractDaysGantt(displayOptStart.toISOString().slice(0, 10), displayOptEnd.toISOString().slice(0, 10)) / totalDays) * 100;
  }

  const topPx    = LANE_PAD + laneIdx * (LANE_H + LANE_GAP);
  const bottomPx = LANE_PAD + (laneCount - laneIdx - 1) * (LANE_H + LANE_GAP);

  const bgStyle = isAsg
    ? ASG_BG
    : isKpOrPlan && canView
      ? `repeating-linear-gradient(135deg, ${color}, ${color} 3px, ${color}88 3px, ${color}88 6px)`
      : color;

  const priorityBadge = isKpOrPlan ? ` [${PRIORITY_LABELS[c.priority]}]` : "";

  return (
    <div key={c.id} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, pointerEvents: "none" }}>
      {showFirm && firmWidth > 0 && (
        <div
          title={canView
            ? `${c.counterparty}${priorityBadge}\n${fdate(displayStart.toISOString().slice(0, 10))} → ${fdate(displayFirmEnd.toISOString().slice(0, 10))}`
            : `${fdate(displayStart.toISOString().slice(0, 10))} → ${fdate(displayFirmEnd.toISOString().slice(0, 10))}`}
          onClick={e => { e.stopPropagation(); if (canView) onEditContract(c); }}
          style={{
            position: "absolute",
            left: `${Math.max(0, firmLeft)}%`,
            width: `${Math.max(firmWidth, 0.4)}%`,
            top: topPx,
            bottom: bottomPx,
            background: bgStyle,
            borderRadius: 3,
            cursor: canView ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            overflow: "hidden",
            fontSize: laneCount > 2 ? 9 : 10,
            fontWeight: 600, color: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            pointerEvents: "all",
          }}
        >
          {canView && firmWidth > 5 && (
            <span style={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: "1.2", padding: "0 3px", textAlign: "center" }}>
              {c.counterparty}
              {isKpOrPlan && <span style={{ opacity: 0.7, fontSize: 8 }}> {PRIORITY_LABELS[c.priority]}</span>}
            </span>
          )}
        </div>
      )}

      {showOption && displayOptStart && displayOptEnd && optWidth > 0 && (
        <div
          title={canView
            ? `${c.counterparty} (опцион)${priorityBadge}\n${fdate(displayOptStart.toISOString().slice(0, 10))} → ${fdate(displayOptEnd.toISOString().slice(0, 10))}`
            : `${fdate(displayOptStart.toISOString().slice(0, 10))} → ${fdate(displayOptEnd.toISOString().slice(0, 10))}`}
          onClick={e => { e.stopPropagation(); if (canView) onEditContract(c); }}
          style={{
            position: "absolute",
            left: `${Math.max(0, optLeft)}%`,
            width: `${Math.max(optWidth, 0.4)}%`,
            top: topPx,
            bottom: bottomPx,
            background: color,
            borderRadius: 3,
            cursor: canView ? "pointer" : "default",
            opacity: 0.4,
            pointerEvents: "all",
          }}
        />
      )}
    </div>
  );
}
