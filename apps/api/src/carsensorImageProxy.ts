import type { Express, Request, Response } from "express";

const UPSTREAM_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  referer: "https://www.carsensor.net/"
} as const;

function carSensorDownloadCandidates(primary: string): string[] {
  const list = [primary];
  try {
    const u = new URL(primary);
    if (/ccsrpcml\.carsensor\.net/i.test(u.hostname) && /\/CSphoto\/ml\//i.test(u.pathname)) {
      const legacy = new URL(primary);
      legacy.hostname = "www.carsensor.net";
      legacy.pathname = u.pathname.replace(/\/CSphoto\/ml\//i, "/CSphoto/bkkn/");
      list.push(legacy.toString());
    }
  } catch {
    // ignore
  }
  return [...new Set(list)];
}

function isAllowedCarsensorHttpsUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return h === "carsensor.net" || h.endsWith(".carsensor.net");
  } catch {
    return false;
  }
}

export function registerCarSensorImageProxy(app: Express): void {
  app.get("/x/csimg", async (req: Request, res: Response) => {
    const raw = req.query.u;
    if (typeof raw !== "string" || raw.length === 0) {
      res.status(400).type("text/plain").send("missing u");
      return;
    }

    if (raw.length > 12_000) {
      res.status(400).type("text/plain").send("url too long");
      return;
    }

    if (!isAllowedCarsensorHttpsUrl(raw)) {
      res.status(403).type("text/plain").send("forbidden");
      return;
    }

    let lastStatus = 0;
    for (const target of carSensorDownloadCandidates(raw)) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12_000);
      try {
        const upstream = await fetch(target, { headers: UPSTREAM_HEADERS, signal: controller.signal });
        lastStatus = upstream.status;
        if (!upstream.ok) {
          continue;
        }
        const buf = Buffer.from(await upstream.arrayBuffer());
        if (buf.length > 12 * 1024 * 1024) {
          res.status(502).type("text/plain").send("too large");
          return;
        }
        const ct = upstream.headers.get("content-type") ?? "image/jpeg";
        res.setHeader("Content-Type", ct.startsWith("image/") ? ct : "image/jpeg");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.status(200).send(buf);
        return;
      } catch {
        // try next candidate
      } finally {
        clearTimeout(timeout);
      }
    }

    res.status(lastStatus === 404 ? 404 : 502).type("text/plain").send("upstream failed");
  });
}
