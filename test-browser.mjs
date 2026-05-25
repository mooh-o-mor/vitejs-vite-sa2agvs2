import { chromium } from './node_modules/playwright/index.mjs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DPR_DIR = resolve(__dirname, 'dpr');

const ALL_FILES = [
  'DPR PORT 25.05.2026 08.00 MSK BERINGOV PROLIV.msg',
  'Re_ДПР_Море_25_05_2026_сбс_Меркурий_на_0800_МСК.msg',
  'ДПР_ПОРТ_Спасатель_Заборщиков_25_05_2026.msg',
  'ДПР  ОТХОД 21.05.2026 ССН ИГОРЬ ИЛЬИН.msg',
  'ДПР  ПРИХОД 23.05.2026 ССН ИГОРЬ ИЛЬИН.msg',
  'Re_ДПР_Отход_23_05_2026_сбс_Меркурий_на_1700_МСК.msg',
  'ДПР_ПРИХОД_05_05_2026_сбс_Меркурий_на_2240_мск.msg',
].map(f => resolve(DPR_DIR, f));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const consoleLogs = [];
page.on('console', msg => {
  const text = msg.text().slice(0, 500);
  consoleLogs.push('[' + msg.type() + '] ' + text);
  if (['error', 'warn'].includes(msg.type())) console.log('[' + msg.type() + ']', text);
});
page.on('pageerror', err => console.log('[PAGEERR]', err.message.slice(0, 300)));

await page.goto('http://localhost:5177', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.body.innerText.includes('Загрузка данных'), { timeout: 15000 });

// Login
await page.getByText('🔒 Войти').click();
await page.waitForTimeout(500);
await page.locator('input[type="password"]').fill('vjhcgfc');
await page.locator('div').filter({ hasText: /^🔒 Вход/ }).locator('button', { hasText: 'Войти' }).click();
await page.waitForTimeout(500);

// Navigate to map — stay on default "ДПР филиалов" tab
await page.getByText('🗺 Карта флота').click();
await page.waitForTimeout(1200);
console.log('On map (ДПР филиалов by default)');

// Upload files
console.log('Uploading', ALL_FILES.length, 'files...');
await page.locator('input[type="file"]').first().setInputFiles(ALL_FILES);

// Wait for upload completion
try {
  await page.waitForFunction(
    () => {
      const t = document.body.innerText;
      return t.includes('Загружено') || t.includes('Ошибка') || t.includes('не найдены') || t.includes('не определена');
    },
    { timeout: 25000 }
  );
} catch {
  console.log('WARNING: upload never completed after 25s');
}
await page.waitForTimeout(3000); // wait for Supabase fetch + React re-render

// Get upload message
const uploadMsg = await page.evaluate(() => {
  const all = [...document.querySelectorAll('*')];
  for (const el of all) {
    const t = (el.childNodes.length === 1 && el.firstChild?.nodeType === 3)
      ? el.textContent?.trim() || ''
      : '';
    if (t.length > 5 && t.length < 120 && (t.includes('Загружено') || t.includes('Ошибка') || t.includes('не найдены'))) {
      return t;
    }
  }
  return '(upload message not found)';
});
console.log('\n=== Upload message:', uploadMsg);

// Get sidebar vessel list
const vesselListText = await page.evaluate(() => {
  const body = document.body.innerText;
  const idx = body.indexOf('ДПР филиалов');
  if (idx < 0) return 'ДПР филиалов section not found in body';
  return body.slice(idx, idx + 1000);
});
console.log('\n=== ДПР филиалов section:\n', vesselListText);

// Get all visible text around vessel names
const vesselNames = await page.evaluate(() => {
  const names = [];
  const vessels = ['берингов', 'меркурий', 'спасатель'];
  const body = document.body.innerText;
  for (const v of vessels) {
    const idx = body.toLowerCase().indexOf(v);
    if (idx >= 0) {
      names.push(body.slice(Math.max(0, idx - 20), idx + 80).trim());
    }
  }
  return names;
});
console.log('\n=== Vessel name mentions:');
vesselNames.forEach(n => console.log(' -', n));

// Console errors
const errors = consoleLogs.filter(l => l.startsWith('[error]') || l.startsWith('[warn]'));
if (errors.length) {
  console.log('\n=== Console errors/warnings:');
  errors.forEach(l => console.log(l));
} else {
  console.log('\n=== No console errors ✓');
}

await browser.close();
