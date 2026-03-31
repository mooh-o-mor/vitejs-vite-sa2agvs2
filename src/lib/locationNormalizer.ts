/* ── Замены аббревиатур портов ── */
const PORT_REPLACE: [RegExp, string][] = [
  [/(^|[\s,])СПб\.?($|[\s,])/gi, "$1Санкт-Петербург$2"],
  [/(^|[\s,])Клнг\.?($|[\s,.])/gi, "$1Калининград$2"],
  [/(^|[\s,])КЛД\.?($|[\s,.])/gi, "$1Калининград$2"],
  [/(^|[\s,])Петр-Камчатский($|[\s,])/gi, "$1Петропавловск-Камчатский$2"],
  [/камыш[\s-]бурун/gi, "Камыш-Бурун"],
];

/* ── Слова с которых начинаются детали (после запятой) ── */
const DETAIL_START = /^(пр|причал|терминал|наб|набережная|гр|м\.|мыс|ул|якорная|плавпричал|ПД|СРП|СРЗ|КФ|МСС|КМРП|ССРЗ|КТПБ|КМН|пос\.)/i;

/* ── Префиксы которые сохраняем ── */
const KEEP_PREFIX = /^(п\.|б\.|р\.|я\.)\s*/i;

export function extractLocation(raw: string): string {
  if (!raw) return "";

  // 1. Убираем Да/Нет (опреснитель) и БЭП/СЭП в конце
  let s = raw
    .replace(/[\s,]+(да|нет)\s*$/i, "")
    .replace(/\s*(БЭП|СЭП|CЭП)\s*$/i, "")
    .trim();

  // 2. Координаты не трогаем
  const isCoord =
    /\d{1,3}[-°\s]\d{1,2}[,.]?\d*\s*[NСнсCc°]/.test(s) ||
    /\d{2,3}\s+\d{2}[,.]?\d*\s*(сев|в\.)/i.test(s);
  if (isCoord) return s;

  // 3. Убираем "пос." в начале чтобы не было "п. пос. ..."
  s = s.replace(/^пос\.\s*/i, "");

  // 4. Сохраняем существующий префикс или добавляем "п."
  let prefix = "п.";
  const pm = s.match(KEEP_PREFIX);
  if (pm) {
    prefix = pm[1].toLowerCase();
    s = s.slice(pm[0].length).trim();
  }

  // 5. Заменяем аббревиатуры портов
  for (const [re, replacement] of PORT_REPLACE) {
    s = s.replace(re, replacement);
  }

  // 6. Убираем лишние символы в конце и двойные пробелы
  s = s.replace(/[.,\s]+$/, "").trim().replace(/\s{2,}/g, " ");

  // 7. Расставляем запятые: после названия порта перед деталями
  const parts = s.split(/\s+/);
  if (parts.length > 1) {
    const detailStart = parts.findIndex(
      (p, i) => i > 0 && DETAIL_START.test(p)
    );
    if (detailStart > 0) {
      const portPart = parts.slice(0, detailStart).join(" ");
      const detailPart = parts.slice(detailStart).join(" ");
      s = `${portPart}, ${detailPart}`;
    }
  }

  return `${prefix} ${s}`;
}
