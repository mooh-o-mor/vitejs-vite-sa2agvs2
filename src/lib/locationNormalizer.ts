// Словарь замен для нормализации местоположений
const locationMap: Record<string, string> = {
  // Порты с префиксом "п."
  "спб": "Санкт-Петербург",
  "санкт-петербург": "Санкт-Петербург",
  "санкт петербург": "Санкт-Петербург",
  "клнг": "Калининград",
  "калининград": "Калининград",
  "клд": "Калининград",
  "петр-камчатский": "Петропавловск-Камчатский",
  "петропавловск": "Петропавловск-Камчатский",
  "петропавловск-камчатский": "Петропавловск-Камчатский",
  "петр камчатский": "Петропавловск-Камчатский",
  "усть-луга": "Усть-Луга",
  "усть луга": "Усть-Луга",
  "астрахань": "Астрахань",
  "владивосток": "Владивосток",
  "мурманск": "Мурманск",
  "корсаков": "Корсаков",
  "пригородное": "Пригородное",
  "кандалакша": "Кандалакша",
  "витино": "Витино",
  "архангельск": "Архангельск",
  "новороссийск": "Новороссийск",
  "севастополь": "Севастополь",
  "керчь": "Керчь",
  "находка": "Находка",
  "ванино": "Ванино",
  "холмск": "Холмск",
  "магадан": "Магадан",
  "анадырь": "Анадырь",
  "певек": "Певек",
  "дудинка": "Дудинка",
  "тикси": "Тикси",
  "онега": "Онега",
  "нарьян-мар": "Нарьян-Мар",
  "сабетта": "Сабетта",
  "хатанга": "Хатанга",
  "восточный": "Восточный",
  "темрюк": "Темрюк",
  "беломорск": "Беломорск",
  "чжоушань": "Чжоушань",
  "шидао": "Шидао",
  "светлый": "Светлый",
  "янтарный": "Янтарный",
  "волна": "Волна",
  "усть-камчатск": "Усть-Камчатск",
  
  // Специальные места
  "камыш бурун": "Камыш-Бурун",
  "камыш-бурун": "Камыш-Бурун",
  "б. камыш бурун": "Камыш-Бурун",
  "поспелова": "мыс Поспелова",
  "первомайское": "Первомайское",
  "преголь": "СРП Преголь",
  "лукойл": "КМН Лукойл",
  "адм.макарова": "наб. Адмирала Макарова",
  "наб. адм.макарова": "наб. Адмирала Макарова",
};

// Функция нормализации местоположения
export function normalizeLocation(raw: string): string {
  if (!raw) return "";
  
  let normalized = raw.toLowerCase().trim();
  
  // Сохраняем БЭП/СЭП для добавления в конец
  let powerSuffix = "";
  const powerMatch = normalized.match(/(бэп|сэп)\s*$/i);
  if (powerMatch) {
    powerSuffix = powerMatch[1].toUpperCase();
    normalized = normalized.replace(/\s*(бэп|сэп)\s*$/i, "").trim();
  }
  
  // Сохраняем части для деталей
  let details = "";
  
  // Извлекаем детали (причалы, районы) для сохранения
  const detailMatches = normalized.match(/(пр\.\s*\d+|причал\s*\d+|р-н\s*[\d\w]+|пл\.\s*[\d\w]+)/i);
  if (detailMatches) {
    details = detailMatches[0];
    // Убираем детали из основной части для замены
    normalized = normalized.replace(detailMatches[0], "").trim();
  }
  
  // Убираем лишние запятые и точки в конце
  normalized = normalized.replace(/[.,]\s*$/, "").trim();
  
  // Применяем замены из словаря
  let replaced = false;
  for (const [key, value] of Object.entries(locationMap)) {
    if (normalized.includes(key)) {
      normalized = normalized.replace(new RegExp(key, "g"), value);
      replaced = true;
      break;
    }
  }
  
  // Если не нашли в словаре, делаем первую букву заглавной
  if (!replaced && normalized.length > 0) {
    normalized = normalized.split(" ").map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(" ");
  }
  
  // Формируем результат
  let result = "";
  
  // Определяем, добавлять ли префикс "п."
  const isPort = /(санкт-петербург|калининград|владивосток|мурманск|астрахань|корсаков|кандалакша|архангельск|новороссийск|севастополь|керчь|находка|ванино|холмск|магадан|анадырь|певек|дудинка|тикси|онега|нарьян-мар|сабетта|хатанга|восточный|темрюк|беломорск|усть-луга|светлый|янтарный|усть-камчатск|петропавловск-камчатский)/i.test(normalized);
  
  if (isPort) {
    result = `п. ${normalized}`;
  } else {
    result = normalized;
  }
  
  // Добавляем детали
  if (details) {
    // Форматируем детали
    let formattedDetails = details;
    if (formattedDetails.toLowerCase().startsWith("пр.")) {
      formattedDetails = formattedDetails.replace(/пр\.\s*/i, "пр. ");
    }
    if (formattedDetails.toLowerCase().startsWith("причал")) {
      formattedDetails = formattedDetails.replace(/причал\s*/i, "причал ");
    }
    result = `${result}, ${formattedDetails}`;
  }
  
  // Убираем лишние запятые и пробелы
  result = result.replace(/,\s*$/, "").replace(/\s+/g, " ");
  
  // Добавляем обратно БЭП/СЭП
  if (powerSuffix) {
    result = `${result} ${powerSuffix}`;
  }
  
  return result;
}

// Функция для извлечения только местоположения без БЭП/СЭП
export function extractLocation(raw: string): string {
  if (!raw) return "";
  const withoutPower = raw.replace(/\s*(БЭП|СЭП)\s*$/i, "").trim();
  return normalizeLocation(withoutPower);
}