/* ── Замены аббревиатур портов ── */
const PORT_REPLACE: [RegExp, string][] = [
  [/(^|[\s,])СПб\.?($|[\s,])/gi, "$1Санкт-Петербург$2"],
  [/(^|[\s,])Клнг\.?($|[\s,.])/gi, "$1Калининград$2"],
  [/(^|[\s,])КЛД\.?($|[\s,.])/gi, "$1Калининград$2"],
  [/(^|[\s,])Петр-Камчатский($|[\s,])/gi, "$1Петропавловск-Камчатский$2"],
  [/камыш[\s-]бурун/gi, "Камыш-Бурун"],
];

/* ── Префиксы которые сохраняем как есть ── */
const KEEP_PREFIX = /^(п\.|б\.|р\.|я\.)\s*/i;

export function extractLocation(raw: string): string {
  if (!raw) return "";

  // 1. Убираем опреснитель (Да/Нет) и электропитание (БЭП/СЭП) в конце строки
  let s = raw
    .replace(/\s+(Да|Нет)\s*$/i, "")
    .replace(/\s*(БЭП|СЭП|CЭП)\s*$/i, "")
    .trim();

  // 2. Координаты не трогаем
  const isCoord =
    /\d{1,3}[-°\s]\d{1,2}[,.]?\d*\s*[NСнсCc°]/.test(s) ||
    /\d{2,3}\s+\d{2}[,.]?\d*\s*(сев|в\.)/i.test(s);
  if (isCoord) return s;

  // 3. Сохраняем существующий префикс или добавляем "п."
  let prefix = "п.";
  const pm = s.match(KEEP_PREFIX);
  if (pm) {
    prefix = pm[1].toLowerCase();
    s = s.slice(pm[0].length).trim();
  }

  // 4. Заменяем аббревиатуры портов
  for (const [re, replacement] of PORT_REPLACE) {
    s = s.replace(re, replacement);
  }

  // 5. Убираем лишние точки/запятые в конце и двойные пробелы
  s = s.replace(/[.,\s]+$/, "").trim().replace(/\s{2,}/g, " ");

  return `${prefix} ${s}`;
}
