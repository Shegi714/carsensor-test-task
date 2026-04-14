import { load } from "cheerio";
import iconv from "iconv-lite";
import type { NormalizedCar, RawCarCard } from "./types.js";
import {
  normalizeFuel,
  normalizeLocation,
  normalizeMake,
  normalizeModel,
  normalizeTransmission,
  parseMileageToKm,
  parsePriceToJpy,
  parseYear
} from "./normalize.js";

const BASE_URL = "https://carsensor.net";
const DEFAULT_LISTING_URL = `${BASE_URL}/usedcar/index.html`;
const MAX_CARS_PER_RUN = 30;
const MAX_IMAGES_PER_CAR = 16;
const FETCH_TIMEOUT_MS = 15000;
const FETCH_RETRIES = Number(process.env.CARSENSOR_FETCH_RETRIES ?? 4);
const JINA_PROXY_BASE = "https://r.jina.ai/http";

function fetchHtmlCandidates(url: string): string[] {
  const list: string[] = [url];
  // Fallback: r.jina.ai is a read-only proxy that often bypasses origin rate limits / TLS socket closes.
  // Format: https://r.jina.ai/http(s)://example.com/path
  const normalized = url.replace(/^http:\/\//i, "https://");
  list.push(`${JINA_PROXY_BASE}/${normalized}`);
  return [...new Set(list)];
}

function scoreJapaneseDecoding(value: string): number {
  const japaneseCount = (value.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g) ?? []).length;
  const replacementCount = (value.match(/�/g) ?? []).length;
  const questionCount = (value.match(/\?/g) ?? []).length;
  return japaneseCount - replacementCount * 4 - questionCount;
}

function makeAbsoluteUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  if (url.startsWith("/")) {
    return `${BASE_URL}${url}`;
  }

  return `${BASE_URL}/${url}`;
}

const ML_CDN_HOST = "ccsrpcml.carsensor.net";

export function normalizeImageUrl(url: string): string {
  let out = makeAbsoluteUrl(url).replace(/^http:\/\//i, "https://");
  out = out.replace(/\?.*$/, "");
  const ext = "(?:JPG|JPEG|PNG|WEBP)";
  out = out
    .replace(/\/SUZ(\d+_\d+_001\.jpg)$/i, "/UZ$1")
    .replace(new RegExp(`(/[A-Z0-9]+_\\d{3})M(\\.${ext})`, "i"), "$1L$2")
    .replace(new RegExp(`(/[A-Z0-9]+_\\d{3})S(\\.${ext})`, "i"), "$1L$2")
    .replace(new RegExp(`_(\\d{3})M(\\.${ext})$`, "i"), "_$1L$2")
    .replace(new RegExp(`_(\\d{3})S(\\.${ext})$`, "i"), "_$1L$2")
    .replace(new RegExp(`_001M(\\.${ext})`, "i"), "_001L$1")
    .replace(new RegExp(`_001S(\\.${ext})`, "i"), "_001L$1")
    .replace(new RegExp(`_001(\\.${ext})$`, "i"), "_001L$1")
    .replace(new RegExp(`_(\\d{3})(\\.${ext})$`, "i"), "_$1L$2");

  try {
    const u = new URL(out);
    const path = u.pathname;
    if (/\/csphoto\/bkkn\//i.test(path)) {
      u.hostname = ML_CDN_HOST;
      u.pathname = path.replace(/\/CSphoto\/bkkn\//i, "/CSphoto/ml/");
    } else if (
      /\/csphoto\/ml\//i.test(path) &&
      /carsensor\.net$/i.test(u.hostname) &&
      !/^ccsrpcml\./i.test(u.hostname)
    ) {
      u.hostname = ML_CDN_HOST;
    }
    out = u.toString();
  } catch {
    // keep out
  }

  return out;
}

function isLikelyCarImage(url: string): boolean {
  const value = normalizeImageUrl(url).toLowerCase();

  if (!/^https?:\/\//.test(value)) {
    return false;
  }

  if (/(loading|logo|icon|banner|pixel|tag\.gif|doubleclick|facebook|line\.me|smartnews)/i.test(value)) {
    return false;
  }

  if (/\/suz\d+_\d+_001\.jpg$/i.test(value)) {
    return false;
  }

  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.toLowerCase();
    if (!/\.(jpe?g|png|webp)$/.test(pathname)) {
      return false;
    }
    if (/\/shopinfo\//.test(pathname)) {
      return false;
    }
    return /\/csphoto\/(bkkn|ml)\//.test(pathname);
  } catch {
    return false;
  }
}

/**
 * From a responsive srcset, pick the largest candidate.
 * If there are no `640w`-style descriptors, entries are often listed smallest→largest (mobile-first);
 * in that case the first URL was wrongly "winning" when we assigned equal weights — take the last.
 */
function pickLargestSrcsetUrl(srcset: string): string | null {
  type Cand = { url: string; w: number; order: number };
  const list: Cand[] = [];
  let order = 0;

  for (const part of srcset.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const tokens = trimmed.split(/\s+/);
    const rawUrl = tokens[0];
    if (!rawUrl) {
      continue;
    }

    let w = 0;
    for (let i = 1; i < tokens.length; i += 1) {
      const wMatch = tokens[i].match(/^(\d+)w$/i);
      if (wMatch) {
        w = Math.max(w, Number(wMatch[1]));
      }
      const xMatch = tokens[i].match(/^(\d+(?:\.\d+)?)x$/i);
      if (xMatch) {
        w = Math.max(w, Math.round(Number(xMatch[1]) * 640));
      }
    }
    list.push({ url: rawUrl, w, order });
    order += 1;
  }

  if (!list.length) {
    return null;
  }

  const withW = list.filter((c) => c.w > 0);
  if (withW.length > 0) {
    return withW.reduce((best, c) => (c.w > best.w ? c : best)).url;
  }

  return list[list.length - 1].url;
}

function collectImageCandidate($element: any): string[] {
  const attrs = [
    $element.attr("data-zoom-image"),
    $element.attr("data-zoom"),
    $element.attr("data-large"),
    $element.attr("data-original"),
    $element.attr("data-src"),
    $element.attr("data-lazy"),
    $element.attr("src")
  ];

  const srcSet = $element.attr("srcset");
  if (srcSet) {
    const best = pickLargestSrcsetUrl(srcSet);
    if (best) {
      attrs.push(best);
    }
  }

  const parentHref = $element.closest?.("a")?.attr?.("href");
  if (parentHref && /csphoto\/(bkkn|ml)\//i.test(parentHref)) {
    attrs.push(parentHref);
  }

  return attrs.filter((value): value is string => Boolean(value));
}

/** URLs embedded in HTML/JSON (gallery often duplicates sizes here with full L-size). */
function extractCsphotoUrlsFromHtml(html: string): string[] {
  const found = new Set<string>();
  const abs =
    /https?:\/\/[a-z0-9.-]*carsensor\.net\/[^\s"'<>{}\\]+\/CSphoto\/(?:bkkn|ml)\/[^\s"'<>{}\\]+\.(?:jpe?g|png|webp)/gi;
  let m: RegExpExecArray | null;
  while ((m = abs.exec(html)) !== null) {
    found.add(m[0]);
  }

  const cdn =
    /https:\/\/ccsrpcml\.carsensor\.net\/[^\s"'<>{}\\]+\/CSphoto\/ml\/[^\s"'<>{}\\]+\.(?:jpe?g|png|webp)/gi;
  while ((m = cdn.exec(html)) !== null) {
    found.add(m[0]);
  }

  const quotedRel = /["'](\/CSphoto\/(?:bkkn|ml)\/[^"'?\s]+\.(?:jpe?g|png|webp))["']/gi;
  while ((m = quotedRel.exec(html)) !== null) {
    found.add(makeAbsoluteUrl(m[1]));
  }

  return [...found];
}

async function fetchText(url: string): Promise<string> {
  let lastError: unknown;
  for (const candidateUrl of fetchHtmlCandidates(url)) {
    for (let attempt = 0; attempt < FETCH_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(candidateUrl, {
          signal: controller.signal,
          headers: {
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
            accept: "text/html,application/xhtml+xml",
            "accept-language": "ja,en-US;q=0.8,en;q=0.7,ru-RU;q=0.6,ru;q=0.5",
            referer: BASE_URL
          }
        });

        if (!response.ok) {
          if ([408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
            throw new Error(`Transient status ${response.status} for ${candidateUrl}`);
          }
          throw new Error(`Failed to fetch ${candidateUrl}, status=${response.status}`);
        }

        const bytes = Buffer.from(await response.arrayBuffer());

        // Jina proxy returns UTF-8 text; origin can be Shift_JIS.
        const decodedCandidates = [
          bytes.toString("utf-8"),
          iconv.decode(bytes, "shift_jis"),
          iconv.decode(bytes, "euc-jp")
        ];

        return decodedCandidates
          .sort((a, b) => scoreJapaneseDecoding(b) - scoreJapaneseDecoding(a))
          .at(0) as string;
      } catch (error) {
        lastError = error;
        if (attempt < FETCH_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
        }
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

function safeText(html: string, selectors: string[]): string | undefined {
  const $ = load(html);
  for (const selector of selectors) {
    const text = $(selector).first().text().trim();
    if (text) {
      return text;
    }
  }

  return undefined;
}

function parseListingUrls(html: string): string[] {
  const $ = load(html);
  const urls = new Set<string>();

  $("a[href*='/usedcar/detail/']").each((_, element) => {
    const href = $(element).attr("href");
    if (href) {
      urls.add(makeAbsoluteUrl(href));
    }
  });

  return [...urls].slice(0, MAX_CARS_PER_RUN);
}

function parseCard(html: string, sourceUrl: string): RawCarCard {
  const $ = load(html);
  const externalId = extractExternalId(sourceUrl);
  const ordered: string[] = [];
  const seen = new Set<string>();

  function pushCarImage(raw: string) {
    if (!isLikelyCarImage(raw)) {
      return;
    }
    const normalized = normalizeImageUrl(raw);
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    ordered.push(normalized);
  }

  $("picture source[srcset]").each((_, element) => {
    const srcset = $(element).attr("srcset");
    if (srcset) {
      const best = pickLargestSrcsetUrl(srcset);
      if (best) {
        pushCarImage(best);
      }
    }
  });

  $("img").each((_, element) => {
    const candidates = collectImageCandidate($(element));
    for (const candidate of candidates) {
      pushCarImage(candidate);
    }
  });

  if (externalId) {
    const idUpper = externalId.toUpperCase();
    for (const raw of extractCsphotoUrlsFromHtml(html)) {
      if (raw.toUpperCase().includes(idUpper)) {
        pushCarImage(raw);
      }
    }
  }

  return {
    sourceUrl,
    title: safeText(html, ["h1", ".car_title", ".detail_title"]),
    makeRaw: safeText(html, [".maker", ".brand", "th:contains('メーカー') + td"]),
    modelRaw: safeText(html, [".model", ".car_model", "th:contains('車名') + td"]),
    yearRaw: safeText(html, ["th:contains('年式') + td", ".year"]),
    mileageRaw: safeText(html, ["th:contains('走行距離') + td", ".mileage"]),
    priceRaw: safeText(html, ["th:contains('価格') + td", ".price", ".total_price"]),
    transmissionRaw: safeText(html, ["th:contains('ミッション') + td", ".transmission"]),
    fuelRaw: safeText(html, ["th:contains('燃料') + td", ".fuel"]),
    locationRaw: safeText(html, ["th:contains('地域') + td", ".location"]),
    imageUrls: ordered.slice(0, MAX_IMAGES_PER_CAR)
  };
}

function extractExternalId(sourceUrl: string): string | undefined {
  const match = sourceUrl.match(/detail\/([A-Za-z0-9_-]+)/);
  return match?.[1];
}

function normalizeCard(raw: RawCarCard): NormalizedCar {
  const normalizedFromMakeField = normalizeMake(raw.makeRaw);
  const normalizedFromTitle = normalizeMake(raw.title?.split(" ")[0]);
  const make =
    normalizedFromMakeField !== "Неизвестно" && !/\d/.test(normalizedFromMakeField)
      ? normalizedFromMakeField
      : normalizedFromTitle;
  const model = normalizeModel(
    raw.modelRaw?.trim() ?? raw.title?.replace(raw.makeRaw ?? "", "").trim() ?? "Неизвестная модель",
    make
  );

  return {
    sourceUrl: raw.sourceUrl,
    externalId: extractExternalId(raw.sourceUrl),
    make,
    model,
    year: parseYear(raw.yearRaw),
    mileageKm: parseMileageToKm(raw.mileageRaw),
    priceJpy: parsePriceToJpy(raw.priceRaw),
    transmission: normalizeTransmission(raw.transmissionRaw),
    fuelType: normalizeFuel(raw.fuelRaw),
    location: normalizeLocation(raw.locationRaw?.trim()),
    descriptionRawJa: [
      raw.yearRaw,
      raw.mileageRaw,
      raw.priceRaw,
      raw.transmissionRaw,
      raw.fuelRaw
    ]
      .filter(Boolean)
      .join(" | "),
    descriptionNormalized: [
      `год=${parseYear(raw.yearRaw) ?? "-"}`,
      `пробег_км=${parseMileageToKm(raw.mileageRaw) ?? "-"}`,
      `цена_иен=${parsePriceToJpy(raw.priceRaw) ?? "-"}`
    ].join(", "),
    images: raw.imageUrls
  };
}

export async function scrapeCarsensorCars(): Promise<NormalizedCar[]> {
  const listingHtml = await fetchText(DEFAULT_LISTING_URL);
  const detailUrls = parseListingUrls(listingHtml);

  const cars: NormalizedCar[] = [];
  for (const url of detailUrls) {
    try {
      const detailHtml = await fetchText(url);
      const rawCard = parseCard(detailHtml, url);
      const normalized = normalizeCard(rawCard);
      cars.push(normalized);
    } catch (error) {
      console.error(`[worker] failed to parse card ${url}`, error);
    }
  }

  return cars;
}

export async function scrapeCarsensorCarByUrl(sourceUrl: string): Promise<NormalizedCar> {
  const detailHtml = await fetchText(sourceUrl);
  const rawCard = parseCard(detailHtml, sourceUrl);
  return normalizeCard(rawCard);
}
