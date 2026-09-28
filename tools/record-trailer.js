const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1, acceptDownloads: true });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERR ' + e.message + '\n' + e.stack));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('file://' + require('path').resolve(__dirname, '../trailer.html'));
  await page.waitForTimeout(1500);
  // measure frame pacing during the run
  await page.evaluate(() => { window.__ft = []; let l = performance.now(); const f = n => { window.__ft.push(n - l); l = n; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const dl = page.waitForEvent('download', { timeout: 300000 });
  const t0 = Date.now();
  await page.evaluate(() => { TR.run({ record: true }); });
  const d = await dl;
  await d.saveAs(process.argv[2] || require('path').resolve(__dirname, '../trailer/raw.webm'));
  const ft = await page.evaluate(() => { const a = window.__ft.slice(5).sort((x, y) => x - y); return { n: a.length, p50: a[a.length >> 1], p95: a[Math.floor(a.length * 0.95)], max: a[a.length - 1], over33: a.filter(x => x > 33).length }; });
  console.log('seconds', (Date.now() - t0) / 1000, 'frames', JSON.stringify(ft));
  console.log('ERRORS:', errs.join('\n') || 'none');
  await browser.close();
})();
