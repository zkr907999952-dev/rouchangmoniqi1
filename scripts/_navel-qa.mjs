import { chromium } from "playwright";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
page.setDefaultTimeout(90000);

await page.goto(`http://127.0.0.1:8080/?nv2=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
for (let i = 0; i < 80; i++) {
  const txt = await page.locator("body").innerText();
  const canvases = await page.locator("canvas").count();
  if (canvases > 0 && txt.includes("柔肠模拟器") && !/组装|解析|载入|准备下载/.test(txt)) {
    await page.waitForTimeout(1000);
    break;
  }
  await page.waitForTimeout(800);
}

const info = await page.evaluate(() => {
  const v = window.__vela;
  v.setParam?.("navelDepth", 0.75);
  v.setParam?.("navelDiameter", 1.05);
  v.frameBelly?.();
  return { navel: v.frameNavel?.(), abdomen: v.abdomen, char: v.char };
});
console.log(JSON.stringify(info));
await page.evaluate(() => window.__vela?.frameBelly?.());
await page.waitForTimeout(500);
await page.screenshot({ path: "/workspace/screenshots/navel-belly.png" });
await browser.close();
