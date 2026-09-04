import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const failed = [];
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 300)));
page.on("requestfailed", (r) => console.log("REQFAIL", r.url()));
page.on("response", (r) => {
  if (r.status() >= 400) { failed.push(r.status()+" "+r.url()); console.log("HTTP", r.status(), r.url()); }
});
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error") console.log("CERR", t.slice(0, 250));
  else if (/animation skipped|FBX animations/i.test(t)) console.log("C", t.slice(0, 200));
});
await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 60000 });
for (let i = 0; i < 60; i++) {
  const txt = await page.locator("body").innerText();
  const canvases = await page.locator("canvas").count();
  if (i % 5 === 0) console.log("t", i, "canvas", canvases, "txt", txt.slice(0, 80).replace(/\n/g, " | "));
  if (canvases > 0 && !txt.includes("载入模型") && !txt.includes("Something went wrong") && txt.includes("VELA")) {
    if (i > 4) break;
  }
  if (txt.includes("Something went wrong")) break;
  await page.waitForTimeout(1000);
}
await page.screenshot({ path: "/workspace/screenshots/model-qa.png" });
console.log("BODY", (await page.locator("body").innerText()).slice(0, 400));
console.log("FAILED", failed);
await page.keyboard.press("x");
await page.waitForTimeout(1000);
await page.screenshot({ path: "/workspace/screenshots/model-xray.png" });
await browser.close();
