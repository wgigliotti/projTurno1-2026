import { chromium } from 'playwright-core';
const [url, out, w = 1440, h = 1000] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME || '/home/willian/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('console', m => { if (m.type() === 'error') console.log('console.error:', m.text().slice(0, 200)); });
await p.goto(url, { waitUntil: 'networkidle' }); await p.waitForTimeout(4000);
await p.screenshot({ path: out, fullPage: true }); await b.close();
