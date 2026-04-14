import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import cron from "node-cron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../api/.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });
import { PrismaClient } from "@prisma/client";
import { normalizeImageUrl, scrapeCarsensorCars } from "./scraper/carsensor.js";
import { cacheImage } from "./image-cache.js";

const prisma = new PrismaClient();
const IMAGE_CACHE_PASSES = Number(process.env.IMAGE_CACHE_PASSES ?? 4);
/** Set to 1 once after upgrading photo URL logic so existing files are re-downloaded (same keys on disk). */
const IMAGE_CACHE_FORCE = process.env.IMAGE_CACHE_FORCE === "1";
const IMAGE_STORAGE_MODE = (process.env.IMAGE_STORAGE_MODE ?? "remote").toLowerCase();

async function syncCars() {
  console.log(`[worker] sync started at ${new Date().toISOString()}`);
  try {
    const cars = await scrapeCarsensorCars();
    let upserted = 0;

    for (const car of cars) {
      const carKey = car.externalId ?? Buffer.from(car.sourceUrl).toString("base64url").slice(0, 24);
      const existingImages = await prisma.carImage.findMany({
        where: { car: { sourceUrl: car.sourceUrl } },
        orderBy: { position: "asc" }
      });

      const finalImages: string[] = [];
      for (let index = 0; index < car.images.length; index += 1) {
        const remoteUrl = car.images[index];
        if (!remoteUrl) {
          continue;
        }
        if (IMAGE_STORAGE_MODE === "remote") {
          finalImages.push(normalizeImageUrl(remoteUrl));
          continue;
        }
        const localUrl = await cacheImage(carKey, index, remoteUrl, {
          passes: IMAGE_CACHE_PASSES,
          force: IMAGE_CACHE_FORCE
        });
        if (localUrl) {
          finalImages.push(localUrl);
          continue;
        }
        const fallback = existingImages[index]?.url;
        if (fallback && !fallback.startsWith("/uploads/")) {
          finalImages.push(fallback);
          continue;
        }

        // After deploy (ephemeral disk) or download failure: still show photos from CarSensor CDN.
        finalImages.push(normalizeImageUrl(remoteUrl));
      }

      const saved = await prisma.car.upsert({
        where: { sourceUrl: car.sourceUrl },
        update: {
          externalId: car.externalId,
          make: car.make,
          model: car.model,
          year: car.year,
          mileageKm: car.mileageKm,
          priceJpy: car.priceJpy,
          transmission: car.transmission,
          fuelType: car.fuelType,
          location: car.location,
          descriptionRawJa: car.descriptionRawJa,
          descriptionNormalized: car.descriptionNormalized,
          lastSeenAt: new Date(),
          isActive: true
        },
        create: {
          sourceUrl: car.sourceUrl,
          externalId: car.externalId,
          make: car.make,
          model: car.model,
          year: car.year,
          mileageKm: car.mileageKm,
          priceJpy: car.priceJpy,
          transmission: car.transmission,
          fuelType: car.fuelType,
          location: car.location,
          descriptionRawJa: car.descriptionRawJa,
          descriptionNormalized: car.descriptionNormalized
        }
      });

      if (finalImages.length > 0) {
        await prisma.carImage.deleteMany({ where: { carId: saved.id } });
        await prisma.carImage.createMany({
          data: finalImages.map((url, index) => ({
            carId: saved.id,
            url,
            position: index,
            isMain: index === 0
          }))
        });
      }

      upserted += 1;
    }

    console.log(`[worker] sync finished, upserted=${upserted}`);
  } catch (error) {
    console.error("[worker] sync failed:", error);
  }
}

cron.schedule("0 * * * *", () => {
  void syncCars();
});

console.log("[worker] scheduler started, job runs every hour");
void syncCars();
