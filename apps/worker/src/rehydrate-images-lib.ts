import type { PrismaClient } from "@prisma/client";
import { cacheImage } from "./image-cache.js";
import { normalizeImageUrl, scrapeCarsensorCarByUrl } from "./scraper/carsensor.js";

const IMAGE_CACHE_PASSES = Number(process.env.IMAGE_CACHE_PASSES ?? 4);
const SCRAPE_RETRIES = Number(process.env.REHYDRATE_SCRAPE_RETRIES ?? 3);

async function scrapeWithRetries(sourceUrl: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < SCRAPE_RETRIES; attempt += 1) {
    try {
      return await scrapeCarsensorCarByUrl(sourceUrl);
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function rehydrateAllCarImages(prisma: PrismaClient): Promise<void> {
  const cars = await prisma.car.findMany({
    select: { id: true, sourceUrl: true, externalId: true },
    orderBy: { createdAt: "desc" }
  });
  console.log(`[rehydrate] start, cars=${cars.length}`);

  let updated = 0;
  let skipped = 0;

  for (const [carIndex, car] of cars.entries()) {
    try {
      const scraped = await scrapeWithRetries(car.sourceUrl);
      const carKey =
        car.externalId ??
        scraped.externalId ??
        Buffer.from(car.sourceUrl).toString("base64url").slice(0, 24);
      const existingImages = await prisma.carImage.findMany({
        where: { carId: car.id },
        orderBy: { position: "asc" }
      });

      const finalImages: string[] = [];
      for (let index = 0; index < scraped.images.length; index += 1) {
        const remoteUrl = scraped.images[index];
        if (!remoteUrl) {
          continue;
        }
        const localUrl = await cacheImage(carKey, index, remoteUrl, {
          passes: IMAGE_CACHE_PASSES,
          force: true
        });
        if (localUrl) {
          finalImages.push(localUrl);
          continue;
        }

        const fallback = existingImages[index]?.url;
        if (fallback?.startsWith("/uploads/")) {
          finalImages.push(fallback);
          continue;
        }

        finalImages.push(normalizeImageUrl(remoteUrl));
      }

      if (finalImages.length === 0) {
        skipped += 1;
        console.log(`[rehydrate] ${carIndex + 1}/${cars.length} skipped (no images): ${car.id}`);
        continue;
      }

      await prisma.carImage.deleteMany({ where: { carId: car.id } });
      await prisma.carImage.createMany({
        data: finalImages.map((url, index) => ({
          carId: car.id,
          url,
          position: index,
          isMain: index === 0
        }))
      });
      updated += 1;
      console.log(
        `[rehydrate] ${carIndex + 1}/${cars.length} updated=${car.id} images=${finalImages.length}`
      );
    } catch (error) {
      skipped += 1;
      console.error(`[rehydrate] failed car=${car.id} url=${car.sourceUrl}`, error);
    }
  }

  console.log(`[rehydrate] done, updated=${updated}, skipped=${skipped}`);
}
