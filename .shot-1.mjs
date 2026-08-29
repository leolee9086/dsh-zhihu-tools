import { chromium } from "playwright";

// Connect to the user's running Edge via CDP
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const contexts = browser.contexts();
console.log("contexts:", contexts.length);
let pages = [];
for (const c of contexts) {
  for (const p of c.pages()) {
    pages.push({ ctxIdx: contexts.indexOf(c), page: p });
    console.log("PAGE:", JSON.stringify({ url: p.url(), title: await p.title() }));
  }
}
const target = pages.find(({ page }) => page.url().includes("127.0.0.1:3080") || page.url().includes("localhost:3080") || page.url().includes("3080"));
if (!target) {
  console.log("TARGET NOT FOUND; exiting");
  await browser.close();
  process.exit(2);
}
const page = target.page;
await page.bringToFront();
await page.waitForTimeout(1500);
// find tool cards by text
const markers = ["知乎热榜", "知乎站内搜索", "知乎直答"];
for (const m of markers) {
  const count = await page.getByText(m, { exact: false }).count();
  console.log(`marker "${m}": ${count}`);
}
await page.screenshot({ path: "D:/dev/zhihu-plugin/shot-fullpage.png", fullPage: true });
console.log("FULLPAGE SAVED");
await browser.close();
process.exit(0);
