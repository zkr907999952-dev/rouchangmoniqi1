import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const browser = await chromium.launch({
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"],
});
const errors = [];

async function waitLoaded(page) {
  for (let i = 0; i < 50; i++) {
    const txt = await page.locator("body").innerText();
    if (txt.includes("载入失败")) return txt;
    if (!txt.includes("载入模型") && txt.includes("VELA")) {
      await page.waitForTimeout(800);
      return "ok";
    }
    await page.waitForTimeout(400);
  }
  return "timeout";
}

async function shot(page, path) {
  const data = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return null;
    return c.toDataURL("image/jpeg", 0.82);
  });
  if (!data) {
    console.log("NOCANVAS", path);
    return;
  }
  writeFileSync(path, Buffer.from(data.split(",")[1], "base64"));
  console.log("WROTE", path);
}

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => errors.push("PAGE " + e.message.slice(0, 240)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push("CERR " + m.text().slice(0, 240));
});
await page.goto("http://127.0.0.1:8080/", { waitUntil: "domcontentloaded", timeout: 60000 });
console.log("LOAD", await waitLoaded(page));
console.log("VELA", JSON.stringify(await page.evaluate(() => window.__vela)));
await shot(page, "/workspace/screenshots/app-builder-preview.png");
await page.keyboard.press("x");
await page.waitForTimeout(500);
await shot(page, "/workspace/screenshots/model-xray.png");

await page.evaluate(() => {
  const c = document.querySelector("canvas");
  if (!c) return;
  const r = c.getBoundingClientRect();
  const x = r.left + r.width * 0.48;
  const y = r.top + r.height * 0.5;
  c.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: "mouse" }));
});
await page.waitForTimeout(400);
await shot(page, "/workspace/screenshots/poke.png");
await page.evaluate(() => {
  window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerId: 1 }));
});

await page.keyboard.press("x");
await page.waitForTimeout(400);
await page.keyboard.press("k");
await page.waitForTimeout(400);
await shot(page, "/workspace/screenshots/bones.png");
await page.keyboard.press("w");
await page.waitForTimeout(400);
await shot(page, "/workspace/screenshots/weights.png");
await page.keyboard.press("w");
await page.keyboard.press("k");
await page.keyboard.press("2");
await page.waitForTimeout(800);
await shot(page, "/workspace/screenshots/smile.png");
await page.keyboard.press("6");
await page.waitForTimeout(600);
await shot(page, "/workspace/screenshots/arms-up.png");
console.log("ERRORS", JSON.stringify(errors));
await browser.close();
