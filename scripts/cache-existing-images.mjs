import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const uploadDir = path.resolve(process.cwd(), "uploads", "cars");

function sanitize(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function extFrom(url, contentType) {
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return ".jpg";
  const ext = path.extname(url.split("?")[0]);
  return ext || ".jpg";
}

async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8"
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function cacheImage(carKey, imageUrl) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchWithTimeout(imageUrl, 9000);
      if (!response.ok) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      const ext = extFrom(imageUrl, response.headers.get("content-type"));
      const fileName = `${sanitize(carKey)}${ext}`;
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, fileName), bytes);
      return `/uploads/cars/${fileName}`;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  return null;
}

async function main() {
  const cars = await prisma.car.findMany({
    where: { isActive: true },
    include: { images: true },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  let updated = 0;
  for (const car of cars) {
    const primary = car.images.find((i) => i.isMain)?.url ?? car.images[0]?.url;
    if (!primary) continue;
    if (primary.startsWith("/uploads/")) continue;

    const local = await cacheImage(car.externalId ?? car.id, primary);
    if (!local) continue;

    await prisma.carImage.deleteMany({ where: { carId: car.id } });
    await prisma.carImage.create({
      data: {
        carId: car.id,
        url: local,
        position: 0,
        isMain: true
      }
    });
    updated += 1;
    console.log(`updated ${car.id}`);
  }

  console.log(`done, updated=${updated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
