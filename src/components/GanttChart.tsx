import type { Vessel, Contract } from "../lib/types";
import { MONTHS, COLORS, SPECIAL_COLORS, YEAR, totalDays, T, PRIORITY_LABELS, PRIORITY_ORDER } from "../lib/types";
import { cpShortKey, dayOffset, contractDaysGantt, fdate, addDays, formatVesselName, formatVesselType, getType } from "../lib/utils";

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

export function GanttChart({ vessels, contracts, isAdmin, canView, onAddContract, onEditContract }: Props) {
  const vesselIds = new Set(vessels.map(v => v.id));
  const visibleContracts = contracts.filter(c => vesselIds.has(c.vesselId));
  
  const cpKeys = [...new Set(visibleContracts.map(c => cpShortKey(c.counterparty)))];
  const colorMap: Record<string,string> = Object.fromEntries(
    cpKeys.map((cp,i) => [cp, SPECIAL_COLORS[cp]||COLORS[i%COLORS.length]])
  );

  return (
    <div style={{ background:T.bg2, borderRadius:8, padding:12, border:`1px solid ${T.border}` }}>
      {canView && cpKeys.filter(cp => !["Ремонт","АСГ"].includes(cp)).length>0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10 }}>
          {cpKeys.filter(cp => !["Ремонт","АСГ"].includes(cp)).map(cp => (
            <div key={cp} style={{ display:"flex", alignItems:"center", gap:5, background:T.bg3, padding:"2px 10px", borderRadius:20, fontSize:11, border:`1px solid ${T.border2}` }}>
              <div style={{ width:9, height:9, borderRadius:2, background:colorMap[cp] }}/>{cp}
            </div>
          ))}
        </div>
      )}

      <div style={{ display:"flex", marginLeft:190, marginBottom:2 }}>
        {MONTHS.map((m,i) => {
          const d = new Date(YEAR,i+1,0).getDate();
          return <div key={m} style={{ width:`${(d/totalDays)*100}%`, textAlign:"center", fontSize:10, color:T.text2, borderLeft:`1px solid ${T.border2}` }}>{m}</div>;
        })}
      </div>

      {vessels.map((v,idx) => {
        const vc = contracts.filter(c => c.vesselId===v.id);
        const altGroups = new Set(vc.filter(c => c.altGroup).map(c => c.altGroup!));
        const mainContracts: Contract[] = [];
        const altContracts: Contract[] = [];

        vc.filter(c => !c.altGroup).forEach(c => mainContracts.push(c));
        altGroups.forEach(g => {
          const group = vc.filter(c => c.altGroup === g).sort((a,b) => priorityIdx(a.priority) - priorityIdx(b.priority));
          if (group.length > 0) mainContracts.push(group[0]);
          group.slice(1).forEach(c => altContracts.push(c));
        });

        const hasAlt = altContracts.length > 0;
        const rowHeight = hasAlt ? 52 : 28;
        
        const vesselType = getType(v.name, ["МФАСС","ТБС","ССН","МБС","МВС","МБ","НИС","АСС","БП"]);
        const nameWithoutPrefix = v.name.replace(/^(МФАСС|ТБС|ССН|МБС|МВС|МБ|НИС|АСС|БП)\s+/i, "").trim();
        const formattedName = formatVesselName(nameWithoutPrefix);
        const formattedType = formatVesselType(vesselType);

        return (
          <div key={v.id} style={{ display:"flex", alignItems:"center", marginBottom:3 }}>
            <div style={{ width:190, flexShrink:0, fontSize:11, color:T.text, paddingRight:8, paddingLeft:4, textAlign:"left", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }} title={`${formattedType} ${formattedName}${v.branch ? ` (${v.branch})` : ""}`}>
              {vesselType && <span style={{ fontFamily:"monospace", fontWeight:500 }}>{formattedType}</span>} {formattedName}
              {v.branch && <span style={{ color:T.amber, marginLeft:4, fontSize:10 }}>{v.branch}</span>}
            </div>
            <div
              style={{ flex:1, minHeight:rowHeight, background:idx%2===0?T.bg3:T.bg2, borderRadius:4, position:"relative", border:`1px solid ${T.border2}`, cursor:canView?"pointer":"default" }}
              onClick={() => isAdmin && onAddContract(v.id)}
            >
              {MONTHS.map((_,i) => {
                const off = (new Date(YEAR,i,1).getTime()-new Date(YEAR,0,1).getTime())/86400000;
                return <div key={i} style={{ position:"absolute", left:`${(off/totalDays)*100}%`, top:0, bottom:0, width:1, background:T.border2, pointerEvents:"none" }}/>;
              })}

              {hasAlt && (
                <div style={{ position:"absolute", left:0, right:0, top:"50%", height:1, background:T.border2, pointerEvents:"none", opacity:0.5 }} />
              )}

              {mainContracts.map(c => renderBar(c, colorMap, canView, onEditContract, hasAlt ? "top" : "full"))}
              {altContracts.map(c => renderBar(c, colorMap, canView, onEditContract, "bottom"))}

              {isAdmin && vc.length===0 && (
                <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", paddingLeft:8, fontSize:10, color:T.text3 }}>+ добавить контракт</div>
              )}
            </div>
            {isAdmin && (
              <button onClick={() => onAddContract(v.id)} style={{ marginLeft:5, width:22, height:22, borderRadius:4, border:`1px solid ${T.border}`, background:T.bg2, color:T.accent, cursor:"pointer", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>+</button>
            )}
          </div>
        );
      })}

      {!canView && (
        <div style={{ marginTop:8, fontSize:11, color:T.text3 }}>🔒 Войдите чтобы увидеть контрагентов и редактировать данные</div>
      )}
    </div>
  );
}

function renderBar(
  c: Contract,
  colorMap: Record<string,string>,
  canView: boolean,
  onEditContract: (c: Contract) => void,
  position: "full" | "top" | "bottom"
) {
  const shortKey = cpShortKey(c.counterparty);
  const color = colorMap[shortKey] || COLORS[0];
  const isAsg = shortKey === "АСГ";
  const isAlt = position === "bottom";
  const isKpOrPlan = c.priority === "kp" || c.priority === "plan";

  const yearStart = new Date(YEAR, 0, 1);
  const yearEnd = new Date(YEAR, 11, 31);
  
  const contractStart = new Date(c.start);
  const firmEndDate = c.firmDays > 0 ? new Date(addDays(c.start, c.firmDays)) : new Date(c.end);
  const optionStartDate = c.firmDays > 0 ? new Date(addDays(c.start, c.firmDays + 1)) : null;
  const contractEnd = new Date(c.end);
  
  const displayStart = contractStart < yearStart ? yearStart : contractStart;
  const displayFirmEnd = firmEndDate > yearEnd ? yearEnd : firmEndDate;
  
  let displayOptStart: Date | null = null;
  let displayOptEnd: Date | null = null;
  
  const hasOption = c.optionDays > 0;
  let showOption = false;
  
  if (hasOption && optionStartDate) {
    displayOptStart = optionStartDate < yearStart ? yearStart : optionStartDate;
    displayOptEnd = contractEnd > yearEnd ? yearEnd : contractEnd;
    if (displayOptEnd >= yearStart && displayOptStart <= yearEnd) {
      showOption = true;
    }
  }
  
  const showFirm = displayFirmEnd >= yearStart && displayStart <= yearEnd;
  
  const firmLeft = showFirm ? (dayOffset(displayStart.toISOString().slice(0,10)) / totalDays) * 100 : 0;
  const firmWidth = showFirm ? (contractDaysGantt(displayStart.toISOString().slice(0,10), displayFirmEnd.toISOString().slice(0,10)) / totalDays) * 100 : 0;
  
  let optLeft = 0;
  let optWidth = 0;
  
  if (showOption && displayOptStart && displayOptEnd) {
    optLeft = (dayOffset(displayOptStart.toISOString().slice(0,10)) / totalDays) * 100;
    optWidth = (contractDaysGantt(displayOptStart.toISOString().slice(0,10), displayOptEnd.toISOString().slice(0,10)) / totalDays) * 100;
  }

  if (!showFirm && !showOption) return null;

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
    <div key={c.id} style={{ position:"absolute", left:0, right:0, top:0, bottom:0, pointerEvents:"none" }}>
      {showFirm && firmWidth > 0 && (
        <div
          title={canView ? `${c.counterparty}${priorityBadge}\n${fdate(displayStart.toISOString().slice(0,10))} → ${fdate(displayFirmEnd.toISOString().slice(0,10))}` : `${fdate(displayStart.toISOString().slice(0,10))} → ${fdate(displayFirmEnd.toISOString().slice(0,10))}`}
          onClick={e => { e.stopPropagation(); if (canView) onEditContract(c); }}
          style={{
            position:"absolute",
            left:`${Math.max(0, firmLeft)}%`,
            width:`${Math.max(firmWidth, 0.4)}%`,
            top: topPx,
            bottom: bottomPx,
            background:bgStyle,
            borderRadius:3,
            cursor:canView?"pointer":"default",
            display:"flex", alignItems:"center", justifyContent:"center",
            overflow:"hidden", fontSize: position === "full" ? 10 : 9,
            fontWeight:600, color:"#fff",
            boxShadow:"0 1px 3px rgba(0,0,0,0.2)",
            pointerEvents:"all",
            opacity,
          }}
        >
          {canView && firmWidth > 5 && (
            <span style={{ whiteSpace:"normal", wordBreak:"break-word", lineHeight:"1.2", padding:"0 3px", textAlign:"center" }}>
              {c.counterparty}
              {isKpOrPlan && <span style={{ opacity:0.7, fontSize:8 }}> {PRIORITY_LABELS[c.priority]}</span>}
            </span>
          )}
        </div>
      )}
      {showOption && displayOptStart && displayOptEnd && optWidth > 0 && (
        <div
          title={canView ? `${c.counterparty} (опцион)${priorityBadge}\n${fdate(displayOptStart.toISOString().slice(0,10))} → ${fdate(displayOptEnd.toISOString().slice(0,10))}` : `${fdate(displayOptStart.toISOString().slice(0,10))} → ${fdate(displayOptEnd.toISOString().slice(0,10))}`}
          onClick={e => { e.stopPropagation(); if (canView) onEditContract(c); }}
          style={{
            position:"absolute",
            left:`${Math.max(0, optLeft)}%`,
            width:`${Math.max(optWidth, 0.4)}%`,
            top: topPx,
            bottom: bottomPx,
            background:color,
            borderRadius:3,
            cursor:canView?"pointer":"default",
            opacity: isAlt ? 0.3 : 0.4,
            pointerEvents:"all",
          }}
        />
      )}
    </div>
  );
}