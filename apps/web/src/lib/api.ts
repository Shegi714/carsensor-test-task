import type { Car, CarsResponse } from "./types";

export const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
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
