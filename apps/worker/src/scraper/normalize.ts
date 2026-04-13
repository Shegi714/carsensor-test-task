type Dictionary = Record<string, string>;

const makeDictionary: Dictionary = {
  トヨタ: "Тойота",
  日産: "Ниссан",
  ホンダ: "Хонда",
  マツダ: "Мазда",
  スバル: "Субару",
  三菱: "Мицубиси",
  スズキ: "Сузуки",
  ダイハツ: "Дайхатсу",
  レクサス: "Лексус"
};

const transmissionDictionary: Dictionary = {
  AT: "Автомат",
  オートマ: "Автомат",
  MT: "Механика",
  マニュアル: "Механика",
  CVT: "Вариатор"
};

const fuelDictionary: Dictionary = {
  ガソリン: "Бензин",
  軽油: "Дизель",
  ハイブリッド: "Гибрид",
  電気: "Электро",
  LPG: "LPG"
};

const locationDictionary: Dictionary = {
  北海道: "Хоккайдо",
  東北: "Тохоку",
  関東: "Канто",
  中部: "Тюбу",
  近畿: "Кансай",
  中国: "Тюгоку",
  四国: "Сикоку",
  九州: "Кюсю",
  沖縄: "Окинава"
};

const latinMakeDictionary: Dictionary = {
  toyota: "Тойота",
  nissan: "Ниссан",
  honda: "Хонда",
  mazda: "Мазда",
  subaru: "Субару",
  mitsubishi: "Мицубиси",
  suzuki: "Сузуки",
  daihatsu: "Дайхатсу",
  lexus: "Лексус",
  mini: "Мини",
  bmw: "БМВ",
  mercedes: "Мерседес",
  audi: "Ауди",
  volkswagen: "Фольксваген",
  alfa: "Альфа Ромео",
  arufua: "Альфа Ромео",
  romeo: "Альфа Ромео"
};

const modelWordDictionary: Dictionary = {
  furonto: "передняя",
  saido: "боковая",
  bakku: "задняя",
  kamera: "камера",
  kameraa: "камера",
  doraiburekoda: "видеорегистратор",
  navi: "навигация",
  nabi: "навигация",
  denki: "электро",
  deizeru: "дизель",
  regiyura: "бензин",
  shitohita: "подогрев сидений",
  etc: "ETC",
  awd: "4WD",
  led: "LED",
  sd: "SD"
};

function containsJapanese(value: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(value);
}

function katakanaToRomaji(value: string): string {
  const map: Record<string, string> = {
    ア: "a", イ: "i", ウ: "u", エ: "e", オ: "o",
    カ: "ka", キ: "ki", ク: "ku", ケ: "ke", コ: "ko",
    サ: "sa", シ: "shi", ス: "su", セ: "se", ソ: "so",
    タ: "ta", チ: "chi", ツ: "tsu", テ: "te", ト: "to",
    ナ: "na", ニ: "ni", ヌ: "nu", ネ: "ne", ノ: "no",
    ハ: "ha", ヒ: "hi", フ: "fu", ヘ: "he", ホ: "ho",
    マ: "ma", ミ: "mi", ム: "mu", メ: "me", モ: "mo",
    ヤ: "ya", ユ: "yu", ヨ: "yo",
    ラ: "ra", リ: "ri", ル: "ru", レ: "re", ロ: "ro",
    ワ: "wa", ヲ: "wo", ン: "n",
    ガ: "ga", ギ: "gi", グ: "gu", ゲ: "ge", ゴ: "go",
    ザ: "za", ジ: "ji", ズ: "zu", ゼ: "ze", ゾ: "zo",
    ダ: "da", ヂ: "ji", ヅ: "zu", デ: "de", ド: "do",
    バ: "ba", ビ: "bi", ブ: "bu", ベ: "be", ボ: "bo",
    パ: "pa", ピ: "pi", プ: "pu", ペ: "pe", ポ: "po",
    ァ: "a", ィ: "i", ゥ: "u", ェ: "e", ォ: "o",
    ャ: "ya", ュ: "yu", ョ: "yo",
    ー: "-"
  };

  return value
    .split("")
    .map((char) => map[char] ?? char)
    .join("")
    .replace(/-/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stripJapanese(value: string): string {
  return value.replace(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/g, " ");
}

function compactSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toLatinFallback(value: string): string {
  const romaji = katakanaToRomaji(value);
  const stripped = stripJapanese(romaji);
  return compactSpaces(stripped);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeLeadingMake(value: string, make?: string): string {
  if (!make) {
    return value;
  }

  const makeTokens = [
    make,
    ...Object.keys(latinMakeDictionary),
    ...Object.values(latinMakeDictionary),
    ...Object.keys(makeDictionary)
  ].filter(Boolean);

  let result = value;
  for (const token of makeTokens) {
    const pattern = new RegExp(`^${escapeRegex(token)}[\\s\\-_]*`, "i");
    result = result.replace(pattern, "");
  }

  return compactSpaces(result);
}

function translateModelWords(value: string): string {
  const parts = value.split(/\s+/);
  const translated = parts.map((part) => {
    const key = part.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (!key) {
      return part;
    }
    return modelWordDictionary[key] ?? part;
  });

  return compactSpaces(translated.join(" "));
}

export function normalizeMake(raw?: string): string {
  if (!raw) {
    return "Неизвестно";
  }

  const normalized = raw.trim();
  const mapped = makeDictionary[normalized];
  if (mapped) {
    return mapped;
  }

  const fallback = toLatinFallback(normalized);
  if (!fallback) {
    return "Неизвестно";
  }

  const firstToken = fallback.split(/\s+/)[0]?.toLowerCase();
  if (firstToken && latinMakeDictionary[firstToken]) {
    return latinMakeDictionary[firstToken];
  }

  return fallback;
}

export function normalizeTransmission(raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }

  const normalized = raw.trim();
  const mapped = transmissionDictionary[normalized];
  if (mapped) {
    return mapped;
  }

  const latin = toLatinFallback(normalized).toLowerCase();
  if (latin.includes("cvt")) {
    return "Вариатор";
  }
  if (latin.includes("at")) {
    return "Автомат";
  }
  if (latin.includes("mt")) {
    return "Механика";
  }

  return latin || normalized;
}

export function normalizeFuel(raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }

  const normalized = raw.trim();
  const mapped = fuelDictionary[normalized];
  if (mapped) {
    return mapped;
  }

  const latin = toLatinFallback(normalized).toLowerCase();
  if (latin.includes("regiyura") || latin.includes("gasolin") || latin.includes("petrol")) {
    return "Бензин";
  }
  if (latin.includes("deizeru") || latin.includes("diesel")) {
    return "Дизель";
  }
  if (latin.includes("haiburiddo") || latin.includes("hybrid")) {
    return "Гибрид";
  }
  if (latin.includes("electric") || latin.includes("denki")) {
    return "Электро";
  }

  return latin || normalized;
}

export function normalizeLocation(raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }

  const normalized = raw.trim();
  const mapped = locationDictionary[normalized];
  if (mapped) {
    return mapped;
  }
  return toLatinFallback(normalized) || normalized;
}

export function normalizeModel(raw?: string, make?: string): string {
  if (!raw) {
    return "Неизвестная модель";
  }

  const normalized = raw.trim();
  let base = normalized;
  if (containsJapanese(base)) {
    base = toLatinFallback(base);
  }

  if (!base) {
    return "Неизвестная модель";
  }

  base = removeLeadingMake(base, make);
  base = translateModelWords(base);
  base = base.replace(/[()（）]/g, " ").replace(/\s+/g, " ").trim();
  if (!base) {
    return "Неизвестная модель";
  }

  return toTitleCase(base);
}

export function parsePriceToJpy(raw?: string): number | undefined {
  if (!raw) {
    return undefined;
  }

  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) {
    return undefined;
  }

  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? value : undefined;
}

export function parseMileageToKm(raw?: string): number | undefined {
  if (!raw) {
    return undefined;
  }

  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) {
    return undefined;
  }

  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? value : undefined;
}

export function parseYear(raw?: string): number | undefined {
  if (!raw) {
    return undefined;
  }

  const match = raw.match(/(19|20)\d{2}/);
  if (!match) {
    return undefined;
  }

  const value = Number.parseInt(match[0], 10);
  return Number.isFinite(value) ? value : undefined;
}
