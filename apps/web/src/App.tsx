import { useEffect, useMemo, useRef, useState } from "react";
import { API_URL, loadCarById, loadCars } from "./lib/api";
import type { Car } from "./lib/types";

function base64UrlEncodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toPreviewUrl(url: string): string {
  if (url.startsWith("/uploads/")) {
    return `${API_URL}${url}`;
  }
  let clean = url.replace(/\?.*$/, "");
  try {
    const u = new URL(clean.startsWith("//") ? `https:${clean}` : clean);
    if (/carsensor\.net$/i.test(u.hostname) || u.hostname.endsWith(".carsensor.net")) {
      if (/\/csphoto\/bkkn\//i.test(u.pathname)) {
        u.hostname = "ccsrpcml.carsensor.net";
        u.pathname = u.pathname.replace(/\/CSphoto\/bkkn\//i, "/CSphoto/ml/");
      } else if (
        /\/csphoto\/ml\//i.test(u.pathname) &&
        !/^ccsrpcml\./i.test(u.hostname)
      ) {
        u.hostname = "ccsrpcml.carsensor.net";
      }
      clean = u.toString();
    }
  } catch {
    // keep clean
  }
  if (/\/CSphoto\/(bkkn|ml)\//i.test(clean)) {
    const ext = "(?:JPG|JPEG|PNG|WEBP)";
    clean = clean
      .replace(new RegExp(`_001M(\\.${ext})`, "i"), "_001L$1")
      .replace(new RegExp(`_001S(\\.${ext})`, "i"), "_001L$1")
      .replace(new RegExp(`_001(\\.${ext})$`, "i"), "_001L$1")
      .replace(new RegExp(`_(\\d{3})M(\\.${ext})$`, "i"), "_$1L$2")
      .replace(new RegExp(`_(\\d{3})S(\\.${ext})$`, "i"), "_$1L$2")
      .replace(new RegExp(`_(\\d{3})(\\.${ext})$`, "i"), "_$1L$2");
  }
  try {
    const u = new URL(clean.startsWith("//") ? `https:${clean}` : clean);
    const host = u.hostname.toLowerCase();
    const path = u.pathname;
    if (
      (host === "ccsrpcml.carsensor.net" && /^\/CSphoto\/ml\//i.test(path)) ||
      (host === "www.carsensor.net" && /^\/CSphoto\/(bkkn|ml)\//i.test(path))
    ) {
      return `${API_URL}/m/b?t=${encodeURIComponent(base64UrlEncodeUtf8(u.toString()))}`;
    }
  } catch {
    // keep clean
  }
  return clean;
}

function Card({ car }: { car: Car }) {
  const main = car.images.find((item) => item.isMain)?.url ?? car.images[0]?.url;
  const sources = useMemo(() => {
    if (!main) {
      return [];
    }
    return [toPreviewUrl(main)];
  }, [main]);

  const [srcIndex, setSrcIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const image = sources[srcIndex];

  useEffect(() => {
    setSrcIndex(0);
    setFailed(false);
  }, [sources]);

  function moveNextSource() {
    setSrcIndex((prev) => {
      const next = prev + 1;
      if (next < sources.length) {
        return next;
      }
      setFailed(true);
      return prev;
    });
  }

  function onImageError() {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    moveNextSource();
  }

  function onImageLoad() {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  useEffect(() => {
    if (!image || failed) {
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      moveNextSource();
    }, 4500);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [image, failed, sources.length]);

  return (
    <article className="card">
      <div className="cardInner">
        <div className="imageWrap">
          {image && !failed ? (
            <img
              src={image}
              alt={`${car.make} ${car.model}`}
              loading="lazy"
              decoding="async"
              onError={onImageError}
              onLoad={onImageLoad}
            />
          ) : (
            <div className="imageFallback">Нет фото</div>
          )}
        </div>
        <div className="cardTitleWrap">
          <h3>{formatCarTitle(car)}</h3>
        </div>
      </div>
    </article>
  );
}

function formatPrice(priceJpy?: number | null): string {
  if (!priceJpy) {
    return "Цена не указана";
  }
  return `${new Intl.NumberFormat("ru-RU").format(priceJpy)} JPY`;
}

function formatMileage(mileageKm?: number | null): string {
  if (!mileageKm) {
    return "-";
  }
  return `${new Intl.NumberFormat("ru-RU").format(mileageKm)} км`;
}

function toViewValue(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

function localizeToRu(value?: string | null): string | null {
  if (!value) return value ?? null;
  const normalized = value.trim();
  const dictionary: Array<[RegExp, string]> = [
    [/\bsubaru\b/gi, "Субару"],
    [/\btoyota\b/gi, "Тойота"],
    [/\bnissan\b/gi, "Ниссан"],
    [/\bhonda\b/gi, "Хонда"],
    [/\bmazda\b/gi, "Мазда"],
    [/\bmitsubishi\b/gi, "Мицубиси"],
    [/\bsuzuki\b/gi, "Сузуки"],
    [/\blexus\b/gi, "Лексус"],
    [/\binfiniti\b/gi, "Инфинити"],
    [/\bforester\b/gi, "Форестер"],
    [/\bimpreza\b/gi, "Импреза"],
    [/\blegacy\b/gi, "Легаси"],
    [/\boutback\b/gi, "Аутбек"],
    [/\bautomatic\b/gi, "автомат"],
    [/\bmanual\b/gi, "механика"],
    [/\bcvt\b/gi, "вариатор"],
    [/\bhybrid\b/gi, "гибрид"],
    [/\bturbo\b/gi, "турбо"],
    [/\blimited\b/gi, "лимитед"],
    [/\bpremium\b/gi, "премиум"],
    [/\bsport\b/gi, "спорт"],
    [/\bdiesel\b/gi, "дизель"],
    [/\bpetrol\b|\bgasoline\b/gi, "бензин"],
    [/\bfour[- ]?wheel drive\b|\b4wd\b|\bawd\b/gi, "полный привод"],
    [/\bfwd\b/gi, "передний привод"],
    [/\brwd\b/gi, "задний привод"],
    [/\bsedan\b/gi, "седан"],
    [/\bhatchback\b/gi, "хэтчбек"],
    [/\bwagon\b/gi, "универсал"],
    [/\bsuv\b/gi, "внедорожник"],
    [/\bvan\b/gi, "фургон"],
    [/\bwhite\b/gi, "белый"],
    [/\bblack\b/gi, "черный"],
    [/\bgray\b|\bgrey\b/gi, "серый"],
    [/\bsilver\b/gi, "серебристый"],
    [/\bred\b/gi, "красный"],
    [/\bblue\b/gi, "синий"]
  ];

  return dictionary.reduce((acc, [pattern, translated]) => acc.replace(pattern, translated), normalized);
}

function prettifyModelTitle(value?: string | null): string {
  if (!value) return "-";

  const prepared = value
    .replaceAll("_", " ")
    .replace(/([a-zа-я])([A-ZА-Я])/g, "$1 $2")
    .replace(/([A-Za-zА-Яа-я])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-zА-Яа-я])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  const replacements: Array<[RegExp, string]> = [
    [/\bekusutoreiru\b/gi, "X-Trail"],
    [/\bsdnabi\b/gi, "SD-нави"],
    [/\bnabi\b/gi, "навигация"],
    [/\bbakukamera\b/gi, "камера заднего вида"],
    [/\brufureru\b/gi, "рейлинги на крыше"],
    [/\bbirutoin\s*etc\b/gi, "встроенный ETC"],
    [/\bdeji\b/gi, "цифровой"],
    [/\boinchiarumi\b/gi, "дюймовые литые диски"],
    [/\bburedoshiruba\b/gi, "цвет Blade Silver"],
    [/\b(arumi|alumi)\b/gi, "литые диски"],
    [/\bba\b/gi, ""],
    [/\bｍ\b/gi, ""]
  ];

  const localized = replacements.reduce((acc, [pattern, translated]) => acc.replace(pattern, translated), prepared);

  return localized
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

function formatCarTitle(car: Car): string {
  const make = localizeToRu(car.make) ?? "-";
  const model = prettifyModelTitle(localizeToRu(car.model));
  return `${make} ${model}`.trim();
}

function formatPrettyDescription(value?: string | null): string {
  if (!value) return "-";
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [rawKey, rawVal] = part.split("=").map((item) => item.trim());
      if (!rawKey || rawVal === undefined) {
        return part.replaceAll("_", " ");
      }
      const key = rawKey.replaceAll("_", " ");
      const prettyKey = key.charAt(0).toUpperCase() + key.slice(1);
      return `${prettyKey}: ${rawVal}`;
    });

  return parts.length > 0 ? parts.join("\n") : value.replaceAll("_", " ");
}

function CarDetails({
  car,
  onBack
}: {
  car: Car;
  onBack: () => void;
}) {
  const allImages = useMemo(() => {
    const list = car.images.length > 0 ? car.images : [];
    return list.map((item) => toPreviewUrl(item.url));
  }, [car.images]);

  const [activeIndex, setActiveIndex] = useState(0);
  const heroWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [car.id]);

  const activeImage = allImages[activeIndex];
  const hasImages = allImages.length > 0;

  const specs = [
    { label: "Марка", value: localizeToRu(car.make) },
    { label: "Модель", value: localizeToRu(car.model) },
    { label: "Год", value: car.year },
    { label: "Пробег", value: formatMileage(car.mileageKm) },
    { label: "Трансмиссия", value: localizeToRu(car.transmission) },
    { label: "Топливо", value: localizeToRu(car.fuelType) },
    { label: "Привод", value: localizeToRu(car.driveType) },
    { label: "Объем двигателя", value: localizeToRu(car.engineVolume) },
    { label: "Тип кузова", value: localizeToRu(car.bodyType) },
    { label: "Цвет", value: localizeToRu(car.color) },
    { label: "Локация", value: localizeToRu(car.location) },
    { label: "Описание", value: formatPrettyDescription(localizeToRu(car.descriptionNormalized)) }
  ];

  function showPrevImage() {
    setActiveIndex((prev) => (prev === 0 ? allImages.length - 1 : prev - 1));
  }

  function showNextImage() {
    setActiveIndex((prev) => (prev === allImages.length - 1 ? 0 : prev + 1));
  }

  async function openFullscreen() {
    if (!heroWrapRef.current) return;
    try {
      await heroWrapRef.current.requestFullscreen();
    } catch {
      // ignore fullscreen errors
    }
  }

  return (
    <section className="details">
      <button className="backButton" type="button" onClick={onBack}>
        ← Назад к списку
      </button>

      <header className="detailsHeader">
        <div className="titleBlock">
          <h2 className="detailsTitle">{formatCarTitle(car)}</h2>
        </div>
      </header>

      <div className="detailsLayout">
        <div className="galleryColumn">
          <div className="heroImageWrap" ref={heroWrapRef}>
            {hasImages && activeImage ? (
              <img src={activeImage} alt={`${car.make} ${car.model}`} className="heroImage" />
            ) : (
              <div className="imageFallback">Нет фото</div>
            )}
            {allImages.length > 1 ? (
              <>
                <button type="button" className="navOverlay navOverlayLeft" onClick={showPrevImage}>
                  ‹
                </button>
                <button type="button" className="navOverlay navOverlayRight" onClick={showNextImage}>
                  ›
                </button>
              </>
            ) : null}
            {hasImages ? (
              <button type="button" className="fullscreenButton" onClick={openFullscreen}>
                На весь экран
              </button>
            ) : null}
          </div>
          {allImages.length > 0 ? (
            <div className="thumbs">
              {allImages.map((url, index) => (
                <button
                  key={`${url}-${index}`}
                  type="button"
                  className={`thumb ${index === activeIndex ? "active" : ""}`}
                  onClick={() => setActiveIndex(index)}
                >
                  <img src={url} alt={`Фото ${index + 1}`} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="specsColumn">
          <p className="priceBadge priceBadge--inSpecsColumn">{formatPrice(car.priceJpy)}</p>
          <div className="specsList">
            {specs.map((spec) => (
              <div key={spec.label} className="specRow">
                <span>{spec.label}</span>
                <strong className={spec.label === "Описание" ? "specValueDescription" : undefined}>
                  {toViewValue(spec.value)}
                </strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function App() {
  const [items, setItems] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [selectedCar, setSelectedCar] = useState<Car | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  useEffect(() => {
    loadCars()
      .then((data) => setItems(data.items))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedCarId) {
      setSelectedCar(null);
      setDetailsError(null);
      setDetailsLoading(false);
      return;
    }

    setDetailsLoading(true);
    setDetailsError(null);
    loadCarById(selectedCarId)
      .then((car) => setSelectedCar(car))
      .catch((err: unknown) => {
        setDetailsError(err instanceof Error ? err.message : "Ошибка загрузки карточки");
      })
      .finally(() => setDetailsLoading(false));
  }, [selectedCarId]);

  return (
    <main className="container">
      <h1>Каталог автомобилей</h1>
      {selectedCarId ? (
        <>
          {detailsLoading ? <p>Загрузка карточки...</p> : null}
          {detailsError ? <p className="error">{detailsError}</p> : null}
          {!detailsLoading && !detailsError && selectedCar ? (
            <CarDetails car={selectedCar} onBack={() => setSelectedCarId(null)} />
          ) : null}
        </>
      ) : (
        <>
          {loading ? <p>Загрузка...</p> : null}
          {error ? <p className="error">{error}</p> : null}
          {!loading && !error ? (
            <section className="grid">
              {items.map((car) => (
                <button
                  key={car.id}
                  type="button"
                  className="cardButton"
                  onClick={() => setSelectedCarId(car.id)}
                >
                  <Card car={car} />
                </button>
              ))}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
