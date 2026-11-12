// Minimal static server for apps/web/out (what a static host does): index.html per directory,
// 404.html with status 404 for unknown paths. Usage: node scripts/serve-web.ts [port]
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { ROOT } from "./lib.ts";

const OUT = join(ROOT, "apps", "web", "out");
const PORT = Number(process.argv[2] ?? 8765);
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon", ".png": "image/png",
};
createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let file = join(OUT, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file) && existsSync(file + ".html")) file += ".html";
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": TYPES[".html"] });
    return res.end(readFileSync(join(OUT, "404.html")));
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(PORT, "127.0.0.1", () => console.log(`serving ${OUT} on http://127.0.0.1:${PORT}`));
