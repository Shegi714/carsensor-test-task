import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { rehydrateAllCarImages } from "./rehydrate-images-lib.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../api/.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const UPLOADS_ROOT =
  process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), "..", "..", "uploads");
const CARS_UPLOADS_DIR = path.resolve(UPLOADS_ROOT, "cars");

const prisma = new PrismaClient();

async function main() {
  console.log(`[fresh-images] removing ${CARS_UPLOADS_DIR}`);
  await rm(CARS_UPLOADS_DIR, { recursive: true, force: true });
  await mkdir(CARS_UPLOADS_DIR, { recursive: true });
  console.log("[fresh-images] cache cleared, re-downloading…");
  await rehydrateAllCarImages(prisma);
}

void main()
  .catch((error) => {
    console.error("[fresh-images] fatal error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
