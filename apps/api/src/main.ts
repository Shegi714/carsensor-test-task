import "dotenv/config";
import cors from "cors";
import express from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const prisma = new PrismaClient();
const app = express();
const uploadsRoot =
  process.env.UPLOADS_DIR && process.env.UPLOADS_DIR.trim() !== ""
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(__dirname, "../../../uploads");

app.set("trust proxy", true);
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86_400
  })
);
app.options("*", cors());
app.use(express.json());
// ORB: при кросс-доменном <img> браузер режет ответы без корректного image/* или с HTML-ошибкой.
app.use(
  "/uploads",
  express.static(uploadsRoot, {
    setHeaders(res) {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
  })
);
app.use("/uploads", (_req, res) => {
  res.status(404).type("text/plain").send("Not found");
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

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on 0.0.0.0:${port} (PORT=${process.env.PORT ?? ""})`);
});
