import XLSX from "xlsx-js-style";
import JSZip from "jszip";
import { VESSEL_NAME_ALIASES } from "./fleetTypes";
import { findPortCoords } from "./locationNormalizer";

const CFB: any = (XLSX as any).CFB;

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
  /** Set for text/Word DPR from vessels (not XLSX filial DPR) */
  isTextDpr?: boolean;
  dprType?: "море" | "порт";
  rawFields?: Record<string, string>;
  emailSubject?: string;
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
  /** Сырые поля ДПР (только для источника vessel_dpr) */
  fields_json?: Record<string, string> | null;
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
  if (fu.startsWith("АСГ") || fu === "ASG") {
    status = "АСГ";
    extraFromFirst = firstPart.slice(3).trim();
  } else if (fu.startsWith("АСД") || fu === "ASD") {
    status = "АСД";
    extraFromFirst = firstPart.slice(3).trim();
  } else if (fu.startsWith("РЕМ") || /РЕМОНТ|ТЕХ|ОСВИДЕТ|REMONT|REPAIR|TECH/i.test(fu)) {
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

  const m1 = s.match(/(\d{1,3})-(\d{1,2}[,.]?\d*)\s*[NСNнс]\s*(\d{1,3})-(\d{1,2}[,.]?\d*)\s*[EВЕEвеe]/i);
  if (m1) {
    const lat = +m1[1] + +m1[2].replace(",", ".") / 60;
    const lng = +m1[3] + +m1[4].replace(",", ".") / 60;
    if (lat > 0 && lat < 90 && lng > 0 && lng < 180) return [lat, lng];
  }

  const m2 = s.match(/(\d{1,3})°(\d{1,2}[,.]?\d*)\s*[NСNнс]\s*[\/]?\s*(\d{1,3})°(\d{1,2}[,.]?\d*)\s*[EВЕEвеe]/i);
  if (m2) {
    const lat = +m2[1] + +m2[2].replace(",", ".") / 60;
    const lng = +m2[3] + +m2[4].replace(",", ".") / 60;
    if (lat > 0 && lat < 90 && lng > 0 && lng < 180) return [lat, lng];
  }

  const m3 = s.match(/(\d{1,3})\s+(\d{1,2}[,.]?\d*)\s*[NСNнс][\/\s]*(\d{1,3})\s+(\d{1,2}[,.]?\d*)\s*[EВЕEвеe]/i);
  if (m3) {
    const lat = +m3[1] + +m3[2].replace(",", ".") / 60;
    const lng = +m3[3] + +m3[4].replace(",", ".") / 60;
    if (lat > 0 && lat < 90 && lng > 0 && lng < 180) return [lat, lng];
  }

  const m4 = s.match(/(\d{1,3})\s+(\d{1,2}[,.]?\d*)\s*(?:сев|с)[.\s]*(\d{1,3})\s+(\d{1,2}[,.]?\d*)\s*(?:вост|в)[.\s]/i);
  if (m4) {
    const lat = +m4[1] + +m4[2].replace(",", ".") / 60;
    const lng = +m4[3] + +m4[4].replace(",", ".") / 60;
    if (lat > 0 && lat < 90 && lng > 0 && lng < 180) return [lat, lng];
  }

  const m5 = s.match(/(\d{1,3})\.(\d{1,2})\s*[NСNнс]\s*(\d{1,3})\.(\d{1,2})\s*[EВЕEвеe]/i);
  if (m5) {
    const lat = +m5[1] + +m5[2] / 60;
    const lng = +m5[3] + +m5[4] / 60;
    if (lat > 0 && lat < 90 && lng > 0 && lng < 180) return [lat, lng];
  }

  // 36.47,3N 122.10,8E (dot as deg-min separator, comma as decimal in minutes)
  const m5b = s.match(/(\d{1,3})\.(\d{1,2}[,.]?\d*)\s*[NСNнс]\s*(\d{1,3})\.(\d{1,2}[,.]?\d*)\s*[EВЕEвеe]/i);
  if (m5b) {
    const lat = +m5b[1] + +m5b[2].replace(",", ".") / 60;
    const lng = +m5b[3] + +m5b[4].replace(",", ".") / 60;
    if (lat > 0 && lat < 90 && lng > 0 && lng < 180) return [lat, lng];
  }

  // Ш=55 31,6С Д=20 08,7В
  const m6 = s.match(/Ш\s*=\s*(\d{1,3})\s+(\d{1,2}[,.]?\d*)\s*([СЮ])\s+Д\s*=\s*(\d{1,3})\s+(\d{1,2}[,.]?\d*)\s*([ВЗ])/i);
  if (m6) {
    const lat = (+m6[1] + +m6[2].replace(",", ".") / 60) * (m6[3].toUpperCase() === "Ю" ? -1 : 1);
    const lng = (+m6[4] + +m6[5].replace(",", ".") / 60) * (m6[6].toUpperCase() === "З" ? -1 : 1);
    if (Math.abs(lat) < 90 && Math.abs(lng) < 180) return [lat, lng];
  }

  return findPortCoords(s);
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

  // Step A: try CFB-based extraction for MSG files (proper sector chain walking)
  try {
    const cfb = CFB.read(u8, { type: "array" });
    const attachDataPaths: string[] = [];
    for (const fp of cfb.FullPaths || []) {
      if (/\/__substg1\.0_37010102$/i.test(fp)) {
        attachDataPaths.push(fp);
      }
    }
    for (const fp of attachDataPaths) {
      try {
        const f = CFB.find(cfb, fp);
        if (f?.content) {
          const wb = XLSX.read(new Uint8Array(f.content), { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
          const txt = JSON.stringify(rows.slice(0, 12));
          if (
            /[\\u0400-\\u04ff]/.test(txt) &&
            rows.some((r) => r && r.some((v: any) => v && String(v).includes("Название судна")))
          ) {
            return rows;
          }
        }
      } catch (_) {}
    }
  } catch (_) {}

  // Step B: fallback byte-scan (existing logic)
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

/* ── MSG CFB helpers ── */

/** Извлечение вложений из MSG через CFB */
function extractMsgAttachments(buf: ArrayBuffer): Array<{ name: string; data: Uint8Array }> {
  const attachments: Array<{ name: string; data: Uint8Array }> = [];
  try {
    const cfb = CFB.read(new Uint8Array(buf), { type: "array" });
    const fullPaths: string[] = cfb.FullPaths || [];

    // Find all attachment binary data paths
    const dataPaths = fullPaths.filter((fp) =>
      /\/__substg1\.0_37010102$/i.test(fp)
    );

    for (const dataPath of dataPaths) {
      try {
        // Extract directory prefix (everything before /__substg1.0_37010102)
        const dirPrefix = dataPath.replace(/\/__substg1\.0_37010102$/i, "");

        // Get filename: prefer display name (3707001F), fallback to extension (3704001F)
        let fileName = "";
        const namePath = dirPrefix + "/__substg1.0_3707001F";
        const extPath = dirPrefix + "/__substg1.0_3704001F";

        try {
          const nameEntry = CFB.find(cfb, namePath);
          if (nameEntry?.content) {
            const raw = new Uint8Array(nameEntry.content);
            fileName = new TextDecoder("utf-16le")
              .decode(raw)
              .replace(/\0/g, "")
              .trim();
          }
        } catch (_) {}

        try {
          const extEntry = CFB.find(cfb, extPath);
          if (extEntry?.content) {
            const raw = new Uint8Array(extEntry.content);
            const ext = new TextDecoder("utf-16le")
              .decode(raw)
              .replace(/\0/g, "")
              .trim();
            if (!fileName) {
              fileName = ext;
            }
          }
        } catch (_) {}

        if (!fileName) {
          // Generate fallback name from directory ID
          const dirMatch = dataPath.match(
            /__attach_version1\.0_#([0-9A-F]+)/i
          );
          fileName = dirMatch
            ? `attachment_${dirMatch[1]}.bin`
            : "attachment.bin";
        }

        // Get binary data
        const dataEntry = CFB.find(cfb, dataPath);
        if (dataEntry?.content) {
          attachments.push({
            name: fileName,
            data: new Uint8Array(dataEntry.content),
          });
        }
      } catch (_) {}
    }
  } catch (_) {}
  return attachments;
}

/** Извлечение текстового тела из MSG */
function extractMsgBody(buf: ArrayBuffer): string | null {
  try {
    const cfb = CFB.read(new Uint8Array(buf), { type: "array" });
    const f = CFB.find(cfb, "Root Entry/__substg1.0_1000001F");
    if (f?.content) {
      const raw = new Uint8Array(f.content);
      return new TextDecoder("utf-16le")
        .decode(raw)
        .replace(/\0/g, "")
        .trim();
    }
  } catch (_) {}
  return null;
}

/** Извлечение темы письма из MSG */
function extractMsgSubject(buf: ArrayBuffer): string | null {
  try {
    const cfb = CFB.read(new Uint8Array(buf), { type: "array" });
    const f = CFB.find(cfb, "Root Entry/__substg1.0_0037001F");
    if (f?.content) {
      const raw = new Uint8Array(f.content);
      return new TextDecoder("utf-16le")
        .decode(raw)
        .replace(/\0/g, "")
        .trim();
    }
  } catch (_) {}
  return null;
}

/* ── DOCX text extraction ── */

async function extractTextFromDocx(data: Uint8Array): Promise<string[] | null> {
  try {
    const zip = await JSZip.loadAsync(data);
    const docXml = zip.file("word/document.xml");
    if (!docXml) return null;
    const xmlText = await docXml.async("text");

    // Decode XML entities
    const decodeXml = (s: string) =>
      s
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));

    // Extract paragraphs
    const paragraphs: string[] = [];
    const pRegex = /<w:p[^>]*>([\s\S]*?)<\/w:p>/g;
    let pMatch: RegExpExecArray | null | null;
    while ((pMatch = pRegex.exec(xmlText)) !== null) {
      const pContent = pMatch[1];
      const tRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
      let line = "";
      let tMatch: RegExpExecArray | null | null;
      while ((tMatch = tRegex.exec(pContent)) !== null) {
        line += tMatch[1];
      }
      line = decodeXml(line).trim();
      if (line) {
        paragraphs.push(line);
      }
    }
    return paragraphs.length > 0 ? paragraphs : null;
  } catch (_) {
    return null;
  }
}

/* ── DOC (binary Word) text extraction ── */

function extractTextFromDoc(data: Uint8Array): string {
  const chars: string[] = [];
  for (let i = 0; i < data.length - 1; i++) {
    const b1 = data[i];
    const b2 = data[i + 1];
    if (b2 === 0x00 && b1 >= 0x20 && b1 <= 0x7e) {
      chars.push(String.fromCharCode(b1));
      i++; // skip next byte
    } else if (b2 === 0x04 && b1 >= 0x00 && b1 <= 0xff) {
      chars.push(String.fromCharCode(0x0400 + b1));
      i++; // skip next byte
    }
  }
  let text = chars.join("");
  text = text.replace(/[^\x20-\x7EА-Яа-яёЁ\n\r\t./:\-]/g, "").replace(/\s+/g, " ");
  return text.trim();
}

/* ── DPR text type detection ── */

type DprTextType = "море" | "порт" | "отход" | "приход" | null;

/** Check if text has numbered DPR-style lines (e.g., "1.Title" or "1. Title") */
function hasNumberedLines(text: string): boolean {
  return /(?:^|\n)\s*\d+\s*[.)]/m.test(text);
}

/* ── Latin → Cyrillic transliteration ── */

/** Multi-character Latin sequences → Cyrillic (processed first) */
const LAT_TO_CYR_MULTI: [RegExp, string][] = [
  [/shch/gi, "щ"],
  [/sch/gi, "щ"],
  [/kh/gi, "х"],
  [/zh/gi, "ж"],
  [/ch/gi, "ч"],
  [/sh/gi, "ш"],
  [/ts/gi, "ц"],
  [/yu/gi, "ю"],
  [/ya/gi, "я"],
  [/yo/gi, "ё"],
  [/ye/gi, "е"],
];

/** Single-character Latin → Cyrillic */
const LAT_TO_CYR_SINGLE: Record<string, string> = {
  a: "а", b: "б", v: "в", g: "г", d: "д", e: "е",
  z: "з", i: "и", j: "й", k: "к", l: "л", m: "м",
  n: "н", o: "о", p: "п", r: "р", s: "с", t: "т",
  u: "у", f: "ф", h: "х", c: "ц", y: "ы",
};

/**
 * Транслитерирует латинское имя судна/порта в кириллицу.
 * Если имя уже содержит кириллицу — возвращает как есть.
 */
function transliterateLatinToCyrillic(name: string): string {
  // If already Cyrillic, don't touch
  if (/[а-яё]/i.test(name)) return name;

  let result = name;
  // Multi-char sequences first
  for (const [re, replacement] of LAT_TO_CYR_MULTI) {
    result = result.replace(re, replacement);
  }
  // Single char mapping
  result = result
    .split("")
    .map((ch) => {
      const lower = ch.toLowerCase();
      const cyr = LAT_TO_CYR_SINGLE[lower];
      if (!cyr) return ch; // keep unmapped chars (digits, punctuation)
      return ch === lower ? cyr : cyr.toUpperCase();
    })
    .join("");

  return result;
}

function detectDprType(lines: string[], subject?: string): DprTextType {
  const combined = lines.slice(0, Math.min(5, lines.length)).join(" ");
  if (/ДПР[.\s]*МОРЕ|DPR[.\s\/]*MORE|DPR[.\s\/]*SEA/i.test(combined)) return "море";
  if (/ДПР[.\s]*ПОРТ|DPR[.\s\/]*PORT/i.test(combined)) return "порт";
  if (/ДПР[.\s]*ОТХОД/i.test(combined)) return "отход";
  if (/ДПР[.\s]*ПРИХОД/i.test(combined)) return "приход";

  // Fallback: check subject
  if (subject) {
    if (/ОТХОД/i.test(subject)) return "отход";
    if (/ПРИХОД/i.test(subject)) return "приход";
    if (/ПОРТ|PORT/i.test(subject)) return "порт";
    if (/МОРЕ|MORE|SEA/i.test(subject)) return "море";
  }

  return null;
}

/* ── Field extraction by number ── */

function extractDprField(lines: string[], fieldNum: number): string {
  const labelRe = /название|состояние судна|дата.месяц|местоположен|запасы|погода|курс\s*\/|бюджет времени|механизм|количество.*экипаж|eta\b|порт.*назначен|сроки.*запасов|предполагаем|дополнительн|порт отход|порт.*цель|осадки|электропит/i;

  for (let i = 0; i < lines.length; i++) {
    const lineMatch = lines[i].match(new RegExp(`^\\s*${fieldNum}\\s*[.)]\\s*(.*)`, "i"));
    if (!lineMatch) continue;
    const content = lineMatch[1].trim();

    // Check if content is a label
    if (labelRe.test(content)) {
      // Variant C: label + ": N. value" on same line (same field number)
      const selfMatch = content.match(/:\s*(\d+)[.)\s]\s*(.+)/);
      if (selfMatch && parseInt(selfMatch[1]) === fieldNum) {
        return selfMatch[2].trim();
      }

      // Variant C-3: label immediately followed by "N. value" (DOC format, no colon).
      // E.g. "Дата/месяц/год / 0800 МСК 3. 25/05/2026"
      const inlineN = content.indexOf(`${fieldNum}.`);
      const inlineNParen = content.indexOf(`${fieldNum})`);
      const inlinePos = Math.min(
        inlineN > 0 ? inlineN : Infinity,
        inlineNParen > 0 ? inlineNParen : Infinity
      );
      if (inlinePos > 0 && inlinePos < Infinity) {
        const suffix = content.slice(inlinePos);
        const dupRe = new RegExp(`^${fieldNum}\\s*[.)]\\s*`, "i");
        const val = suffix.replace(dupRe, "").trim();
        if (val && !labelRe.test(val)) {
          return val;
        }
      }

      // Variant C-2: label + ": value" without repeated number.
      const hasNextWithSameNum =
        i + 1 < lines.length &&
        new RegExp(`^\\s*${fieldNum}\\s*[.)]`, "i").test(lines[i + 1]?.trim() || "");

      if (!hasNextWithSameNum) {
        const colonMatch = content.match(/:\s*(.+)/);
        if (colonMatch) {
          const val = colonMatch[1].trim();
          if (val && !labelRe.test(val) && val.length < 80) {
            return val;
          }
        }
      }

      // Variant B: label → next paragraph is the value.
      // Strip repeated "N. " prefix from value (DOC format quirk).
      if (i + 1 < lines.length) {
        // Skip blank lines
        let next = i + 1;
        while (next < lines.length && !lines[next].trim()) next++;
        if (next < lines.length) {
          let value = lines[next].trim();
          // Remove duplicated "N. " or "N) " prefix
          const dupRe = new RegExp(`^${fieldNum}\\s*[.)]\\s*`, "i");
          value = value.replace(dupRe, "").trim();
          return value;
        }
      }
      return content;
    }

    // Variant A/D: value directly after N.
    return content;
  }
  return "";
}

/* ── Supplies parsing from text ── */

function parseSuppliesFromText(raw: string): DprSupply[] {
  if (!raw || !raw.trim()) return [];

  const supplies: DprSupply[] = [];
  const tokens = raw.split(/\s*\/\s*/);

  for (const token of tokens) {
    const t = token.trim();
    if (!t || /^(нет|net|-)$/i.test(t)) continue;

    // Determine type (IFO = ДТ, MGO = ТТ)
    let type = "";
    if (/^ДТ|^DT|^IFO/i.test(t)) type = "ДТ";
    else if (/^ТТ|^TT|^MGO/i.test(t)) type = "ТТ";
    else if (/^М$|^M$/i.test(t) || /^М\s/.test(t) || /^M\s/.test(t)) type = "М";
    else if (/^В$|^V$/i.test(t) || /^В\s/.test(t) || /^V\s/.test(t)) type = "В";
    else if (/^П$|^P$/i.test(t) || /^П\s/.test(t) || /^P\s/.test(t)) type = "П";
    else continue;

    // Extract amounts: first number is amt, second is cons (or after dash)
    const numRe = /(\d[\d\s]*[\d,.]*\d*)/g;
    const nums: string[] = [];
    let m: RegExpExecArray | null | null;
    while ((m = numRe.exec(t)) !== null) {
      nums.push(m[1].replace(/\s/g, "").replace(",", "."));
    }

    let amt = nums.length > 0 ? nums[0] : "";

    // Check for consumption after dash/em-dash
    const dashMatch = t.match(/[-–—]\s*(\d[\d\s]*[\d,.]*\d*)/);
    let cons = "";
    if (dashMatch) {
      cons = dashMatch[1].replace(/\s/g, "").replace(",", ".");
    } else if (nums.length > 1) {
      cons = nums[1];
    }

    // Normalize OO → 0
    if (/^OO$/i.test(cons) || /^oo$/i.test(cons)) cons = "0";

    // Конвертация кг → тонны для топлива (ДТ, ТТ):
    // остатки > 2000 или расход > 50 — значит данные в килограммах
    if (type === "ДТ" || type === "ТТ") {
      const amtNum = parseFloat(amt);
      const consNum = parseFloat(cons);
      if (!isNaN(amtNum) && amtNum > 2000) {
        amt = (amtNum / 1000).toFixed(1);
      }
      if (!isNaN(consNum) && consNum > 50) {
        cons = (consNum / 1000).toFixed(1);
      }
    }

    // Extract percentage
    const pctMatch = t.match(/\(?(\d{1,3}[,.]?\d*)\s*%\)?/);
    const pct = pctMatch ? pctMatch[1].replace(",", ".") : "";

    supplies.push({
      type,
      amt,
      pct,
      cons,
      lim: "",
      del: "",
    });
  }

  return supplies;
}

/* ── Date parsing from field 3 ── */

function parseDateFromField3(raw: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();

  // DD.MM.YYYY or DD/MM/YYYY
  const m1 = s.match(/(\d{1,2})\s*[/.]\s*(\d{1,2})\s*[/.]\s*(20[2-9]\d)/);
  if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1]);

  // YYYY-MM-DD or YYYY/MM/DD (ISO)
  const m2 = s.match(/(20[2-9]\d)[-./](\d{1,2})[-./](\d{1,2})/);
  if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]);

  return null;
}

/* ── DPR/MOPE parser ── */

function parseDprMore(lines: string[], subject?: string): DprVessel | null {
  // field 1 → name
  const f1 = extractDprField(lines, 1);
  if (!f1) return null;

  let name = f1;
  // Strip vessel type prefix, lowercase, transliterate, apply aliases
  name = name
    .replace(
      /^(мфасс|тбс|ссн|асс|нис|мбс|мвс|мб|скб|всп|ппб|сбс|рвк|б\/с|с\/б|вс|асптр|мсс|пкс|мтб|гс|кп)\s+/i,
      ""
    )
    .trim();
  name = name.replace(/\s+/g, " ").toLowerCase();
  name = transliterateLatinToCyrillic(name);
  name = VESSEL_NAME_ALIASES[name] ?? name;

  // field 2 → status
  const f2 = extractDprField(lines, 2);
  const { status: cleanStatus, extra: statusExtra } = normalizeStatus(f2);

  // field 3 → reportDate
  const f3 = extractDprField(lines, 3);
  const reportDate = parseDateFromField3(f3);

  // field 4 → coordRaw
  const f4 = extractDprField(lines, 4);
  const coords = parseCoord(f4);

  // field 5 → supplies
  const f5 = extractDprField(lines, 5);
  const supplies = parseSuppliesFromText(f5);

  // field 11 → note (ETA / work area)
  const f11 = extractDprField(lines, 11);
  const note = [statusExtra, f11].filter(Boolean).join(" / ");

  // field 12 → supply dates: update supplies[i].lim
  const f12 = extractDprField(lines, 12);
  if (f12) {
    const dateTokens = f12.split(/\s*\/\s*/);
    for (const dt of dateTokens) {
      const dm = dt.match(/^(ДТ|DT|ТТ|TT|М|M|В|V|П|P)\s*[-–—]\s*(\d{1,2}[./]\d{1,2}[./]\d{2,4})/i);
      if (dm) {
        let typeKey = dm[1].toUpperCase();
        if (typeKey === "DT") typeKey = "ДТ";
        if (typeKey === "TT") typeKey = "ТТ";
        const dateStr = dm[2].replace(/\./g, ".").trim();
        for (const s of supplies) {
          if (s.type === typeKey) {
            s.lim = dateStr;
          }
        }
      }
    }
  }

  // Collect raw fields for vessel_dpr
  const rawFields: Record<string, string> = {};
  for (let n = 1; n <= 15; n++) {
    const v = extractDprField(lines, n);
    if (v) rawFields[String(n)] = v;
  }

  return {
    name,
    branch: "",
    status: cleanStatus,
    coordRaw: f4,
    lat: coords ? coords[0] : null,
    lng: coords ? coords[1] : null,
    note,
    supplies,
    reportDate,
    contract_info: "",
    work_period: "",
    isTextDpr: true,
    dprType: "море",
    rawFields,
    emailSubject: subject || "",
  };
}

/* ── DPR/PORT parser ── */

function parseDprPort(lines: string[], subject?: string): DprVessel | null {
  // field 1 → name
  const f1 = extractDprField(lines, 1);
  if (!f1) return null;

  let name = f1;
  name = name
    .replace(
      /^(мфасс|тбс|ссн|асс|нис|мбс|мвс|мб|скб|всп|ппб|сбс|рвк|б\/с|с\/б|вс|асптр|мсс|пкс|мтб|гс|кп)\s+/i,
      ""
    )
    .trim();
  name = name.replace(/\s+/g, " ").toLowerCase();
  name = transliterateLatinToCyrillic(name);
  name = VESSEL_NAME_ALIASES[name] ?? name;

  // field 2 → status
  const f2 = extractDprField(lines, 2);
  const { status: cleanStatus, extra: statusExtra } = normalizeStatus(f2);

  // field 3 → reportDate
  const f3 = extractDprField(lines, 3);
  const reportDate = parseDateFromField3(f3);

  // field 4 → coordRaw (port name, parseCoord will fallback to findPortCoords)
  const f4 = extractDprField(lines, 4);
  const coords = parseCoord(f4);

  // field 5 → supplies
  const f5 = extractDprField(lines, 5);
  const supplies = parseSuppliesFromText(f5);

  // fields 8 + 9 → note
  const f8 = extractDprField(lines, 8);
  const f9 = extractDprField(lines, 9);
  const note = [statusExtra, f8, f9].filter(Boolean).join(" / ");

  // Collect raw fields for vessel_dpr
  const rawFields: Record<string, string> = {};
  for (let n = 1; n <= 12; n++) {
    const v = extractDprField(lines, n);
    if (v) rawFields[String(n)] = v;
  }

  return {
    name,
    branch: "",
    status: cleanStatus,
    coordRaw: f4,
    lat: coords ? coords[0] : null,
    lng: coords ? coords[1] : null,
    note,
    supplies,
    reportDate,
    contract_info: "",
    work_period: "",
    isTextDpr: true,
    dprType: "порт",
    rawFields,
    emailSubject: subject || "",
  };
}

/* ── Try parse MSG as text/numbered DPR ── */

async function tryParseMsgAsTextDpr(buf: ArrayBuffer): Promise<DprVessel | null> {
  try {
    // Get subject for type detection
    const subject = extractMsgSubject(buf);

    // Collect lines
    let lines: string[] | null = null;

    // Try attachments first
    const attachments = extractMsgAttachments(buf);
    for (const att of attachments) {
      const nameLower = att.name.toLowerCase();
      if (nameLower.endsWith(".docx")) {
        const paragraphs = await extractTextFromDocx(att.data);
        if (paragraphs) {
          lines = paragraphs;
          break;
        }
      } else if (nameLower.endsWith(".doc")) {
        const text = extractTextFromDoc(att.data);
        if (text) {
          // DOC binary extraction often produces one continuous string.
          // Insert newlines at numbered field boundaries (1-2 digit numbers
          // followed by . or ), preceded by a 4-digit year or non-digit).
          // Use [А-ЯA-Z] lookahead to avoid splitting on date components.
          const withBreaks = text.replace(
            /(\d{4}|\D)(\d{1,2}\s*[.)](?=\s*[А-ЯA-Z]))/g,
            "$1\n$2"
          );
          lines = withBreaks
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          break;
        }
      } else if (nameLower.endsWith(".txt") || nameLower.endsWith(".dat")) {
        // Plain text attachments (including .dat — BERINGOV-style)
        try {
          const text = new TextDecoder("utf-8").decode(att.data);
          if (text.trim() && hasNumberedLines(text)) {
            lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            break;
          }
        } catch (_) {}
      } else {
        // Unknown extension: try as UTF-8 text
        try {
          const text = new TextDecoder("utf-8").decode(att.data);
          if (text.trim() && hasNumberedLines(text)) {
            lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            break;
          }
        } catch (_) {}

        // Also try as UTF-16LE (some MSG inline attachments)
        try {
          const text = new TextDecoder("utf-16le").decode(att.data);
          if (text.trim() && hasNumberedLines(text)) {
            lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            break;
          }
        } catch (_) {}
      }
    }

    // Fallback: body text
    if (!lines) {
      const body = extractMsgBody(buf);
      if (body) {
        lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      }
    }

    if (!lines || lines.length === 0) return null;

    const dprType = detectDprType(lines, subject);
    if (!dprType || dprType === "отход" || dprType === "приход") return null;

    if (dprType === "море") return parseDprMore(lines, subject);
    if (dprType === "порт") return parseDprPort(lines, subject);

    return null;
  } catch (_) {
    return null;
  }
}

/* ── Filial data parser ── */
export function parseFilial(rows: any[][], branchMap?: Map<string, string>): DprVessel[] {
  let hRow = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    if (rows[i] && rows[i].some((v: any) => v && String(v).includes("Название судна"))) {
      hRow = i;
      break;
    }
  }
  if (hRow < 0) return [];

  const H = rows[hRow];
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

  // Фолбэк: если amt не найден — ставим после sup (формат СХЛФ)
  if (C.amt < 0 && C.sup >= 0) {
    C.amt = C.sup + 1;
  }

  // Фолбэк: если pos не найден — ставим после stat
  if (C.pos < 0 && C.stat >= 0 && C.sup >= 0 && C.sup - C.stat === 2) {
    C.pos = C.stat + 1;
  }

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
    const hasSupplyData = C.sup >= 0 && row[C.sup] && String(row[C.sup]).trim();

    // Пропускаем если нет ни статуса ни запасов
    if (!statStr && !hasSupplyData) { i += 5; continue; }
    if (statStr === "0") { i += 5; continue; }

    // Проверяем дату лимита — если устаревшая, пропускаем всё судно
    const limVal = C.lim >= 0 ? row[C.lim] : null;
    if (isStaleDate(limVal)) { i += 5; continue; }

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
        const supplyLim = C.lim >= 0 ? sr[C.lim] : null;
        if (isStaleDate(supplyLim)) continue;
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
    // Отсекаем диспетчерский тип-префикс (МБ, МФАСС, ТБС и др.) — авторитетный тип берётся из fleet.xlsx
    vesselName = vesselName.replace(
      /^(мфасс|тбс|ссн|асс|нис|мбс|мвс|мб|скб|всп|ппб|сбс|рвк|б\/с|с\/б|вс|асптр|мсс|пкс|мтб|гс|кп)\s+/i,
      ""
    ).trim();
    vesselName = vesselName.toLowerCase();
    // Применяем алиасы: латиница → кириллица и прочие нормализации
    vesselName = VESSEL_NAME_ALIASES[vesselName] ?? vesselName;

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

  // Если статус не АСГ/АСД/РЕМ — берём предыдущий с правилом
  for (let k = 1; k < vessels.length; k++) {
    const s = vessels[k].status.toUpperCase();
    if (!["АСГ", "АСД", "РЕМ"].includes(s)) {
      const prev = vessels[k - 1].status.toUpperCase();
      vessels[k].status = prev === "АСД" ? "АСД" : "АСГ";
    }
  }

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
  let reportDate: Date | null = null;
  const all: DprVessel[] = [];

  for (const f of files) {
    try {
      let rows: any[][] | null = null;
      let buf: ArrayBuffer | null = null;

      if (f.name.toLowerCase().endsWith(".eml")) {
        const text = await f.text();
        rows = await extractXlsxFromEml(text);
      } else {
        buf = await f.arrayBuffer();
        rows = await extractXlsx(buf);
      }

      if (rows) {
        // Step A: XLSX-based filial DPR
        const vs = parseFilial(rows, branchMap);
        if (vs.length) {
          if (!reportDate && vs[0].reportDate) reportDate = vs[0].reportDate;
          all.push(...vs);
        }
      } else if (buf && f.name.toLowerCase().endsWith(".msg")) {
        // Step B: try text/Word DPR from MSG
        const textDpr = await tryParseMsgAsTextDpr(buf);
        if (textDpr) {
          if (!reportDate && textDpr.reportDate) reportDate = textDpr.reportDate;
          all.push(textDpr);
        }
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
  return { vessels: Array.from(map.values()), date: reportDate };
}
