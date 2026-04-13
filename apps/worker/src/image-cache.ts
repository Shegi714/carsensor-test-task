import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT =
  process.env.UPLOADS_DIR && process.env.UPLOADS_DIR.trim() !== ""
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(__dirname, "../../../uploads");
const CARS_UPLOADS_DIR = path.resolve(UPLOADS_ROOT, "cars");

function sanitizeSlug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function detectExtension(url: string, contentType: string | null): string {
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return ".jpg";
  const fromUrl = path.extname(url.split("?")[0]);
  return fromUrl || ".jpg";
}

type CacheOptions = {
  passes?: number;
  /** If true, always re-download even when a file already exists (e.g. after switching to L-size URLs). */
  force?: boolean;
};

async function downloadImageWithRetries(imageUrl: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let timeout: NodeJS.Timeout | null = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 9000);
      const response = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          referer: "https://www.carsensor.net/"
        }
      });
      clearTimeout(timeout);
      timeout = null;
      if (response.ok) {
        return response;
      }
    } catch {
      // ignore and retry
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  return null;
}

/** Prefer ml CDN first; if 404/network fails, try legacy bkkn on www (same path shape). */
function carSensorDownloadCandidates(primary: string): string[] {
  const list: string[] = [primary];
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

async function downloadFirstCandidate(imageUrl: string): Promise<{ response: Response; url: string } | null> {
  for (const candidate of carSensorDownloadCandidates(imageUrl)) {
    const response = await downloadImageWithRetries(candidate);
    if (response?.ok) {
      return { response, url: candidate };
    }
  }
  return null;
}

export async function cachePrimaryImage(
  imageKey: string,
  imageUrl?: string,
  options: CacheOptions = {}
): Promise<string | null> {
  if (!imageUrl || imageUrl.startsWith("/uploads/")) {
    return null;
  }

  const safeKey = sanitizeSlug(imageKey);
  if (!options.force) {
    const expectedFiles = [".jpg", ".jpeg", ".png", ".webp"].map((ext) =>
      path.join(CARS_UPLOADS_DIR, `${safeKey}${ext}`)
    );
    for (const file of expectedFiles) {
      try {
        await access(file);
        return `/uploads/cars/${path.basename(file)}`;
      } catch {
        // continue
      }
    }
  }

  const passes = options.passes ?? 3;
  for (let pass = 0; pass < passes; pass += 1) {
    try {
      const got = await downloadFirstCandidate(imageUrl);
      if (!got) {
        continue;
      }
      const { response, url: effectiveUrl } = got;
      const bytes = Buffer.from(await response.arrayBuffer());
      const ext = detectExtension(effectiveUrl, response.headers.get("content-type"));

      await mkdir(CARS_UPLOADS_DIR, { recursive: true });
      const fileName = `${safeKey}${ext}`;
      const filePath = path.join(CARS_UPLOADS_DIR, fileName);
      await writeFile(filePath, bytes);

      return `/uploads/cars/${fileName}`;
    } catch {
      // pass-based retry
    }
    await new Promise((resolve) => setTimeout(resolve, 700 * (pass + 1)));
  }

  return null;
}

export async function cacheImage(
  carKey: string,
  imageIndex: number,
  imageUrl?: string,
  options: CacheOptions = {}
): Promise<string | null> {
  return cachePrimaryImage(`${carKey}_${imageIndex}`, imageUrl, options);
}
