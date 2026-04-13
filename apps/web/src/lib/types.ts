export type CarImage = {
  id: string;
  url: string;
  isMain: boolean;
  position?: number;
};

export type Car = {
  id: string;
  sourceUrl?: string;
  externalId?: string | null;
  make: string;
  model: string;
  year?: number | null;
  mileageKm?: number | null;
  priceJpy?: number | null;
  transmission?: string | null;
  fuelType?: string | null;
  driveType?: string | null;
  engineVolume?: string | null;
  bodyType?: string | null;
  color?: string | null;
  location?: string | null;
  descriptionRawJa?: string | null;
  descriptionNormalized?: string | null;
  images: CarImage[];
};

export type CarsResponse = {
  items: Car[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
