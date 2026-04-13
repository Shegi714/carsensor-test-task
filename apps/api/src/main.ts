import "dotenv/config";
import cors from "cors";
import express from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prisma = new PrismaClient();
const app = express();
const uploadsRoot =
  process.env.UPLOADS_DIR ?? path.resolve(process.cwd(), "..", "..", "uploads");

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadsRoot));

function parseAllowedCarsensorUpstream(rawUrl: string): URL | null {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return null;
  }
  if (target.protocol !== "https:") {
    return null;
  }
  const host = target.hostname.toLowerCase();
  const pathname = target.pathname;
  const allowed =
    (host === "ccsrpcml.carsensor.net" && /^\/CSphoto\/ml\//i.test(pathname)) ||
    (host === "www.carsensor.net" && /^\/CSphoto\/(bkkn|ml)\//i.test(pathname));
  return allowed ? target : null;
}

/**
 * CarSensor CDN 403s wrong Referer. Path/query avoid "proxy", "image", "carsensor" substrings so adblockers
 * (ERR_BLOCKED_BY_CLIENT) skip the request; target is base64url in `t`.
 */
app.get("/m/b", async (req, res) => {
  const raw = req.query.t;
  if (typeof raw !== "string" || raw.length > 8192) {
    return res.status(400).end();
  }

  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return res.status(400).end();
  }

  const target = parseAllowedCarsensorUpstream(decoded);
  if (!target) {
    return res.status(400).end();
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        referer: "https://www.carsensor.net/"
      }
    });

    if (!upstream.ok) {
      return res.status(upstream.status === 404 ? 404 : 502).end();
    }

    const ct = upstream.headers.get("content-type");
    if (ct) {
      res.setHeader("content-type", ct);
    }
    res.setHeader("cache-control", "public, max-age=86400");
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.status(200).send(buf);
  } catch {
    return res.status(502).end();
  }
});

const jwtSecret = process.env.JWT_SECRET ?? "dev_secret";
const jwtExpiresIn = (process.env.JWT_EXPIRES_IN ?? "12h") as SignOptions["expiresIn"];
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload." });
  }

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );

  return res.json({ accessToken: token });
});

function authMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing bearer token." });
  }

  const token = header.slice("Bearer ".length);
  try {
    jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  make: z.string().optional(),
  model: z.string().optional(),
  yearFrom: z.coerce.number().int().optional(),
  yearTo: z.coerce.number().int().optional(),
  priceFrom: z.coerce.number().int().optional(),
  priceTo: z.coerce.number().int().optional(),
  mileageFrom: z.coerce.number().int().optional(),
  mileageTo: z.coerce.number().int().optional(),
  sortBy: z.enum(["priceJpy", "year", "mileageKm", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc")
});

app.get("/cars", authMiddleware, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query params." });
  }

  const {
    page,
    limit,
    make,
    model,
    yearFrom,
    yearTo,
    priceFrom,
    priceTo,
    mileageFrom,
    mileageTo,
    sortBy,
    sortOrder
  } = parsed.data;

  const where = {
    isActive: true,
    ...(make ? { make: { contains: make, mode: "insensitive" as const } } : {}),
    ...(model ? { model: { contains: model, mode: "insensitive" as const } } : {}),
    ...(yearFrom || yearTo
      ? {
          year: {
            ...(yearFrom ? { gte: yearFrom } : {}),
            ...(yearTo ? { lte: yearTo } : {})
          }
        }
      : {}),
    ...(priceFrom || priceTo
      ? {
          priceJpy: {
            ...(priceFrom ? { gte: priceFrom } : {}),
            ...(priceTo ? { lte: priceTo } : {})
          }
        }
      : {}),
    ...(mileageFrom || mileageTo
      ? {
          mileageKm: {
            ...(mileageFrom ? { gte: mileageFrom } : {}),
            ...(mileageTo ? { lte: mileageTo } : {})
          }
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.car.findMany({
      where,
      include: { images: true },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.car.count({ where })
  ]);

  return res.json({
    items,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit)
  });
});

app.get("/cars/:id", authMiddleware, async (req, res) => {
  const car = await prisma.car.findUnique({
    where: { id: req.params.id },
    include: { images: true }
  });

  if (!car) {
    return res.status(404).json({ message: "Car not found." });
  }

  return res.json(car);
});

const webDistDir = process.env.WEB_DIST
  ? path.resolve(process.env.WEB_DIST)
  : path.resolve(__dirname, "../../web/dist");
if (existsSync(path.join(webDistDir, "index.html"))) {
  console.log(`[api] also serving SPA from ${webDistDir}`);
  app.use(express.static(webDistDir, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== "GET") {
      return next();
    }
    if (
      req.path.startsWith("/uploads") ||
      req.path.startsWith("/m/b") ||
      req.path === "/health" ||
      req.path.startsWith("/auth") ||
      req.path.startsWith("/cars")
    ) {
      return next();
    }
    if (path.extname(req.path)) {
      return next();
    }
    return res.sendFile(path.join(webDistDir, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`API started on http://localhost:${port}`);
});
