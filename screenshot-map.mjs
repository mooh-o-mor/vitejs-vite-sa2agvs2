import { chromium } from './node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.setViewportSize({ width: 1400, height: 900 });

const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text().slice(0,200)); });
page.on('pageerror', err => errors.push('[PAGEERR] ' + err.message.slice(0,200)));

await page.goto('http://localhost:5177', { waitUntil: 'networkidle' });
await page.waitForFunction(() => !document.body.innerText.includes('Загрузка данных'), { timeout: 15000 });

// Login
await page.getByText('🔒 Войти').click();
await page.waitForTimeout(400);
await page.locator('input[type="password"]').fill('vjhcgfc');
await page.locator('div').filter({ hasText: /^🔒 Вход/ }).locator('button', { hasText: 'Войти' }).click();
await page.waitForTimeout(600);

// Go to map
await page.getByText('🗺 Карта флота').click();
await page.waitForTimeout(1000);

// Switch to "ДПР судов" tab to see vessel_dpr data
const tabs = page.locator('button, [role="tab"]');
const tabTexts = await tabs.allTextContents();
console.log('Tabs available:', tabTexts.filter(t => t.trim()).join(' | '));

// Click "ДПР судов" tab
const dprsudovBtn = page.getByText('ДПР судов', { exact: false });
if (await dprsudovBtn.count() > 0) {
  await dprsudovBtn.first().click();
  await page.waitForTimeout(2000);
  console.log('Switched to ДПР судов tab');
} else {
  console.log('ДПР судов tab not found, staying on current tab');
}

await page.waitForTimeout(1500);
await page.screenshot({ path: 'map-vessels.png', fullPage: false });
console.log('Screenshot saved: map-vessels.png');

// Get sidebar vessel list
const bodyText = await page.evaluate(() => document.body.innerText);
const lines = bodyText.split('\n').filter(l => l.trim().length > 2 && l.trim().length < 60);
console.log('\nPage text snippets (sidebar/markers):');
lines.slice(0, 40).forEach(l => console.log(' ', l.trim()));

if (errors.length) {
  console.log('\nConsole errors:');
  errors.forEach(e => console.log(' ', e));
}

await browser.close();
