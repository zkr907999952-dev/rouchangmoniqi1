import { chromium } from "playwright";

const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(60000);
const failed = [];
page.on("pageerror", (e) => console.log("PAGEERROR", String(e.message).slice(0, 400)));
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error") console.log("CERR", t.slice(0, 300));
});
page.on("response", (r) => {
  if (r.status() >= 400) {
    failed.push(r.status() + " " + r.url());
    console.log("HTTP", r.status(), r.url());
  }
});

await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 60000 });
let ready = false;
for (let i = 0; i < 90; i++) {
  try {
    const txt = await page.locator("body").innerText();
    const canvases = await page.locator("canvas").count();
    const vela = await page.evaluate(() => window.__vela || null);
    if (i % 6 === 0) console.log("t", i, "canvas", canvases, "vela", !!vela, "txt", txt.slice(0, 70).replace(/\n/g, " | "));
    if (vela && canvases > 0 && !txt.includes("载入模型")) {
      ready = true;
      break;
    }
    if (txt.includes("Something went wrong")) {
      console.log("ERRPAGE", txt.slice(0, 300));
      break;
    }
  } catch (e) {
    console.log("LOOPERR", String(e).slice(0, 200));
    break;
  }
  await page.waitForTimeout(1000);
}

const dump = await page.evaluate(() => window.__vela || null).catch(() => null);
console.log("DUMP", JSON.stringify(dump, null, 2));
await page.screenshot({ path: "/workspace/screenshots/model-qa.png" }).catch((e) => console.log("SHOT", e.message));
await page.keyboard.press("x").catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: "/workspace/screenshots/model-xray.png" }).catch((e) => console.log("SHOT2", e.message));
console.log("FAILED", failed);
console.log("READY", ready);
await browser.close();
