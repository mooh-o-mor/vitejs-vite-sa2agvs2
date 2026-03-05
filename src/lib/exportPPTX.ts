import { Vessel, Contract, YEAR, MONTHS, COLORS, SPECIAL_COLORS, totalDays, yearStart, yearEnd } from "../lib/types";
import { cpKey, contractDays, addDays, fmoney } from "../lib/utils";

export async function exportToPPTX(
  vesselsToExport: Vessel[],
  contractsToExport: Contract[],
  filterCp: string,
  isAdmin: boolean
) {
  const pptxgen = (await import("pptxgenjs")).default;
  const prs = new pptxgen();
  prs.defineLayout({ name: "A3", width: 16.54, height: 11.69 });
  prs.layout = "A3";
  const slide = prs.addSlide();
  slide.background = { color: "ffffff" };

  const filteredContracts = filterCp === "Все"
    ? contractsToExport
    : contractsToExport.filter(c => cpKey(c.counterparty) === filterCp);

  slide.addText(`Флот МСС — Диаграмма Ганта ${YEAR}`, {
    x:0.2, y:0.1, w:16, h:0.4, fontSize:18, bold:true, color:"1e40af", fontFace:"Arial"
  });

  const LEFT=2.2, TOP=0.7, ROW_H=0.22, ROW_GAP=0.02, CHART_W=13.8, TOTAL=totalDays;
  const cpKeys = [...new Set(filteredContracts.map(c => cpKey(c.counterparty)))];
  const colorMapPptx: Record<string,string> = Object.fromEntries(
    cpKeys.map((cp,i) => [cp, (SPECIAL_COLORS[cp]||COLORS[i%COLORS.length]).replace("#","")])
  );

  // Шкала месяцев
  let mx = LEFT;
  MONTHS.forEach((m,i) => {
    const daysInMonth = new Date(YEAR,i+1,0).getDate();
    const w = (daysInMonth/TOTAL)*CHART_W;
    slide.addText(m, { x:mx, y:TOP-0.18, w, h:0.16, fontSize:7, color:"475569", align:"center", fontFace:"Arial" });
    slide.addShape(prs.ShapeType.line, { x:mx, y:TOP-0.18, w:0, h:vesselsToExport.length*(ROW_H+ROW_GAP)+0.2, line:{color:"cbd5e1",width:0.5} });
    mx += w;
  });

  // Строки судов
  vesselsToExport.forEach((v,idx) => {
    const y = TOP + idx*(ROW_H+ROW_GAP);
    const vc = filteredContracts.filter(c => c.vesselId === v.id);
    slide.addShape(prs.ShapeType.rect, { x:0.1, y, w:LEFT+CHART_W+0.1, h:ROW_H, fill:{color:idx%2===0?"f8fafc":"f1f5f9"}, line:{color:idx%2===0?"f8fafc":"f1f5f9"} });
    slide.addText(v.name, { x:0.12, y:y+0.01, w:LEFT-0.15, h:ROW_H-0.02, fontSize:6.5, color:"0f172a", fontFace:"Arial", valign:"middle" });
    if (v.branch) slide.addText(v.branch, { x:0.12, y:y+0.01, w:LEFT-0.15, h:ROW_H-0.02, fontSize:5.5, color:"d97706", fontFace:"Arial", valign:"middle", align:"right" });

    vc.forEach(c => {
      const key = cpKey(c.counterparty);
      const color = colorMapPptx[key]||"1D4ED8";
      const firmEnd = c.firmDays>0 ? addDays(c.start, c.firmDays) : c.end;
      const firmS = new Date(Math.max(new Date(c.start).getTime(), yearStart.getTime()));
      const firmE = new Date(Math.min(new Date(firmEnd).getTime(), yearEnd.getTime()));

      if (firmE >= firmS) {
        const fbx = LEFT+((firmS.getTime()-yearStart.getTime())/86400000/TOTAL)*CHART_W;
        const fbw = Math.max(((firmE.getTime()-firmS.getTime())/86400000+1)/TOTAL*CHART_W, 0.05);
        slide.addShape(prs.ShapeType.rect, { x:fbx, y:y+0.025, w:fbw, h:ROW_H-0.05, fill:{color}, line:{color} });
        if (isAdmin && fbw>0.3) slide.addText(c.counterparty, { x:fbx+0.03, y:y+0.025, w:fbw-0.04, h:ROW_H-0.05, fontSize:5.5, color:"ffffff", fontFace:"Arial", valign:"middle", bold:true });
      }

      if (c.optionDays>0) {
        const optStart = addDays(c.start, c.firmDays+1);
        const optS = new Date(Math.max(new Date(optStart).getTime(), yearStart.getTime()));
        const optE = new Date(Math.min(new Date(c.end).getTime(), yearEnd.getTime()));
        if (optE >= optS) {
          const obx = LEFT+((optS.getTime()-yearStart.getTime())/86400000/TOTAL)*CHART_W;
          const obw = Math.max(((optE.getTime()-optS.getTime())/86400000+1)/TOTAL*CHART_W, 0.05);
          slide.addShape(prs.ShapeType.rect, { x:obx, y:y+0.04, w:obw, h:ROW_H-0.08, fill:{color, transparency:40}, line:{color:"ffffff", width:1} });
        }
      }

      if (!c.firmDays) {
        const s2 = new Date(Math.max(new Date(c.start).getTime(), yearStart.getTime()));
        const e2 = new Date(Math.min(new Date(c.end).getTime(), yearEnd.getTime()));
        if (e2 >= s2) {
          const bx = LEFT+((s2.getTime()-yearStart.getTime())/86400000/TOTAL)*CHART_W;
          const bw = Math.max(((e2.getTime()-s2.getTime())/86400000+1)/TOTAL*CHART_W, 0.05);
          slide.addShape(prs.ShapeType.rect, { x:bx, y:y+0.025, w:bw, h:ROW_H-0.05, fill:{color}, line:{color} });
          if (isAdmin && bw>0.3) slide.addText(c.counterparty, { x:bx+0.03, y:y+0.025, w:bw-0.04, h:ROW_H-0.05, fontSize:5.5, color:"ffffff", fontFace:"Arial", valign:"middle", bold:true });
        }
      }
    });
  });

  // Легенда внизу
  if (isAdmin) {
    const legendY = TOP + vesselsToExport.length*(ROW_H+ROW_GAP)+0.15;
    let legendX = LEFT;
    let legendRow = 0;
    cpKeys.filter(cp => !["Ремонт","АСГ"].includes(cp)).forEach(cp => {
      if (legendX + 2.0 > LEFT + CHART_W) { legendX = LEFT; legendRow += 1; }
      const ly = legendY + legendRow*0.22;
      const col = colorMapPptx[cp]||"1D4ED8";
      slide.addShape(prs.ShapeType.rect, { x:legendX, y:ly, w:0.12, h:0.12, fill:{color:col}, line:{color:col} });
      slide.addText(cp, { x:legendX+0.15, y:ly-0.02, w:1.8, h:0.16, fontSize:7, color:"0f172a", fontFace:"Arial" });
      legendX += 2.0;
    });
    const totalRev = filteredContracts.reduce((s,c) => s+contractDays(c.start,c.end)*c.rate+c.mob+c.demob, 0);
    const revY = legendY + (legendRow+1)*0.22 + 0.05;
    slide.addText(`Выручка: ${fmoney(totalRev)}`, { x:0.2, y:revY, w:16, h:0.3, fontSize:10, bold:true, color:"059669", fontFace:"Arial" });
  }

  await prs.writeFile({ fileName:`флот_МСС_${YEAR}.pptx` });
}
