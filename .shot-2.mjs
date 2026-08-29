import { chromium } from "playwright";

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--window-size=1440,900"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:3080", { waitUntil: "networkidle", timeout: 30000 }).catch(e => console.log("goto err:", e.message));
await page.waitForTimeout(2500);
console.log("URL:", page.url());
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 800));
console.log("BODY START:", JSON.stringify(bodyText));
for (const m of ["知乎热榜", "知乎站内搜索", "知乎直答"]) {
  console.log(`marker "${m}":`, await page.getByText(m, { exact: false }).count());
}
await page.screenshot({ path: "D:/dev/zhihu-plugin/shot-probe.png", fullPage: false });
console.log("SAVED shot-probe.png");
await browser.close();
process.exit(0);
