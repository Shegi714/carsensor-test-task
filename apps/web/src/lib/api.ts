import type { Car, CarsResponse } from "./types";

/** Сборка без VITE_API_URL: на Render подставляем API по тому же суффиксу, что и carsensor-web. */
function resolveApiBase(): string {
  const env = import.meta.env.VITE_API_URL;
  if (typeof env === "string" && env.trim() !== "") return env.trim();
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    const m = /^carsensor-web((?:-[a-z0-9]+)?)\.onrender\.com$/i.exec(h);
    if (m) return `https://carsensor-api${m[1]}.onrender.com`;
  }
  return "http://localhost:4000";
}

export const API_URL = resolveApiBase().replace(/\/$/, "");
const DEMO_USERNAME = import.meta.env.VITE_DEMO_USERNAME ?? "admin";
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD ?? "admin123";

async function login(): Promise<string> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: DEMO_USERNAME, password: DEMO_PASSWORD })
  });

  if (!response.ok) {
    throw new Error("Не удалось авторизоваться");
  }

  const data = (await response.json()) as { accessToken: string };
  return data.accessToken;
}

export async function loadCars(): Promise<CarsResponse> {
  const token = await login();
  const response = await fetch(`${API_URL}/cars?page=1&limit=24&sortBy=createdAt&sortOrder=desc`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error("Не удалось загрузить список машин");
  }

  return (await response.json()) as CarsResponse;
}

export async function loadCarById(id: string): Promise<Car> {
  const token = await login();
  const response = await fetch(`${API_URL}/cars/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error("Не удалось загрузить карточку автомобиля");
  }

  return (await response.json()) as Car;
}
