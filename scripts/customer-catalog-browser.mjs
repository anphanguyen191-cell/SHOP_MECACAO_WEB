// Chromium acceptance with synthetic catalog transport. Never publishes shop stock.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
const root = path.resolve("apps/web/dist"),
  out = path.resolve("artifacts/customer-catalog");
fs.mkdirSync(out, { recursive: true });
const staticRequests = [];
const server = http.createServer((req, res) => {
  try {
    staticRequests.push(req.url);
    const name = new URL(req.url, "http://local").pathname,
      file = path.resolve(root, "." + (name === "/" ? "/index.html" : name));
    if (!file.startsWith(root + path.sep)) throw Error();
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".jpg")
            ? "image/jpeg"
            : "text/html",
    );
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const chrome =
  process.env.CHROME_BIN ||
  ["/usr/bin/google-chrome", "/usr/bin/chromium"].find(fs.existsSync);
assert(chrome, "CHROME_BIN required");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-chrome-")),
  browser = spawn(
    chrome,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-proxy-server",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
let log = "";
browser.stderr.on("data", (d) => (log += d));
let ws;
const pending = new Map();
let sequence = 0;
const failures = [],
  requests = [];
let submitted = 0,
  lost = true;
const receipts = new Map();
async function cmd(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence,
      t = setTimeout(() => {
        pending.delete(id);
        reject(Error(method + " timed out"));
      }, 20000);
    pending.set(id, {
      resolve: (r) => {
        clearTimeout(t);
        resolve(r);
      },
      reject,
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function run(expression) {
  const r = await cmd("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function until(expression) {
  for (let n = 0; n < 400; n++) {
    if (await run(`Boolean(${expression})`)) return;
    await delay(50);
  }
  throw Error(
    expression +
      "\n" +
      JSON.stringify({
        body: await run("document.body?.innerText"),
        location: await run("location.href"),
        html: await run("document.documentElement?.outerHTML?.slice(0,2000)"),
        staticRequests,
        requests,
        failures,
      }),
  );
}
async function screenshot(name) {
  assert(
    await run(
      '(()=>{const call=document.querySelector(".cc-call-float"),dock=document.querySelector(".cc-cart-dock"),nav=document.querySelector(".cc-bottom-nav");if(!call||getComputedStyle(call).display==="none")return true;const r=call.getBoundingClientRect();return r.bottom<=(dock||nav).getBoundingClientRect().top-4})()',
    ),
    "Phone avoids cart/navigation " + name,
  );
  assert(
    await run("document.documentElement.scrollWidth<=innerWidth+1"),
    "overflow " + name,
  );
  assert(
    await run(
      '(()=>{const dock=document.querySelector(".cc-cart-dock"),nav=document.querySelector(".cc-bottom-nav");return !dock||!nav||dock.getBoundingClientRect().bottom<=nav.getBoundingClientRect().top-4})()',
    ),
    "dock overlaps nav " + name,
  );
  const shot = await cmd("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  fs.writeFileSync(
    path.join(out, name + ".png"),
    Buffer.from(shot.data, "base64"),
  );
}
async function click(label) {
  await until(
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled)`,
  );
  await run(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(label)}&&!b.disabled).click()`,
  );
}
const guide = [
  ["4", 9, 10, 80, 80],
  ["5", 10, 11, 80, 85],
  ["6", 12, 13, 85, 90],
  ["7", 14, 15, 90, 95],
  ["8", 16, 17, 95, 100],
  ["9", 18, 20, 100, 105],
  ["10", 21, 23, 105, 110],
  ["11", 24, 27, 110, 117],
  ["12", 28, 30, 118, 125],
  ["S", 31, 36, 125, 132],
  ["M", 37, 42, 133, 138],
  ["L", 43, 50, 140, 150],
];
const product = {
  public_product_id: 1,
  name: "Bộ tole hoa thử nghiệm",
  public_code: "FIXTURE1",
  cover_image_id: 1,
  stock_as_of: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  sizes: [
    { variant_id: 1, size_label: "8", sale_price: 50000, available_count: 5 },
  ],
};
const productMany = {
  ...product,
  public_product_id: 2,
  name: "Bộ tole nhiều Size",
  public_code: "FIXTURE2",
  cover_image_id: 2,
  sizes: [...guide]
    .reverse()
    .map((row, i) => ({
      variant_id: 20 + i,
      size_label: "Size " + row[0],
      sale_price: 67000 + i * 1000,
      available_count: i + 2,
    })),
};
async function intercept(p) {
  try {
    requests.push(p.request.url);
    const u = new URL(p.request.url);
    let response = {};
    const headers = [
      { name: "Access-Control-Allow-Origin", value: "*" },
      { name: "Access-Control-Allow-Headers", value: "content-type,apikey" },
    ];
    if (p.request.method === "OPTIONS") {
      await cmd("Fetch.fulfillRequest", {
        requestId: p.requestId,
        responseCode: 200,
        responseHeaders: headers,
        body: "e30=",
      });
      return;
    }
    if (/\/brand\/catalog-.*\.jpg$/.test(u.pathname)) {
      await cmd("Fetch.fulfillRequest", {
        requestId: p.requestId,
        responseCode: 200,
        responseHeaders: [
          ...headers,
          { name: "Content-Type", value: "image/jpeg" },
        ],
        body: fs
          .readFileSync(path.join(root, "brand", path.basename(u.pathname)))
          .toString("base64"),
      });
      return;
    }
    if (u.searchParams.has("image")) {
      await cmd("Fetch.fulfillRequest", {
        requestId: p.requestId,
        responseCode: 200,
        responseHeaders: [
          ...headers,
          { name: "Content-Type", value: "image/svg+xml" },
        ],
        body: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320"><rect width="240" height="320" rx="20" fill="#ffe6ef"/><path d="M75 40h90l40 55-30 25-10-20v110H75V100l-10 20-30-25Z" fill="#d93f7a"/><path d="M75 220h90l10 75h-40l-15-45-15 45H65Z" fill="#d93f7a"/><circle cx="120" cy="130" r="18" fill="#fff4e6"/></svg>',
        ).toString("base64"),
      });
      return;
    }
    if (p.request.method === "POST") {
      const body = JSON.parse(p.request.postData);
      if (body.action === "submit") {
        if (!receipts.has(body.token)) {
          submitted++;
          receipts.set(body.token, { reference: "CC-FIXTURE", status: "NEW" });
        }
        response = receipts.get(body.token);
        if (lost) {
          lost = false;
          await cmd("Fetch.failRequest", {
            requestId: p.requestId,
            errorReason: "ConnectionReset",
          });
          return;
        }
      } else response = receipts.get(body.token) || { status: "NOT_FOUND" };
    } else if (u.searchParams.get("action") === "config")
      response = {
        enabled: true,
        version: 1,
        config: {
          banner_url: "",
          size_image_url: "",
          zalo_url: "",
          messenger_url: "",
          guide,
        },
      };
    else if (u.searchParams.get("action") === "products") {
      const id = Number(u.searchParams.get("product_id"));
      const rows = [product, productMany].filter(
        (p) => !id || p.public_product_id === id,
      );
      response = { products: rows, next_offset: rows.length };
    } else
      response = {
        photos: [1, 2, 3, 4, 5].map((id) => ({ id, variant_id: 1 })),
        next_offset: 5,
      };
    await cmd("Fetch.fulfillRequest", {
      requestId: p.requestId,
      responseCode: 200,
      responseHeaders: [
        ...headers,
        { name: "Content-Type", value: "application/json" },
      ],
      body: Buffer.from(JSON.stringify(response)).toString("base64"),
    });
  } catch (e) {
    failures.push(e.message);
  }
}
try {
  for (let n = 0; n < 200 && !log.includes("DevTools listening on"); n++)
    await delay(50);
  const endpoint = log.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
  assert(endpoint, log);
  const base = new URL(endpoint);
  const tabs = await (await fetch("http://" + base.host + "/json/list")).json();
  ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  ws.addEventListener("message", async (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        m.error
          ? p.reject(Error(JSON.stringify(m.error)))
          : p.resolve(m.result);
      }
    } else if (m.method === "Fetch.requestPaused") void intercept(m.params);
    else if (m.method === "Runtime.exceptionThrown")
      failures.push(JSON.stringify(m.params.exceptionDetails));
  });
  await cmd("Page.enable");
  await cmd("Runtime.enable");
  await cmd("Fetch.enable", {
    patterns: [
      { urlPattern: "*supabase.co/functions/v1/customer-catalog*" },
      { urlPattern: "*brand/catalog-*.jpg" },
    ],
  });
  await cmd("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  const target = "http://127.0.0.1:" + server.address().port + "/?catalog=1";
  assert.equal((await fetch(target)).status, 200);
  await until("document.readyState==='complete'");
  let navigation = await cmd("Page.navigate", { url: target });
  if (navigation.errorText === "net::ERR_ABORTED") {
    await cmd("Page.stopLoading");
    navigation = await cmd("Page.navigate", { url: target });
  }
  assert(
    !navigation.errorText,
    JSON.stringify({ navigation, staticRequests, log }),
  );
  await until("document.body?.innerText.includes('Bộ tole hoa thử nghiệm')");
  await until(`document.querySelector('.cc-banner img')?.naturalWidth>0`);
  await until("!!document.querySelector('.cc-guide-illustration svg')");
  assert(
    await run("!!document.querySelector('.cc-header .cc-cart-trigger')"),
    "Header shopping cart",
  );
  assert(
    await run("!!document.querySelector('.cc-product .cc-favorite')"),
    "Clickable wishlist on product card",
  );
  for (const width of [360, 375, 390, 430, 768, 1024]) {
    await cmd("Emulation.setDeviceMetricsOverride", {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    await delay(80);
    assert(
      await run("document.documentElement.scrollWidth<=innerWidth+1"),
      "overflow " + width,
    );
    const shot = await cmd("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(
      path.join(out, "home-" + width + ".png"),
      Buffer.from(shot.data, "base64"),
    );
  }
  await cmd("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.equal(
    await run('document.querySelectorAll(".cc-bottom-nav button").length'),
    4,
  );
  assert.equal(
    await run('document.querySelector(".cc-call-float").getAttribute("href")'),
    "tel:0949656477",
  );
  assert.equal(
    await run(
      'document.querySelectorAll(".cc-footer-contacts a")[1].getAttribute("href")',
    ),
    "https://www.facebook.com/thi.nguyen.321179",
  );
  assert(
    await run(
      "!!document.querySelector('a[href=\"https://zalo.me/0949656477\"]')",
    ),
  );
  assert(
    await run(
      "!!document.querySelector('a[href=\"https://m.me/thi.nguyen.321179\"]')",
    ),
  );
  assert.equal(await run('document.querySelector(".cc-footer-contacts a").getAttribute("href")'), "https://www.facebook.com/share/1EvPk243af/?mibextid=wwXIfr");
  assert(await run('document.querySelector(".cc-shop-address").textContent.includes("Phường Bạc Liêu, tỉnh Cà Mau")'));
  assert(await run('document.querySelector(".cc-shop-address").textContent.includes("Phường 3, thành phố Bạc Liêu, tỉnh Bạc Liêu cũ")'));
  await run('document.querySelector(".cc-zalo-fallback button").click()');
  await until('document.querySelector(".cc-zalo-fallback [role=status]").textContent.length>0');
  await click("Sản phẩm");
  await until('!document.querySelector(".cc-banner")');
  assert(await run('document.body.innerText.includes("Danh sách sản phẩm")'));
  await screenshot("products-390");
  assert.equal(
    await run(
      'document.querySelectorAll(".cc-product")[1].querySelectorAll(".cc-product-sizes>span").length',
    ),
    3,
    "Product card collapses 12 stock rows",
  );
  await click("+9 Size");
  await until(
    'document.querySelectorAll(".cc-stock-sheet button").length===12',
  );
  assert.equal(
    await run('document.querySelector(".cc-stock-sheet strong").textContent'),
    "Size 4",
    "Stock sorted naturally, numeric sizes before letters",
  );
  assert.equal(
    await run(
      'Array.from(document.querySelectorAll(".cc-stock-sheet strong")).at(-1).textContent',
    ),
    "Size L",
  );
  await screenshot("all-sizes-390");
  await run('document.querySelector(".cc-stock-sheet button").click()');
  await until('!!document.querySelector(".cc-detail")');
  assert(
    (
      await run('document.querySelector(".cc-sizes .cc-selected").textContent')
    ).startsWith("4"),
    "Stock-sheet choice opens the exact requested Size",
  );
  await click("‹ Về danh mục");
  await until('!!document.querySelector(".cc-products")');
  await run(
    'window.scrollTo({top:document.documentElement.scrollHeight,behavior:"instant"})',
  );
  await delay(100);
  await screenshot("footer-390");
  assert(
    await run('!document.querySelector(".cc-call-float")'),
    "Visible footer contacts are never covered by the floating call button",
  );
  await run('window.scrollTo({top:0,behavior:"instant"})');
  await click("Trang chủ");
  await until('!!document.querySelector(".cc-banner")');
  await click("Bảng Size");
  await run(
    `(()=>{const fields=document.querySelectorAll('.cc-modal input');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(fields[0],'24');fields[0].dispatchEvent(new Event('input',{bubbles:true}));setter.call(fields[1],'112');fields[1].dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  await click("Gợi ý Size");
  await until(
    'document.querySelector(".cc-size-results strong")?.textContent==="Size 11"',
  );
  await screenshot("size-quick-390");
  await click("Bảng Size của Shop");
  await until('document.querySelector(".cc-size-image")?.naturalWidth>0');
  await screenshot("size-chart-390");
  assert.equal(
    await run('document.querySelectorAll(".cc-modal tbody tr").length'),
    0,
  );
  await cmd("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await until('!document.querySelector(".cc-modal")');
  await click("Xem mẫu");
  await until('document.querySelectorAll(".cc-thumbnails button").length===5');
  await screenshot("detail-390");
  await run('document.querySelector(".cc-gallery-pick input").click()');
  await run('document.querySelectorAll(".cc-thumbnails button")[1].click()');
  await run('document.querySelector(".cc-gallery-pick input").click()');
  assert(
    await run(
      'document.querySelector(".cc-gallery-pick").getBoundingClientRect().bottom < document.querySelector(".cc-cart-dock").getBoundingClientRect().top',
    ),
    "Cart dock must not cover the photo selection control",
  );
  assert.ok(
    await run('document.querySelector(".cc-quick-select .cc-stepper").getBoundingClientRect().bottom <= document.querySelector(".cc-cart-dock").getBoundingClientRect().top - 4'),
    "Cart dock must not cover the quantity controls",
  );
  await screenshot("exact-photos-390");
  for (let n = 0; n < 3; n++) await click("+");
  assert.equal(
    await run('document.querySelector(".cc-cart-dock strong").textContent'),
    "Đã chọn 5 bộ",
  );
  assert(
    await run(
      'Array.from(document.querySelectorAll(".cc-stepper button")).at(-1).disabled',
    ),
  );
  await click("Xem giỏ");
  await run(
    `document.querySelector('[aria-label="Giảm số lượng Size 8"]').click()`,
  );
  await until(
    'document.querySelector(".cc-cart-quantity output")?.textContent==="2"',
  );
  await until(
    `!document.querySelector('[aria-label="Tăng số lượng Size 8"]').disabled`,
  );
  await run(
    `document.querySelector('[aria-label="Tăng số lượng Size 8"]').click()`,
  );
  await until(
    'document.querySelector(".cc-cart-quantity output")?.textContent==="3"',
  );
  await until(
    `!document.querySelector('[aria-label="Tăng số lượng Size 8"]').disabled`,
  );
  await screenshot("cart-390");
  await click("Kiểm tra lại tồn và giá");
  await click("Tiếp tục gửi yêu cầu");
  await until(
    'Array.from(document.querySelectorAll("button")).some(b=>b.textContent==="Gửi danh sách cho Shop")',
  );
  await run(
    `(()=>{const fields=document.querySelectorAll('form input:not([type=checkbox])');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(fields[0],'Fixture Guest');fields[0].dispatchEvent(new Event('input',{bubbles:true}));setter.call(fields[1],'fixture@example.invalid');fields[1].dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.cc-check input[type=checkbox]').click()})()`,
  );
  await screenshot("contact-390");
  await click("Gửi danh sách cho Shop");
  await until('document.body.innerText.includes("Kiểm tra lần gửi trước")');
  await click("Kiểm tra lần gửi trước");
  await until('document.body.innerText.includes("CC-FIXTURE")');
  await screenshot("receipt-390");
  assert.equal(submitted, 1);
  assert.equal(
    await run('localStorage.getItem("mecacao-customer-submit-v1")'),
    null,
  );
  await click("Tiếp tục xem hàng");
  await click("Xem mẫu");
  await click("+");
  await click("Xem giỏ");
  assert(
    !(await run('!!document.querySelector(".cc-success")')),
    "New cart cannot show old receipt",
  );
  assert(
    requests.every((u) => !u.includes("/rest/v1/") && !u.includes("/auth/v1/")),
  );
  assert.deepEqual(failures, []);
  console.log(
    "CATALOG_BROWSER PASS: six viewports, four-tab navigation, preset images, 24kg/112cm Size 11, single original chart/Escape, mixed 2+3=5, cart +/- and stock guard, separate contact step, one inquiry after lost response, fresh cart after receipt, no dock/nav overlap; guest never requests Admin/Auth tables",
  );
} finally {
  ws?.close();
  browser.kill("SIGTERM");
  server.close();
}
