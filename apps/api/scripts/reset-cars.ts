import path from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const prisma = new PrismaClient();

async function main() {
  const r = await prisma.car.deleteMany({});
  console.log(`Deleted ${r.count} cars (images removed via cascade).`);

  const uploadsCars = path.resolve(__dirname, "../../../uploads/cars");
  await rm(uploadsCars, { recursive: true, force: true });
  console.log(`Cleared local image cache: ${uploadsCars}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  void prisma.$disconnect();
  process.exit(1);
});
