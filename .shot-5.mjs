import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--window-size=1440,1000"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto("http://127.0.0.1:3080", { waitUntil: "networkidle", timeout: 30000 }).catch(e => console.log("goto err:", e.message));
await page.waitForTimeout(2500);
const entry = page.getByText("你是谁?", { exact: true }).first();
if (await entry.count()) { await entry.click(); }
await page.waitForTimeout(5000);
await page.mouse.move(700, 700);

// find the three tool cards: callRow elements whose text starts with our markers
const cards = await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".UpCvFW_callRow")];
  const wanted = [];
  for (const row of rows) {
    const t = (row.textContent || "");
    if (t.includes("知乎热榜") && !t.startsWith("Think")) wanted.push({ key: "hot", text: t.slice(0, 80) });
    else if (t.includes("知乎搜索") && t.length > 100) wanted.push({ key: "search", text: t.slice(0, 80) });
    else if (t.includes("知乎直答") && t.length > 100) wanted.push({ key: "ask", text: t.slice(0, 80) });
  }
  return wanted;
});
console.log("cards found:", JSON.stringify(cards));

const order = ["hot", "search", "ask"];
const captured = {};
for (const key of order) {
  const idx = cards.findIndex(c => c.key === key);
  if (idx < 0) { console.log("miss", key); continue; }
  const loc = page.locator(".UpCvFW_callRow").filter({ hasText: key === "hot" ? "知乎热榜" : key === "search" ? "知乎搜索" : "知乎直答" }).nth(0);
  // be precise: pick the callRow at the found index among the marker-matched ones
  const precise = await page.evaluate((k, text) => {
    const rows = [...document.querySelectorAll(".UpCvFW_callRow")];
    const picks = rows.filter(r => { const t = r.textContent || ""; return t.includes(text) && (text === "知乎热榜" ? !t.startsWith("Think") : t.length > 100); });
    const el = picks[picks.length - 1]; // last = the real tool card (earlier ones are my chat text)
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
  }, key, key === "hot" ? "知乎热榜" : key === "search" ? "知乎搜索" : "知乎直答");
  console.log(key, "rect:", JSON.stringify(precise));
  // scroll into view then clip screenshot
  const clip = await page.evaluate((text) => {
    const rows = [...document.querySelectorAll(".UpCvFW_callRow")];
    const picks = rows.filter(r => { const t = r.textContent || ""; return t.includes(text) && (text === "知乎热榜" ? !t.startsWith("Think") : t.length > 100); });
    const el = picks[picks.length - 1];
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    return true;
  }, key === "hot" ? "知乎热榜" : key === "search" ? "知乎搜索" : "知乎直答");
  await page.waitForTimeout(600);
  // compute element bounding box after scroll
  const box = await page.evaluate((text) => {
    const rows = [...document.querySelectorAll(".UpCvFW_callRow")];
    const picks = rows.filter(r => { const t = r.textContent || ""; return t.includes(text) && (text === "知乎热榜" ? !t.startsWith("Think") : t.length > 100); });
    const el = picks[picks.length - 1];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // clamp to viewport
    const vw = window.innerWidth, vh = window.innerHeight;
    const x = Math.max(0, r.x - 2), y = Math.max(0, r.y - 2);
    const w = Math.min(vw - x, r.width + 4), h = Math.min(vh - y, r.height + 4);
    return { x, y, w, h };
  }, key === "hot" ? "知乎热榜" : key === "search" ? "知乎搜索" : "知乎直答");
  console.log(key, "box:", JSON.stringify(box));
  if (box && box.w > 100 && box.h > 100) {
    await page.screenshot({ path: `D:/dev/zhihu-plugin/.card-${key}.png`, clip: box });
    captured[key] = `D:/dev/zhihu-plugin/.card-${key}.png`;
    console.log("captured", key);
  }
}
console.log("captured:", JSON.stringify(captured));
await browser.close();
process.exit(0);
