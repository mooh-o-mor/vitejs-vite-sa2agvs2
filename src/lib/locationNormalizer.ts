/**
 * Нормализация и форматирование местоположений для приложения Морспасслужба
 * 
 * Формат исходных данных в coord_raw:
 * "порт деталь1 деталь2 опреснитель электропитание"
 * 
 * Пример: "п. Владивосток м. Поспелова пр. № 1 Да БЭП"
 */

/**
 * Извлекает и форматирует местоположение из строки coord_raw
 * Убирает опреснитель ("Да"/"Нет") и форматирует с запятыми
 * Электропитание не включается в результат (выводится отдельно)
 * 
 * @param coordRaw - сырая строка с координатами
 * @returns отформатированное местоположение без опреснителя и электропитания
 */
export function extractLocation(coordRaw: string): string {
  if (!coordRaw || coordRaw.trim() === '') {
    return '';
  }

  // Разбиваем строку на части по пробелам
  const parts = coordRaw.trim().split(/\s+/);
  
  if (parts.length === 0) {
    return coordRaw;
  }

  // Паттерны для определения опреснителя и электропитания
  const desalinatorPattern = /^(Да|Нет)$/i;
  const powerPattern = /^(БЭП|СЭП)$/i;
  
  // Находим индексы опреснителя и электропитания
  let desalinatorIndex = -1;
  let powerIndex = -1;
  
  for (let i = 0; i < parts.length; i++) {
    if (desalinatorPattern.test(parts[i])) {
      desalinatorIndex = i;
    } else if (powerPattern.test(parts[i])) {
      powerIndex = i;
    }
  }
  
  // Формируем массив частей, исключая опреснитель и электропитание
  const locationParts: string[] = [];
  
  for (let i = 0; i < parts.length; i++) {
    // Пропускаем опреснитель
    if (i === desalinatorIndex) {
      continue;
    }
    
    // Пропускаем электропитание (выводится отдельно)
    if (i === powerIndex) {
      continue;
    }
    
    locationParts.push(parts[i]);
  }
  
  // Форматируем: объединяем с запятыми
  let formattedLocation = locationParts.join(', ');
  
  // Если после форматирования строка пустая, возвращаем исходную без опреснителя
  if (formattedLocation === '') {
    // Альтернативный вариант: возвращаем все части кроме опреснителя и электропитания
    const fallbackParts = parts.filter((_, index) => 
      index !== desalinatorIndex && index !== powerIndex
    );
    formattedLocation = fallbackParts.join(', ');
  }
  
  return formattedLocation;
}

/**
 * Извлекает тип электропитания из строки coord_raw
 * 
 * @param coordRaw - сырая строка с координатами
 * @returns тип электропитания (БЭП, СЭП или пустая строка)
 */
export function extractPowerType(coordRaw: string): string {
  if (!coordRaw || coordRaw.trim() === '') {
    return '';
  }
  
  const parts = coordRaw.trim().split(/\s+/);
  const powerPattern = /^(БЭП|СЭП)$/i;
  
  const powerPart = parts.find(part => powerPattern.test(part));
  return powerPart || '';
}

/**
 * Проверяет, есть ли опреснитель на судне
 * 
 * @param coordRaw - сырая строка с координатами
 * @returns true если опреснитель есть (Да), false если нет (Нет) или не указан
 */
export function hasDesalinator(coordRaw: string): boolean {
  if (!coordRaw || coordRaw.trim() === '') {
    return false;
  }
  
  const parts = coordRaw.trim().split(/\s+/);
  const desalinatorIndex = parts.findIndex(part => /^(Да|Нет)$/i.test(part));
  
  if (desalinatorIndex === -1) {
    return false;
  }
  
  return parts[desalinatorIndex].toLowerCase() === 'да';
}

/**
 * Получает статус опреснителя в виде строки
 * 
 * @param coordRaw - сырая строка с координатами
 * @returns "Да", "Нет" или пустая строка
 */
export function getDesalinatorStatus(coordRaw: string): string {
  if (!coordRaw || coordRaw.trim() === '') {
    return '';
  }
  
  const parts = coordRaw.trim().split(/\s+/);
  const desalinatorPart = parts.find(part => /^(Да|Нет)$/i.test(part));
  
  if (!desalinatorPart) {
    return '';
  }
  
  // Возвращаем с заглавной буквы для единообразия
  return desalinatorPart.charAt(0).toUpperCase() + desalinatorPart.slice(1).toLowerCase();
}

/**
 * Получает все части местоположения в виде массива
 * 
 * @param coordRaw - сырая строка с координатами
 * @returns массив частей местоположения без опреснителя и электропитания
 */
export function getLocationParts(coordRaw: string): string[] {
  if (!coordRaw || coordRaw.trim() === '') {
    return [];
  }
  
  const parts = coordRaw.trim().split(/\s+/);
  const desalinatorPattern = /^(Да|Нет)$/i;
  const powerPattern = /^(БЭП|СЭП)$/i;
  
  return parts.filter(part => 
    !desalinatorPattern.test(part) && !powerPattern.test(part)
  );
}

/**
 * Основная функция для отображения полной информации о местоположении
 * Возвращает объект с разобранными данными
 * 
 * @param coordRaw - сырая строка с координатами
 * @returns объект с разобранными данными
 */
export function parseLocation(coordRaw: string): {
  location: string;
  powerType: string;
  hasDesalinator: boolean;
  desalinatorStatus: string;
  parts: string[];
} {
  return {
    location: extractLocation(coordRaw),
    powerType: extractPowerType(coordRaw),
    hasDesalinator: hasDesalinator(coordRaw),
    desalinatorStatus: getDesalinatorStatus(coordRaw),
    parts: getLocationParts(coordRaw)
  };
}
