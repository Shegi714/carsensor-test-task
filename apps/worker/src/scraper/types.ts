export type RawCarCard = {
  sourceUrl: string;
  title?: string;
  makeRaw?: string;
  modelRaw?: string;
  yearRaw?: string;
  mileageRaw?: string;
  priceRaw?: string;
  transmissionRaw?: string;
  fuelRaw?: string;
  locationRaw?: string;
  imageUrls: string[];
};

export type NormalizedCar = {
  sourceUrl: string;
  externalId?: string;
  make: string;
  model: string;
  year?: number;
  mileageKm?: number;
  priceJpy?: number;
  transmission?: string;
  fuelType?: string;
  location?: string;
  descriptionRawJa?: string;
  descriptionNormalized?: string;
  images: string[];
};
