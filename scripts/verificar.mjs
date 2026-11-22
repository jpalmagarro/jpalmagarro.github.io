#!/usr/bin/env node
// Verificación de la web (HTML estático, sin dependencias). Uso:
//   node scripts/verificar.mjs                 estáticas + navegador
//   node scripts/verificar.mjs --sin-navegador solo estáticas
// Chrome: variable CHROME, o google-chrome / chromium del sistema, o el de Playwright en ~/.cache.
import { readFileSync, existsSync, statSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { tmpdir, homedir } from "node:os";
import vm from "node:vm";

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname), "..");
const PAGINAS = ["index.html", "404.html", "data/index.html", "ai/index.html"];
const fallos = [];
const fallo = (donde, msg) => fallos.push(`${donde}: ${msg}`);

// ---------- 1. Estáticas ----------
function rutaLocal(pagina, ref) {
  const limpio = ref.split(/[?#]/)[0];
  if (!limpio) return null;
  const base = limpio.startsWith("/") ? join(RAIZ, limpio) : join(RAIZ, dirname(pagina), limpio);
  return limpio.endsWith("/") ? join(base, "index.html") : base;
}

for (const p of PAGINAS) {
  const html = readFileSync(join(RAIZ, p), "utf8");
  // JS en línea: debe compilar.
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/type="application\/ld\+json"/.test(m[1])) {
      try { JSON.parse(m[2]); } catch (e) { fallo(p, `JSON-LD no válido: ${e.message}`); }
      continue;
    }
    try { new vm.Script(m[2], { filename: p }); } catch (e) { fallo(p, `JS no compila: ${e.message}`); }
  }
  // Enlaces y recursos locales: deben existir.
  for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^(https?:|mailto:|tel:|data:|#|\$\{)/.test(ref)) continue;
    const f = rutaLocal(p, ref);
    if (f && !existsSync(f)) fallo(p, `enlace roto: ${ref}`);
  }
  // Traducciones: ningún data-es vacío.
  for (const m of html.matchAll(/data-es="\s*"/g)) fallo(p, `data-es vacío en la posición ${m.index}`);
}
// Ficheros JS sueltos.
for (const f of readdirSync(join(RAIZ, "Assets/js"))) {
  if (extname(f) !== ".js") continue;
  try { new vm.Script(readFileSync(join(RAIZ, "Assets/js", f), "utf8"), { filename: f }); }
  catch (e) { fallo(`Assets/js/${f}`, `JS no compila: ${e.message}`); }
}
console.log(`estáticas: ${fallos.length ? "✗" : "✓"} (${PAGINAS.length} páginas)`);

// ---------- 2. Navegador ----------
function buscarChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const c of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try { return execFileSync("which", [c], { encoding: "utf8" }).trim(); } catch {}
  }
  const pw = join(homedir(), ".cache/ms-playwright");
  if (existsSync(pw)) for (const d of readdirSync(pw).filter(d => d.startsWith("chromium_headless_shell")).sort().reverse()) {
    for (const sub of readdirSync(join(pw, d))) {
      const f = join(pw, d, sub, "chrome-headless-shell");
      if (existsSync(f)) return f;
    }
  }
  return null;
}

const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".pdf": "application/pdf",
  ".png": "image/png", ".gif": "image/gif", ".svg": "image/svg+xml", ".json": "application/json" };

// Como GitHub Pages: carpeta → index.html; si no existe, 404.html con estado 404.
function servidor() {
  return createServer((req, res) => {
    let f = join(RAIZ, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html");
    if (!f.startsWith(RAIZ) || !existsSync(f)) {
      res.writeHead(404, { "content-type": TIPOS[".html"] });
      return res.end(readFileSync(join(RAIZ, "404.html")));
    }
    res.writeHead(200, { "content-type": TIPOS[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  });
}

async function navegador(chrome) {
  const srv = servidor();
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const origen = `http://127.0.0.1:${srv.address().port}`;
  const perfil = mkdtempSync(join(process.env.TMPDIR || tmpdir(), "verificar-"));
  const proc = spawn(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0",
    `--user-data-dir=${perfil}`, "--no-first-run", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((ok, ko) => {
    let buf = "";
    const t = setTimeout(() => ko(new Error("Chrome no arrancó en 15 s")), 15000);
    proc.stderr.on("data", d => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) { clearTimeout(t); ok(m[0]); } });
    proc.on("exit", c => ko(new Error(`Chrome salió con código ${c}: ${buf.slice(-300)}`)));
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
  let id = 0; const pend = new Map(), oyentes = new Set();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { ok, ko } = pend.get(m.id); pend.delete(m.id); m.error ? ko(new Error(m.error.message)) : ok(m.result); }
    else oyentes.forEach(f => f(m));
  };
  const cdp = (method, params = {}, sessionId) => new Promise((ok, ko) => {
    const i = ++id; pend.set(i, { ok, ko }); ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });
  const esperar = ms => new Promise(r => setTimeout(r, ms));

  const CASOS = [];
  const rutas = [["/", "portada"], ["/?f=data", "portada ?f=data"], ["/data/", "/data"], ["/ai/", "/ai"], ["/no-existe", "404"]];
  for (const [ruta, nombre] of rutas)
    for (const lang of ["en", "es"])
      for (const [ancho, alto, movil] of [[1280, 900, false], [375, 740, true]])
        CASOS.push({ ruta, nombre, lang, ancho, alto, movil });

  for (const c of CASOS) {
    const donde = `${c.nombre} ${c.lang} ${c.movil ? "móvil" : "escritorio"}`;
    const { targetId } = await cdp("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp("Target.attachToTarget", { targetId, flatten: true });
    const errores = [];
    let cargada = false;
    const oir = m => {
      if (m.sessionId !== sessionId) return;
      if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errores.push(m.params.args.map(a => a.value ?? a.description).join(" "));
      if (m.method === "Log.entryAdded" && m.params.entry.level === "error") {
        const u = m.params.entry.url || "";
        // Fuentes y analítica externas pueden no cargar (sin red en el sandbox); no es un fallo de la web.
        if (u.startsWith(origen) && !(c.nombre === "404" && u.includes("/no-existe"))) errores.push(`${m.params.entry.text} ${u}`);
      }
      if (m.method === "Page.loadEventFired") cargada = true;
    };
    oyentes.add(oir);
    await cdp("Runtime.enable", {}, sessionId);
    await cdp("Log.enable", {}, sessionId);
    await cdp("Page.enable", {}, sessionId);
    await cdp("Emulation.setDeviceMetricsOverride", { width: c.ancho, height: c.alto, deviceScaleFactor: 1, mobile: c.movil }, sessionId);
    const sep = c.ruta.includes("?") ? "&" : "?";
    await cdp("Page.navigate", { url: `${origen}${c.ruta}${sep}lang=${c.lang}` }, sessionId);
    for (let t = 0; !cargada && t < 100; t++) await esperar(100);
    if (!cargada) errores.push("la página no terminó de cargar en 10 s");
    await esperar(600);

    const { result } = await cdp("Runtime.evaluate", { returnByValue: true, expression: `(() => {
      const d = document.documentElement;
      const pequenos = [...document.querySelectorAll("svg text")]
        .filter(t => t.getClientRects().length && getComputedStyle(t).visibility !== "hidden" && t.textContent.trim())
        // tamaño en pantalla = font-size (unidades del SVG) × escala del SVG
        .map(t => ({ t: t.textContent.trim().slice(0, 30), px: parseFloat(getComputedStyle(t).fontSize) * (t.getScreenCTM()?.a || 1) }))
        .filter(x => x.px < 9.5);
      return { lang: d.lang, scroll: d.scrollWidth - d.clientWidth, pequenos: pequenos.slice(0, 5), npeq: pequenos.length };
    })()` }, sessionId);
    const r = result.value;
    if (r.lang !== c.lang) errores.push(`idioma ${r.lang}, se esperaba ${c.lang}`);
    if (c.movil && r.scroll > 1) errores.push(`scroll horizontal de ${r.scroll}px`);
    if (c.movil && r.npeq) errores.push(`${r.npeq} textos de gráfico por debajo de 9,5 px (p. ej. ${r.pequenos.map(x => `«${x.t}» ${x.px.toFixed(1)}px`).join(", ")})`);
    errores.forEach(e => fallo(donde, e));
    oyentes.delete(oir);
    await cdp("Target.closeTarget", { targetId });
  }
  ws.close(); proc.kill(); srv.close();
  try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  return CASOS.length;
}

if (!process.argv.includes("--sin-navegador")) {
  const chrome = buscarChrome();
  if (!chrome) { fallo("navegador", "no encuentro Chrome (define CHROME o usa --sin-navegador)"); }
  else {
    const antes = fallos.length;
    try {
      const n = await navegador(chrome);
      console.log(`navegador: ${fallos.length > antes ? "✗" : "✓"} (${n} casos: 5 rutas × EN/ES × escritorio/móvil)`);
    } catch (e) { fallo("navegador", e.message); }
  }
}

if (fallos.length) {
  console.log(`\n${fallos.length} fallo(s):`);
  fallos.forEach(f => console.log(`  ✗ ${f}`));
  process.exit(1);
}
console.log("todo ✓");
