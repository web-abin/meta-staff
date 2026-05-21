// scripts/playwright-record.mjs
//
// Records a short interaction video of the build preview page.
// Used by the Go sandbox sub-process. Env contract:
//   PREVIEW_URL   absolute URL to the preview HTML (e.g. http://localhost:8080/static/previews/<id>/index.html)
//   OUTPUT_FILE   absolute path where the .webm should land
//   TASK_ID       task id, only used for logs
//
// Playwright is loaded dynamically — if it's not installed in the workspace
// (or the chromium binary is missing), we exit non-zero and Go logs a warning
// without failing the workflow.

import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const previewURL = process.env.PREVIEW_URL;
const outputFile = process.env.OUTPUT_FILE;
const taskID = process.env.TASK_ID ?? "unknown";

if (!previewURL || !outputFile) {
  console.error("[recorder] missing PREVIEW_URL or OUTPUT_FILE env");
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch (err) {
  console.error("[recorder] playwright not installed:", err.message);
  process.exit(3);
}

const recordDir = await mkdtempSafe("meta-staff-rec-");
await mkdir(dirname(outputFile), { recursive: true });

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: recordDir, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();
  await page.goto(previewURL, { waitUntil: "domcontentloaded", timeout: 10000 });

  // ~6s of scripted interaction so the .webm is interesting, not a still.
  await page.waitForTimeout(800);
  await page.mouse.move(400, 200);
  await page.evaluate(() => window.scrollTo({ top: 200, behavior: "smooth" }));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: "smooth" }));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await page.waitForTimeout(1500);

  const video = page.video();
  await context.close();
  await browser.close();
  if (video) {
    const generated = await video.path();
    await rename(generated, outputFile);
    console.log(`[recorder] wrote ${outputFile} (task ${taskID})`);
  } else {
    console.error("[recorder] no video object returned");
    process.exit(4);
  }
} catch (err) {
  if (browser) {
    try { await browser.close(); } catch {}
  }
  console.error("[recorder] failed:", err.message);
  process.exit(1);
} finally {
  await rm(recordDir, { recursive: true, force: true }).catch(() => {});
}

async function mkdtempSafe(prefix) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(join(tmpdir(), prefix));
}
