import { chromium } from './node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setViewportSize({ width: 1600, height: 950 });

await page.goto('http://localhost:5177', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.body.innerText.includes('Загрузка данных'), { timeout: 15000 });

// Login
await page.getByText('🔒 Войти').click();
await page.waitForTimeout(400);
await page.locator('input[type="password"]').fill('vjhcgfc');
await page.locator('div').filter({ hasText: /^🔒 Вход/ }).locator('button', { hasText: 'Войти' }).click();
await page.waitForTimeout(600);

// Go to map → ДПР судов tab
await page.getByText('🗺 Карта флота').click();
await page.waitForTimeout(800);
await page.getByText('ДПР судов', { exact: false }).first().click();
await page.waitForTimeout(2500);

// Close any popup by pressing Escape or clicking outside
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// Screenshot of full map
await page.screenshot({ path: 'map-full.png' });
console.log('Full map screenshot saved');

// Zoom in on sidebar to see vessel list
const sidebar = page.locator('.sidebar, [class*="sidebar"], [class*="Sidebar"], aside').first();
const sidebarBox = await sidebar.boundingBox().catch(() => null);
if (sidebarBox) {
  await page.screenshot({ path: 'map-sidebar.png', clip: { x: 0, y: 0, width: 280, height: 950 } });
  console.log('Sidebar screenshot saved');
}

// Get vessel entries from sidebar
const vesselItems = await page.evaluate(() => {
  const items = [];
  // Try to find vessel list items
  document.querySelectorAll('li, [class*="vessel"], [class*="Vessel"]').forEach(el => {
    const text = el.textContent?.trim();
    if (text && text.length > 3 && text.length < 80) {
      items.push(text.slice(0, 70));
    }
  });
  return [...new Set(items)].slice(0, 30);
});
console.log('\nVessel items:', vesselItems);

// Check what the yellow popup says
const popupText = await page.evaluate(() => {
  const popups = [...document.querySelectorAll('[class*="popup"], [class*="Popup"], .leaflet-popup-content')];
  return popups.map(p => p.textContent?.trim().slice(0, 200));
});
console.log('\nPopup text:', popupText);

// Get map marker colors (SVG paths or divIcon classes)
const markerInfo = await page.evaluate(() => {
  const markers = [...document.querySelectorAll('.leaflet-marker-icon, [class*="marker"]')];
  return markers.slice(0, 10).map(m => ({
    class: m.className,
    style: m.getAttribute('style')?.slice(0, 100),
    innerHTML: m.innerHTML?.slice(0, 100),
  }));
});
console.log('\nMarker info (first 10):', JSON.stringify(markerInfo, null, 2));

await browser.close();
