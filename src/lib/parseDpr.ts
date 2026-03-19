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
}

/* ── Coordinate parser ── */
export function parseCoord(raw: string | null | undefined): [number, number] | null {
  if (!raw || raw === "nan") return null;
  const s = String(raw).trim();

  // DD-MM,M [NSСЮ] DDD-MM,M [EWВЗ]
  const m1 = s.match(
    /(\d{1,3})-(\d{1,2}[,.]?\d*)\s*[NСNнс]\s*(\d{1,3})-(\d{1,2}[,.]?\d*)\s*[EВЕEвеe]/i
  );
  if (m1) {
    const lat = +m1[1] + +m1[2].replace(",", ".") / 60;
    const lng = +m1[3] + +m1[4].replace(",", ".") / 60;
    if (lat > 0 && lat < 90 && lng > 0 && lng < 180) return [lat, lng];
  }
// DD°MM[,M]N / DDD°MM[,M]E  (например: 45°04N/036°32E)
const m2 = s.match(
  /(\d{1,3})°(\d{1,2}[,.]?\d*)\s*[NСNнс]\s*[\/]?\s*(\d{1,3})°(\d{1,2}[,.]?\d*)\s*[EВЕEвеe]/i
);
if (m2) {
  const lat = +m2[1] + +m2[2].replace(",", ".") / 60;
  const lng = +m2[3] + +m2[4].replace(",", ".") / 60;
  if (lat > 0 && lat < 90 && lng > 0 && lng < 180) return [lat, lng];
}
  // Port lookup
  const low = s
    .toLowerCase()
    .replace(/^(п\.|порт|рейд|б\.|бухта|пр\.|причал|якорная стоянка|рейд)\s*/gi, "")
    .trim();
  for (const [k, c] of Object.entries(PORTS)) {
    if (low.startsWith(k) || s.toLowerCase().includes(k)) return c;
  }
  return null;
}

/* ── Excel date helpers ── */
function xlSerialToDate(n: number): Date {
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

function fmtDate(v: any): string {
  if (!v) return "";
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

  // XLSX (PK magic)
  for (let i = 0; i < u8.length - 4; i++) {
    if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x03 && u8[i + 3] === 0x04)
      tryParse(i);
  }
  if (best) return best;

  // XLS (OLE magic)
  for (let i = 0; i < u8.length - 4; i++) {
    if (u8[i] === 0xd0 && u8[i + 1] === 0xcf && u8[i + 2] === 0x11 && u8[i + 3] === 0xe0)
      tryParse(i);
  }
  return best;
}

/* ── Filial data parser ── */
export function parseFilial(rows: any[][]): DprVessel[] {
  // Find header row
  let hRow = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    if (rows[i] && rows[i].some((v: any) => v && String(v).includes("Название судна"))) {
      hRow = i;
      break;
    }
  }
  if (hRow < 0) return [];

  const H = rows[hRow];
  const ci = (...kw: string[]) =>
    H.findIndex((v: any) => v && kw.some((k) => String(v).includes(k)));

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

  if (C.pos < 0 && C.stat >= 0 && C.sup >= 0 && C.sup - C.stat === 2) {
    C.pos = C.stat + 1;
  }

 // Extract report date — prefer Excel serial numbers, skip regulatory headers
  let date: Date | null = null;
  // Pass 1: Excel serial numbers only (most reliable)
  for (let i = 0; i < Math.min(10, rows.length) && !date; i++) {
    for (const v of rows[i] || []) {
      if (typeof v === "number" && v > 45000 && v < 47000) {
        const d = xlSerialToDate(v);
        if (d.getFullYear() >= 2025) { date = d; break; }
      }
    }
  }
  // Pass 2: string dates (skip "Приложение"/"Распоряжение" lines)
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

  const vessels: DprVessel[] = [];
  let i = hRow + 1;

  while (i < rows.length) {
    const row = rows[i];
    if (!row) { i++; continue; }

    const name = C.name >= 0 ? row[C.name] : null;
    const stat = C.stat >= 0 ? row[C.stat] : null;

    if (!name || !String(name).trim() ||
      String(name).includes("Исполни") ||
      String(name).includes("беспеч")) { i++; continue; }

    const statStr = stat ? String(stat).trim() : "";
    if (!statStr || statStr === "0") { i += 5; continue; }

    const limVal = C.lim >= 0 ? row[C.lim] : null;
    if (typeof limVal === "number" && limVal > 0 && limVal < 43831) { i += 5; continue; }
    if (limVal && /201[0-9]/.test(String(limVal))) { i += 5; continue; }

    // Also check all cells in the row for stale Excel dates (before 2020)
    let staleRow = false;
    for (const cell of row) {
      if (typeof cell === "number" && cell > 30000 && cell < 43831) { staleRow = true; break; }
    }
    if (staleRow) { i += 5; continue; }

    const supplies: DprSupply[] = [];
    const coordParts: string[] = [];
    for (let j = 0; j < 5 && i + j < rows.length; j++) {
      const sr = rows[i + j];
      if (!sr) continue;
      if (C.pos >= 0 && sr[C.pos]) {
        const cv = String(sr[C.pos]).trim();
        if (cv && cv !== "0") coordParts.push(cv);
      }
      const ft = C.sup >= 0 ? sr[C.sup] : null;
      if (ft && String(ft).trim()) {
        supplies.push({
          type: String(ft).trim(),
          amt: C.amt >= 0 && sr[C.amt] != null ? String(sr[C.amt]) : "—",
          pct: C.pct >= 0 && sr[C.pct] != null ? String(sr[C.pct]) : "",
          cons: C.cons >= 0 && sr[C.cons] != null ? String(sr[C.cons]) : "—",
          lim: C.lim >= 0 && sr[C.lim] ? fmtDate(sr[C.lim]) : "",
          del: C.del >= 0 && sr[C.del] ? fmtDate(sr[C.del]) : "",
        });
      }
    }

    const coordRaw = coordParts.join(" ").trim();
    const coords = parseCoord(coordRaw);

    vessels.push({
      name: String(name).trim(),
      branch: C.fil >= 0 && row[C.fil] ? String(row[C.fil]).trim() : "",
      status: statStr,
      coordRaw,
      lat: coords ? coords[0] : null,
      lng: coords ? coords[1] : null,
      note: C.note >= 0 && row[C.note] ? String(row[C.note]).trim() : "",
      supplies,
      reportDate: date,
    });

    i += 5;
  }
  return vessels;
}

/* ── Full pipeline: ArrayBuffer[] → DprVessel[] ── */
export async function parseMsgFiles(files: File[]): Promise<{ vessels: DprVessel[]; date: Date | null }> {
  let reportDate: Date | null = null;
  const all: DprVessel[] = [];

  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      const rows = await extractXlsx(buf);
      if (!rows) continue;
      const vs = parseFilial(rows);
      if (vs.length) {
        if (!reportDate && vs[0].reportDate) reportDate = vs[0].reportDate;
        all.push(...vs);
      }
    } catch (e) {
      console.error("Parse error:", f.name, e);
    }
  }

 // Dedupe by name (prefer entry with more data)
  const map = new Map<string, DprVessel>();
  all.forEach((v) => {
    const key = v.name.toUpperCase().trim();
    const existing = map.get(key);
    if (!existing || (!existing.branch && v.branch) || (!existing.lat && v.lat)) {
      map.set(key, v);
    }
  });
  return { vessels: Array.from(map.values()), date: reportDate };
}
