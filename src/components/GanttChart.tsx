import { useMemo } from "react";
import type { Vessel, Contract } from "../lib/types";
import { MONTHS, COLORS, SPECIAL_COLORS, YEAR, totalDays, T, PRIORITY_LABELS, PRIORITY_ORDER } from "../lib/types";
import { cpKey, dayOffset, contractDaysGantt, fdate, addDays } from "../lib/utils";

interface Props {
  vessels: Vessel[];
  contracts: Contract[];
  isAdmin: boolean;
  canView: boolean;
  onAddContract: (vesselId: number) => void;
  onEditContract: (contract: Contract) => void;
}

function priorityIdx(p: string): number {
  const i = PRIORITY_ORDER.indexOf(p);
  return i >= 0 ? i : 99;
}

// Вынесена за пределы компонента (никаких хуков)
function renderBar(
  c: Contract,
  colorMap: Record<string, string>,
  canView: boolean,
  onEditContract: (c: Contract) => void,
  position: "full" | "top" | "bottom"
) {
  const key = cpKey(c.counterparty);
  const color = colorMap[key] || COLORS[0];
  const isAsg = key === "АСГ";
  const isAlt = position === "bottom";
  const isKpOrPlan = c.priority === "kp" || c.priority === "plan";

  const firmEnd = c.firmDays > 0 ? addDays(c.start, c.firmDays) : c.end;
  const firmLeft = (dayOffset(c.start) / totalDays) * 100;
  const firmWidth = (contractDaysGantt(c.start, firmEnd) / totalDays) * 100;
  const hasOption = c.optionDays > 0;
  const optStart = c.firmDays > 0 ? addDays(c.start, c.firmDays + 1) : null;
  const optLeft = optStart ? (dayOffset(optStart) / totalDays) * 100 : 0;
  const optWidth = hasOption && optStart ? (contractDaysGantt(optStart, c.end) / totalDays) * 100 : 0;

  const bgStyle = isAsg
    ? "repeating-linear-gradient(45deg, #dc2626, #dc2626 4px, #ef4444 4px, #ef4444 8px)"
    : isKpOrPlan
    ? `repeating-linear-gradient(135deg, ${color}, ${color} 3px, ${color}88 3px, ${color}88 6px)`
    : color;

  const topPx = position === "full" ? 3 : position === "top" ? 2 : "50%";
  const bottomPx = position === "full" ? 3 : position === "top" ? "calc(50% + 1px)" : 2;
  const opacity = isAlt ? 0.7 : 1;

  const priorityBadge = isKpOrPlan ? ` [${PRIORITY_LABELS[c.priority]}]` : "";

  return (
    <div key={c.id} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, pointerEvents: "none" }}>
      <div
        title={
          canView
            ? `${c.counterparty}${priorityBadge}\n${fdate(c.start)} → ${fdate(firmEnd)}`
            : `${fdate(c.start)} → ${fdate(firmEnd)}`
        }
        onClick={(e) => {
          e.stopPropagation();
          if (canView) onEditContract(c);
        }}
        style={{
          position: "absolute",
          left: `${firmLeft}%`,
          width: `${Math.max(firmWidth, 0.4)}%`,
          top: topPx,
          bottom: bottomPx,
          background: bgStyle,
          borderRadius: 3,
          cursor: canView ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          fontSize: position === "full" ? 10 : 9,
          fontWeight: 600,
          color: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          pointerEvents: "all",
          opacity,
        }}
      >
        {canView && (
          <span
            style={{
              whiteSpace: "normal",
              wordBreak: "break-word",
              lineHeight: "1.2",
              padding: "0 3px",
              textAlign: "center",
            }}
          >
            {c.counterparty}
            {isKpOrPlan && (
              <span style={{ opacity: 0.7, fontSize: 8 }}> {PRIORITY_LABELS[c.priority]}</span>
            )}
          </span>
        )}
      </div>
      {hasOption && optStart && (
        <div
          title={
            canView
              ? `${c.counterparty} (опцион)${priorityBadge}\n${fdate(optStart)} → ${fdate(c.end)}`
              : `${fdate(optStart)} → ${fdate(c.end)}`
          }
          onClick={(e) => {
            e.stopPropagation();
            if (canView) onEditContract(c);
          }}
          style={{
            position: "absolute",
            left: `${optLeft}%`,
            width: `${Math.max(optWidth, 0.4)}%`,
            top: topPx,
            bottom: bottomPx,
            background: color,
            borderRadius: 3,
            cursor: canView ? "pointer" : "default",
            opacity: isAlt ? 0.3 : 0.4,
            pointerEvents: "all",
          }}
        />
      )}
    </div>
  );
}

export function GanttChart({
  vessels,
  contracts,
  isAdmin,
  canView,
  onAddContract,
  onEditContract,
}: Props) {
  // Мемоизируем видимые контракты
  const vesselIds = useMemo(() => new Set(vessels.map((v) => v.id)), [vessels]);
  const visibleContracts = useMemo(
    () => contracts.filter((c) => vesselIds.has(c.vesselId)),
    [contracts, vesselIds]
  );

  // Мемоизируем цветовую карту
  const colorMap = useMemo(() => {
    const cpKeys = [...new Set(visibleContracts.map((c) => cpKey(c.counterparty)))];
    return Object.fromEntries(
      cpKeys.map((cp, i) => [cp, SPECIAL_COLORS[cp] || COLORS[i % COLORS.length]])
    );
  }, [visibleContracts]);

  // Мемоизируем легенду
  const legendItems = useMemo(() => {
    const cpKeys = [...new Set(visibleContracts.map((c) => cpKey(c.counterparty)))];
    return cpKeys.filter((cp) => !["Ремонт", "АСГ"].includes(cp));
  }, [visibleContracts]);

  return (
    <div
      style={{
        background: T.bg2,
        borderRadius: 8,
        padding: 12,
        border: `1px solid ${T.border}`,
      }}
    >
      {canView && legendItems.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {legendItems.map((cp) => (
            <div
              key={cp}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: T.bg3,
                padding: "2px 10px",
                borderRadius: 20,
                fontSize: 11,
                border: `1px solid ${T.border2}`,
              }}
            >
              <div style={{ width: 9, height: 9, borderRadius: 2, background: colorMap[cp] }} />
              {cp}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", marginLeft: 190, marginBottom: 2 }}>
        {MONTHS.map((m, i) => {
          const d = new Date(YEAR, i + 1, 0).getDate();
          return (
            <div
              key={m}
              style={{
                width: `${(d / totalDays) * 100}%`,
                textAlign: "center",
                fontSize: 10,
                color: T.text2,
                borderLeft: `1px solid ${T.border2}`,
              }}
            >
              {m}
            </div>
          );
        })}
      </div>

      {vessels.map((v, idx) => {
        // Фильтруем контракты для этого судна
        const vc = visibleContracts.filter((c) => c.vesselId === v.id);

        // Разделение на основные и альтернативные контракты
        const altGroups = new Set(vc.filter((c) => c.altGroup).map((c) => c.altGroup!));
        const mainContracts: Contract[] = [];
        const altContracts: Contract[] = [];

        vc.filter((c) => !c.altGroup).forEach((c) => mainContracts.push(c));

        altGroups.forEach((g) => {
          const group = vc.filter((c) => c.altGroup === g).sort((a, b) => priorityIdx(a.priority) - priorityIdx(b.priority));
          if (group.length > 0) mainContracts.push(group[0]);
          group.slice(1).forEach((c) => altContracts.push(c));
        });

        const hasAlt = altContracts.length > 0;
        const rowHeight = hasAlt ? 52 : 28;

        return (
          <div key={v.id} style={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
            <div
              style={{
                width: 190,
                flexShrink: 0,
                fontSize: 11,
                color: T.text,
                paddingRight: 8,
                paddingLeft: 4,
                textAlign: "left",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={`${v.name}${v.branch ? ` (${v.branch})` : ""}`}
            >
              {v.name}
              {v.branch && (
                <span style={{ color: T.amber, marginLeft: 4, fontSize: 10 }}>{v.branch}</span>
              )}
            </div>
            <div
              style={{
                flex: 1,
                minHeight: rowHeight,
                background: idx % 2 === 0 ? T.bg3 : T.bg2,
                borderRadius: 4,
                position: "relative",
                border: `1px solid ${T.border2}`,
                cursor: canView ? "pointer" : "default",
              }}
              onClick={() => isAdmin && onAddContract(v.id)}
            >
              {MONTHS.map((_, i) => {
                const off = (new Date(YEAR, i, 1).getTime() - new Date(YEAR, 0, 1).getTime()) / 86400000;
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: `${(off / totalDays) * 100}%`,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: T.border2,
                      pointerEvents: "none",
                    }}
                  />
                );
              })}

              {hasAlt && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: "50%",
                    height: 1,
                    background: T.border2,
                    pointerEvents: "none",
                    opacity: 0.5,
                  }}
                />
              )}

              {mainContracts.map((c) => renderBar(c, colorMap, canView, onEditContract, hasAlt ? "top" : "full"))}
              {altContracts.map((c) => renderBar(c, colorMap, canView, onEditContract, "bottom"))}

              {isAdmin && vc.length === 0 && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 8,
                    fontSize: 10,
                    color: T.text3,
                  }}
                >
                  + добавить контракт
                </div>
              )}
            </div>
            {isAdmin && (
              <button
                onClick={() => onAddContract(v.id)}
                style={{
                  marginLeft: 5,
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  border: `1px solid ${T.border}`,
                  background: T.bg2,
                  color: T.accent,
                  cursor: "pointer",
                  fontSize: 15,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                +
              </button>
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
