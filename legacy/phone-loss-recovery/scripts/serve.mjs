import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("dist/client"),
  prefix = process.env.BASE_PATH || "/",
  port = Number(process.env.PORT || 8788);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".md": "text/plain; charset=utf-8",
  ".csv": "text/csv",
};
createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      return res.end();
    }
    let path = decodeURIComponent(new URL(req.url, "http://local").pathname);
    if (!path.startsWith(prefix)) {
      res.writeHead(404);
      return res.end("Not found");
    }
    const file = resolve(root, path.slice(prefix.length) || ".");
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403);
      return res.end();
    }
    const target = (await stat(file)).isDirectory()
      ? resolve(file, "index.html")
      : file;
    const data = await readFile(target);
    res.writeHead(200, {
      "Content-Type": types[extname(target)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Recovery preview on http://127.0.0.1:${port}${prefix}`),
);
