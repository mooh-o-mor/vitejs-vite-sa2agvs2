import { chromium } from './node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setViewportSize({ width: 1600, height: 950 });

await page.goto('http://localhost:5177', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.body.innerText.includes('Загрузка данных'), { timeout: 15000 });

await page.getByText('🔒 Войти').click();
await page.waitForTimeout(400);
await page.locator('input[type="password"]').fill('vjhcgfc');
await page.locator('div').filter({ hasText: /^🔒 Вход/ }).locator('button', { hasText: 'Войти' }).click();
await page.waitForTimeout(600);
await page.getByText('🗺 Карта флота').click();
await page.waitForTimeout(800);
await page.getByText('ДПР судов', { exact: false }).first().click();
await page.waitForTimeout(3000);

// Sidebar only
await page.screenshot({ path: 'map-sidebar.png', clip: { x: 0, y: 0, width: 280, height: 950 } });

// Get full SVG color of markers
const markerColors = await page.evaluate(() => {
  const markers = [...document.querySelectorAll('.leaflet-marker-icon')];
  return markers.slice(0, 15).map(m => {
    const path = m.querySelector('path');
    const fill = path?.getAttribute('fill') || path?.style?.fill || 'unknown';
    return fill;
  });
});
console.log('Marker fill colors:', markerColors);

// Get sidebar vessel entries with their colors/classes
const vesselEntries = await page.evaluate(() => {
  const entries = [];
  // Look for vessel list items - try various selectors
  const all = document.querySelectorAll('*');
  for (const el of all) {
    if (el.children.length === 0 || el.children.length < 5) {
      const txt = el.textContent?.trim() || '';
      const cls = el.className || '';
      if (txt.length > 3 && txt.length < 50 && /[а-яА-Я]/.test(txt) && !txt.includes('ДПР') && !txt.includes('Все') && !txt.includes('Тип')) {
        entries.push({ text: txt, class: typeof cls === 'string' ? cls.slice(0, 60) : '' });
      }
    }
  }
  return entries.slice(0, 30);
});
console.log('\nVessel sidebar entries:');
vesselEntries.forEach(e => console.log(`  [${e.class.slice(0,30)}] ${e.text}`));

// The big yellow box - what is it?
const yellowBox = await page.evaluate(() => {
  const el = document.querySelector('[class*="upload"], [class*="Upload"], [class*="drop"], [class*="Drop"]');
  return el ? { class: el.className, text: el.textContent?.trim().slice(0, 200) } : null;
});
console.log('\nUpload box:', yellowBox);

await browser.close();
