// Quick field dump for all 3 DPR files
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('./node_modules/xlsx-js-style/dist/xlsx.min.js');
const JSZip = require('./node_modules/jszip/dist/jszip.min.js');
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CFB = XLSX.CFB;

const FILES = [
  'DPR PORT 25.05.2026 08.00 MSK BERINGOV PROLIV.msg',
  'Re_ДПР_Море_25_05_2026_сбс_Меркурий_на_0800_МСК.msg',
  'ДПР_ПОРТ_Спасатель_Заборщиков_25_05_2026.msg',
];

function readUtf16(data) {
  try { return new TextDecoder('utf-16le').decode(data); } catch { return ''; }
}

function extractMsgSubject(buf) {
  try {
    const cfb = CFB.read(buf, { type: 'buffer' });
    for (const e of cfb.FileIndex) {
      if (e.name === '__substg1.0_0037001F') {
        return readUtf16(e.content).replace(/\0/g, '').trim();
      }
    }
  } catch {}
  return '';
}

function extractMsgSendTime(buf) {
  // PR_CLIENT_SUBMIT_TIME = 0x0039 type 0x0040
  // PR_MESSAGE_DELIVERY_TIME = 0x0E06 type 0x0040
  try {
    const cfb = CFB.read(buf, { type: 'buffer' });
    for (const propName of ['__substg1.0_00390040', '__substg1.0_0E060040']) {
      for (const e of cfb.FileIndex) {
        if (e.name === propName && e.content && e.content.length >= 8) {
          // FILETIME: 100-nanosecond intervals since 1601-01-01
          const lo = e.content[0] | (e.content[1]<<8) | (e.content[2]<<16) | (e.content[3]<<24);
          const hi = e.content[4] | (e.content[5]<<8) | (e.content[6]<<16) | (e.content[7]<<24);
          const loU = lo >>> 0, hiU = hi >>> 0;
          const ms = (hiU * 4294967296 + loU) / 10000 - 11644473600000;
          return new Date(ms).toISOString();
        }
      }
    }
  } catch {}
  return null;
}

async function extractLines(buf) {
  try {
    const cfb = CFB.read(buf, { type: 'buffer' });
    // Find attachments
    for (const e of cfb.FileIndex) {
      if (e.name === '__substg1.0_37010102' && e.content) {
        const data = e.content.buffer.slice(e.content.byteOffset, e.content.byteOffset + e.content.byteLength);
        // Try DOCX
        if (e.content[0] === 0x50 && e.content[1] === 0x4B) {
          try {
            const zip = await JSZip.loadAsync(data);
            const xml = await zip.file('word/document.xml')?.async('string');
            if (xml) {
              const paras = [];
              const re = /<w:p[ >][\s\S]*?<\/w:p>/g;
              let m;
              while ((m = re.exec(xml)) !== null) {
                const texts = [];
                const tr = /<w:t[^>]*>([^<]*)<\/w:t>/g;
                let t;
                while ((t = tr.exec(m[0])) !== null) texts.push(t[1]);
                const line = texts.join('').trim();
                if (line) paras.push(line);
              }
              return paras;
            }
          } catch {}
        }
        // Try plain text (UTF-8)
        const txt = new TextDecoder('utf-8').decode(data);
        if (/\d\.\s/.test(txt)) {
          return txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
        }
      }
    }
    // Try body
    for (const e of cfb.FileIndex) {
      if (e.name === '__substg1.0_1000001F' && e.content) {
        const body = readUtf16(e.content).replace(/\0/g, '');
        return body.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      }
    }
  } catch {}
  return [];
}

for (const fname of FILES) {
  const buf = readFileSync(resolve(__dirname, 'dpr', fname));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

  const subject = extractMsgSubject(ab);
  const sendTime = extractMsgSendTime(ab);
  const lines = await extractLines(ab);

  console.log('\n' + '='.repeat(60));
  console.log('FILE:', fname);
  console.log('SUBJECT:', subject);
  console.log('SEND TIME:', sendTime);
  console.log('FIELDS:');
  // Print all lines with their numbers
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    console.log(`  [${i}] ${lines[i].slice(0, 120)}`);
  }
}
