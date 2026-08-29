import { chromium } from "playwright";

const browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--window-size=1440,900"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:3080", { waitUntil: "networkidle", timeout: 30000 }).catch(e => console.log("goto err:", e.message));
await page.waitForTimeout(2000);
const entry = page.getByText("你是谁?", { exact: true }).first();
if (await entry.count()) { await entry.click(); }
await page.waitForTimeout(4500);
await page.mouse.move(700, 600); // move tooltip away
// inspect DOM structure around markers
const info = await page.evaluate(() => {
  const needles = ["知乎热榜", "知乎直答", "搜索"];
  const out = [];
  const walk = (root, depth) => {
    if (depth > 14) return;
    for (const el of root.querySelectorAll("*")) {
      for (const n of needles) {
        if (el.children.length === 0 && el.textContent && el.textContent.includes(n)) {
          // leaf text node
          let cur = el; const chain = [];
          for (let i = 0; i < 6 && cur; i++) {
            const r = cur.getBoundingClientRect();
            chain.push(`<${cur.tagName.toLowerCase()}> cls="${(cur.className||"").toString().slice(0,80)}" rect=${Math.round(r.width)}x${Math.round(r.height)} text="${(cur.textContent||"").slice(0,60).replace(/\s+/g," ")}"`);
            cur = cur.parentElement;
          }
          out.push({ needle: n, chain });
          break;
        }
      }
    }
  };
  walk(document.body, 0);
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
process.exit(0);
