import XLSX from "xlsx-js-style";
import { PORTS } from "./ports";

/* ── Types ── */
export interface DprSupply {
  type: string;
  amt: string;
  pct: string;
  cons: string;
  lim: string;
  del: string;
}

export interface DprVessel {
  name: string;
  branch: string;
  status: string;
  coordRaw: string;
  lat: number | null;
  lng: number | null;
  note: string;
  supplies: DprSupply[];
  reportDate: Date | null;
  contract_info?: string;
  work_period?: string;
}

export interface DprRow {
  id?: number;
  vessel_name: string;
  branch: string;
  report_date: string;
  status: string;
  coord_raw: string;
  lat: number | null;
  lng: number | null;
  note: string;
  supplies: DprSupply[];
  contract_info?: string;
  work_period?: string;
}

/* ── Status normalizer ── */
function normalizeStatus(raw: string): { status: string; extra: string } {
  const s = raw.trim();
  const sep = s.search(/[\/,]/);
  const firstPart = (sep >= 0 ? s.slice(0, sep) : s).trim();
  const afterSep = sep >= 0 ? s.slice(sep + 1).trim() : "";
  const fu = firstPart.toUpperCase();
  let status: string;
  let extraFromFirst = "";
  if (fu.startsWith("АСГ")) {
    status = "АСГ";
    extraFromFirst = firstPart.slice(3).trim();
  } else if (fu.startsWith("АСД")) {
    status = "АСД";
    extraFromFirst = firstPart.slice(3).trim();
  } else if (fu.startsWith("РЕМ") || /РЕМОНТ|ТЕХ|ОСВИДЕТ/i.test(fu)) {
    status = "РЕМ";
  } else {
    status = firstPart;
  }
  const extra = [extraFromFirst, afterSep].filter(Boolean).join(" / ");
  return { status, extra };
}

/* ── Coordinate parser ── */
export function parseCoord(raw: string | null | undefined): [number, number] | null {
  if (!raw || raw === "nan") return null;
  const s = String(raw).trim();

  // 1. DD-MM,M N DDD-MM,M E
  const m1 = s.match(/(\d{1,3})-(\d{1,2}[,.]?\d*)\s*[NСNнс]\s*(\d{1,3})-(\d{1,2}[,.]?\d*)\s*[EВЕEвеe]/i);
  if (m1) {
    const lat = +m1[1] + +m1[2].replace(",", ".") / 60;
    const lng = +m1[3] + +m1[4].replace(",", ".") / 60;
    if (lat > 0 && lat < 90 && lng > 0 && lng < 180) return [lat, lng];
  }

  // 2. DD°MM N/DDD°MM E
  const m2 = s.match(/(\d{1,3})°(\d{1,2}[,.]?\d*)\s*[NСNнс]\s*[\/]?\s*(\d{1,3})°(\d{1,2}[,.]?\d*)\s*[EВЕEвеe]/i);
  if (m2) {
    const lat = +m2[1] + +m2[2].replace(",", ".") / 60;
    const lng = +m2[3] + +m2[4].replace(",", ".") / 60;
    if (lat > 0 && lat < 90 && lng > 0 && lng < 180) return [lat, lng];
  }

  // 3. DD MM,M N DDD MM,M E (пробел вместо дефиса)
  const m3 = s.match(/(\d{1,3})\s+(\d{1,2}[,.]?\d*)\s*[NСNнс]\s*(\d{1,3})\s+(\d{1,2}[,.]?\d*)\s*[EВЕEвеe]/i);
  if (m3) {
    const lat = +m3[1] + +m3[2].replace(",", ".") / 60;
    const lng = +m3[3] + +m3[4].replace(",", ".") / 60;
    if (lat > 0 && lat < 90 && lng > 0 && lng < 180) return [lat, lng];
  }

  // 4. DD MM,Mсев.DDD MM,Mв.
  const m4 = s.match(/(\d{1,3})\s+(\d{1,2}[,.]?\d*)\s*(?:сев|с)[.\s]*(\d{1,3})\s+(\d{1,2}[,.]?\d*)\s*(?:вост|в)[.\s]/i);
  if (m4) {
    const lat = +m4[1] + +m4[2].replace(",", ".") / 60;
    const lng = +m4[3] + +m4[4].replace(",", ".") / 60;
    if (lat > 0 && lat < 90 && lng > 0 && lng < 180) return [lat, lng];
  }

  // Port lookup
  const low = s.toLowerCase().replace(/^(п\.|порт|рейд|б\.|бухта|пр\.|причал|якорная стоянка|рейд)\s*/gi, "").trim();
  for (const [k, c] of Object.entries(PORTS)) {
    if (low.startsWith(k) || s.toLowerCase().includes(k)) return c;
  }

  return null;
}

/* ── Helpers ── */
function xlSerialToDate(n: number): Date {
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

function fmtDate(v: any): string {
  if (!v) return "";
  if (v instanceof Date) {
    if (v.getFullYear() < 2020) return "";
    const dd = String(v.getDate()).padStart(2, "0");
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    const yy = String(v.getFullYear()).slice(-2);
    return `${dd}.${mm}.${yy}`;
  }
  if (typeof v === "number" && v > 43831) {
    const d = xlSerialToDate(v);
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yy = String(d.getUTCFullYear()).slice(-2);
    return `${dd}.${mm}.${yy}`;
  }
  const s = String(v);
  if (/^\d{1,2}[./]\d{1,2}/.test(s)) return s.replace(/\d{4}/, (y) => y.slice(-2));
  return s;
}

/* Проверяет устаревшую дату (до 2020) в любом формате */
function isStaleDate(v: any): boolean {
  if (!v) return false;
  if (v instanceof Date) return v.getFullYear() < 2020;
  if (typeof v === "number" && v > 0 && v < 43831) return true;
  const s = String(v);
  if (s.match(/201[0-9]/)) return true;
  if (s.match(/202[0-4]/)) return true;
  return false;
}

/* ── MSG → XLSX extraction ── */
export async function extractXlsx(buf: ArrayBuffer): Promise<any[][] | null> {
  const u8 = new Uint8Array(buf);
  let best: any[][] | null = null;
  let bestN = 0;

  const tryParse = (start: number) => {
    try {
      const end = Math.min(start + 800000, buf.byteLength);
      const wb = XLSX.read(new Uint8Array(buf.slice(start, end)), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
      const txt = JSON.stringify(rows.slice(0, 12));
      if (
        /[\u0400-\u04ff]/.test(txt) &&
        rows.some((r) => r && r.some((v: any) => v && String(v).includes("Название судна"))) &&
        rows.length > bestN
      ) {
        bestN = rows.length;
        best = rows;
      }
    } catch (_) {}
  };

  for (let i = 0; i < u8.length - 4; i++) {
    if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x03 && u8[i + 3] === 0x04)
      tryParse(i);
  }
  if (best) return best;

  for (let i = 0; i < u8.length - 4; i++) {
    if (u8[i] === 0xd0 && u8[i + 1] === 0xcf && u8[i + 2] === 0x11 && u8[i + 3] === 0xe0)
      tryParse(i);
  }
  return best;
}

/* ── Filial data parser ── */
export function parseFilial(rows: any[][], branchMap?: Map<string, string>): DprVessel[] {
  console.log("=== parseFilial START ===");
  console.log("Rows count:", rows.length);
  console.log("First 3 rows:", rows.slice(0, 3).map(r => r?.slice(0, 10)));

  let hRow = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    if (rows[i] && rows[i].some((v: any) => v && String(v).includes("Название судна"))) {
      hRow = i;
      break;
    }
  }
  console.log("Header row index:", hRow);
  if (hRow < 0) return [];

  const H = rows[hRow];
  console.log("Header row:", H?.slice(0, 15));

  const ci = (...kw: string[]) => H.findIndex((v: any) => v && kw.some((k) => String(v).includes(k)));

  const C = {
    name: ci("Название судна"),
    fil: ci("Филиал"),
    stat: ci("АСГ", "АСД", "РЕМ", "БУК"),
    pos: ci("Координат", "/Порт"),
    sup: ci("Запасы"),
    amt: ci("Остаток"),
    pct: ci("%"),
    cons: ci("Расход"),
    lim: ci("лимит"),
    del: ci("поставки"),
    note: ci("Примечание"),
  };

  console.log("Column indices (by name):", C);

  // Фолбэк: если amt не найден — ставим после sup (формат СХЛФ)
  if (C.amt < 0 && C.sup >= 0) {
    C.amt = C.sup + 1;
    console.log(`amt not found, set to ${C.amt} (sup+1)`);
  }

  // Фолбэк: если pos не найден — ставим после stat
  if (C.pos < 0 && C.stat >= 0 && C.sup >= 0 && C.sup - C.stat === 2) {
    C.pos = C.stat + 1;
    console.log(`pos not found, set to ${C.pos}`);
  }

  console.log("Final column indices:", {
    name: C.name, fil: C.fil, stat: C.stat, pos: C.pos, sup: C.sup,
    amt: C.amt, pct: C.pct, cons: C.cons, lim: C.lim, del: C.del, note: C.note
  });

  // Определяем дату отчёта
  let date: Date | null = null;
  for (let i = 0; i < Math.min(10, rows.length) && !date; i++) {
    for (const v of rows[i] || []) {
      if (v instanceof Date && v.getFullYear() >= 2025) { date = v; break; }
      if (typeof v === "number" && v > 45000 && v < 47000) {
        const d = xlSerialToDate(v);
        if (d.getFullYear() >= 2025) { date = d; break; }
      }
    }
  }
  if (!date) {
    for (let i = 0; i < Math.min(10, rows.length) && !date; i++) {
      for (const v of rows[i] || []) {
        if (v == null) continue;
        const s = String(v);
        if (/приложени|распоряжени/i.test(s)) continue;
        const m1 = s.match(/(\d{1,2})[./](\d{1,2})[./](202[5-9])/);
        if (m1) { date = new Date(+m1[3], +m1[2] - 1, +m1[1]); break; }
        const m2 = s.match(/(202[5-9])[-./](\d{1,2})[-./](\d{1,2})/);
        if (m2) { date = new Date(+m2[1], +m2[2] - 1, +m2[3]); break; }
      }
    }
  }
  console.log("Report date:", date);

  const vessels: DprVessel[] = [];
  let i = hRow + 1;
  let vesselCounter = 0;

  while (i < rows.length) {
    const row = rows[i];
    if (!row) { i++; continue; }

    const name = C.name >= 0 ? row[C.name] : null;
    const stat = C.stat >= 0 ? row[C.stat] : null;

    if (!name || !String(name).trim() ||
      String(name).includes("Исполни") ||
      String(name).includes("беспеч")) { i++; continue; }

    const statStr = stat ? String(stat).trim() : "";
    const hasSupplyData = C.sup >= 0 && row[C.sup] && String(row[C.sup]).trim();

    console.log(`\n--- Vessel candidate at row ${i} ---`);
    console.log("Name:", name);
    console.log("Status:", statStr);
    console.log("Has supply data:", hasSupplyData);

    // Пропускаем если нет ни статуса ни запасов
    if (!statStr && !hasSupplyData) { 
      console.log("Skip: no status and no supply data");
      i += 5; 
      continue; 
    }
    if (statStr === "0") { 
      console.log("Skip: status is 0");
      i += 5; 
      continue; 
    }

    // ✅ НОВАЯ ЛОГИКА: проверяем только lim (дата лимита)
    const limVal = C.lim >= 0 ? row[C.lim] : null;
    console.log("limVal:", limVal, "isStaleDate:", isStaleDate(limVal));
    
    // Если лимит устаревший — пропускаем ВСЁ судно
    if (isStaleDate(limVal)) { 
      console.log("Skip vessel: stale lim date");
      i += 5; 
      continue; 
    }
    
    // Дата поставки может быть старой — не блокируем, просто логируем
    const delVal = C.del >= 0 ? row[C.del] : null;
    if (isStaleDate(delVal)) {
      console.log(`Warning: stale delivery date for vessel: ${delVal}`);
    }
    
    // ❌ УБРАНА проверка остальных ячеек на stale даты!
    // Числа 1,2,3, порядковые номера больше не блокируют парсинг

    const supplies: DprSupply[] = [];
    const coordParts: string[] = [];
    
    console.log(`Reading 5 supply rows starting at ${i}`);
    for (let j = 0; j < 5 && i + j < rows.length; j++) {
      const sr = rows[i + j];
      if (!sr) continue;
      if (C.pos >= 0 && sr[C.pos]) {
        const cv = String(sr[C.pos]).trim();
        if (cv && cv !== "0") coordParts.push(cv);
      }
      const ft = C.sup >= 0 ? sr[C.sup] : null;
      if (ft && String(ft).trim()) {
        // Для каждого запаса проверяем лимит индивидуально
        const supplyLim = C.lim >= 0 ? sr[C.lim] : null;
        if (isStaleDate(supplyLim)) {
          console.log(`Skip supply ${String(ft).trim()} due to stale lim: ${supplyLim}`);
          continue;
        }
        
        const supply = {
          type: String(ft).trim(),
          amt: C.amt >= 0 && sr[C.amt] != null ? String(sr[C.amt]) : "—",
          pct: C.pct >= 0 && sr[C.pct] != null ? String(sr[C.pct]) : "",
          cons: C.cons >= 0 && sr[C.cons] != null ? String(sr[C.cons]) : "—",
          lim: C.lim >= 0 && sr[C.lim] ? fmtDate(sr[C.lim]) : "",
          del: C.del >= 0 && sr[C.del] ? fmtDate(sr[C.del]) : "",
        };
        console.log(`Supply row ${j}: type=${supply.type}, amt=${supply.amt}, lim=${supply.lim}`);
        supplies.push(supply);
      }
    }

    const coordRaw = coordParts.join(" ").trim();
    const coords = parseCoord(coordRaw);
    console.log("Coord raw:", coordRaw, "parsed coords:", coords);

    const { status: cleanStatus, extra: statusExtra } = normalizeStatus(statStr);
    const rawNote = C.note >= 0 && row[C.note] ? String(row[C.note]).trim() : "";
    const combinedNote = [statusExtra, rawNote].filter(Boolean).join(" / ");

    let branch = C.fil >= 0 && row[C.fil] ? String(row[C.fil]).trim() : "";
    if (!branch && branchMap) {
      const vesselNameClean = String(name).trim().toUpperCase();
      const fromMap = branchMap.get(vesselNameClean);
      if (fromMap) {
        branch = fromMap;
      } else {
        for (const [key, val] of branchMap.entries()) {
          if (vesselNameClean.includes(key) || key.includes(vesselNameClean)) {
            branch = val;
            break;
          }
        }
      }
    }

    let vesselName = name ? String(name).trim() : "";
    vesselName = vesselName.replace(/\s+/g, " ");

    vesselCounter++;
    console.log(`✅ Vessel ${vesselCounter}: ${vesselName}, branch: ${branch}, status: ${cleanStatus}, supplies: ${supplies.length}`);

    vessels.push({
      name: vesselName,
      branch,
      status: cleanStatus,
      coordRaw,
      lat: coords ? coords[0] : null,
      lng: coords ? coords[1] : null,
      note: combinedNote,
      supplies,
      reportDate: date,
      contract_info: "",
      work_period: "",
    });

    i += 5;
  }

  console.log(`=== parseFilial END: ${vessels.length} vessels parsed ===`);
  return vessels;
}

/* ── EML → XLSX extraction ── */
async function extractXlsxFromEml(text: string): Promise<any[][] | null> {
  const parts = text.split(/\r?\n\r?\n/);
  for (let i = 0; i < parts.length; i++) {
    const prev = i > 0 ? parts[i - 1] : "";
    if (/content-transfer-encoding:\s*base64/i.test(prev) ||
        (/attachment/i.test(prev) && /base64/i.test(prev))) {
      const b64 = parts[i].replace(/[\r\n\s]/g, "");
      try {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
        const wb = XLSX.read(bytes, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
        if (rows.some(r => r && r.some((v: any) => v && String(v).includes("Название судна")))) {
          return rows;
        }
      } catch (_) {}
    }
  }
  const b64Match = text.match(/\r?\n\r?\n([A-Za-z0-9+/=\r\n]{500,})/);
  if (b64Match) {
    try {
      const b64 = b64Match[1].replace(/[\r\n\s]/g, "");
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
      const wb = XLSX.read(bytes, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    } catch (_) {}
  }
  return null;
}

/* ── Full pipeline ── */
export async function parseMsgFiles(
  files: File[],
  branchMap?: Map<string, string>
): Promise<{ vessels: DprVessel[]; date: Date | null }> {
  console.log("=== parseMsgFiles START ===");
  let reportDate: Date | null = null;
  const all: DprVessel[] = [];

  for (const f of files) {
    console.log(`Processing file: ${f.name}`);
    try {
      let rows: any[][] | null = null;
      if (f.name.toLowerCase().endsWith(".eml")) {
        const text = await f.text();
        rows = await extractXlsxFromEml(text);
      } else {
        const buf = await f.arrayBuffer();
        rows = await extractXlsx(buf);
      }
      if (!rows) {
        console.log(`No rows extracted from ${f.name}`);
        continue;
      }
      console.log(`Extracted ${rows.length} rows from ${f.name}`);
      const vs = parseFilial(rows, branchMap);
      console.log(`Parsed ${vs.length} vessels from ${f.name}`);
      if (vs.length) {
        if (!reportDate && vs[0].reportDate) reportDate = vs[0].reportDate;
        all.push(...vs);
      }
    } catch (e) {
      console.error("Parse error:", f.name, e);
    }
  }

  const map = new Map<string, DprVessel>();
  all.forEach((v) => {
    const key = v.name.toUpperCase().trim();
    const existing = map.get(key);
    if (!existing || (!existing.branch && v.branch) || (!existing.lat && v.lat)) {
      map.set(key, v);
    }
  });
  console.log(`=== parseMsgFiles END: ${map.size} unique vessels ===`);
  return { vessels: Array.from(map.values()), date: reportDate };
}