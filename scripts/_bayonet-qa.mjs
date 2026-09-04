import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 400)));

await page.goto(`http://127.0.0.1:8080/?w3=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
let ready = false;
for (let i = 0; i < 90; i++) {
  const txt = await page.locator("body").innerText();
  const canvases = await page.locator("canvas").count();
  const loading = /组装|解析|载入|准备下载/.test(txt);
  if (canvases > 0 && txt.includes("柔肠模拟器") && !loading) {
    ready = true;
    await page.waitForTimeout(1800);
    break;
  }
  await page.waitForTimeout(1000);
}
console.log("READY", ready);

await page.evaluate(() => {
  const v = window.__vela;
  v.setBayonetKind?.("short");
  v.driveBayonet?.(0);
  v.frameBelly?.();
});
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/bayonet-hover.png" });

await page.evaluate(() => window.__vela?.driveBayonet(0.14));
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/bayonet-wounds.png" });

const long = await page.evaluate(() => {
  const v = window.__vela;
  v.setBayonetKind?.("long");
  const r = v.driveBayonet?.(1);
  v.frameBelly?.();
  return r;
});
console.log("LONG_DEEP", JSON.stringify(long));
await page.waitForTimeout(500);
await page.screenshot({ path: "/workspace/screenshots/bayonet-long-deep.png" });

await page.evaluate(() => window.__vela?.frameBack?.());
await page.waitForTimeout(400);
await page.screenshot({ path: "/workspace/screenshots/bayonet-long-back.png" });

await browser.close();
