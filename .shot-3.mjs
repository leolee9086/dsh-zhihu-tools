import { chromium } from "playwright";

const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--window-size=1440,900"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:3080", { waitUntil: "networkidle", timeout: 30000 }).catch(e => console.log("goto err:", e.message));
await page.waitForTimeout(2000);

// Click the session entry "你是谁?" in the sidebar
const entry = page.getByText("你是谁?", { exact: true }).first();
const entryCount = await page.getByText("你是谁?", { exact: true }).count();
console.log("session entry count:", entryCount);
if (entryCount > 0) {
  await entry.click();
  console.log("clicked session");
} else {
  // fall back: newest session might not be this; try clicking first item that is not 新会话
  console.log("entry not found via exact text");
}
await page.waitForTimeout(4000);
console.log("URL now:", page.url());

// dump some body text
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 600));
console.log("BODY START:", JSON.stringify(bodyText));

const markers = ["知乎热榜", "知乎站内搜索", "知乎直答", "知乎"];
for (const m of markers) {
  console.log(`marker "${m}":`, await page.getByText(m, { exact: false }).count());
}
await page.screenshot({ path: "D:/dev/zhihu-plugin/shot-probe2.png" });
console.log("SAVED shot-probe2.png");
await browser.close();
process.exit(0);
