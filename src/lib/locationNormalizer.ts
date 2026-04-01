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
 * Убирает опреснитель ("Да"/"Нет") и форматирует с запятыми между логическими частями
 * Электропитание не включается в результат (выводится отдельно)
 * 
 * @param coordRaw - сырая строка с координатами
 * @returns отформатированное местоположение без опреснителя и электропитания
 */
export function extractLocation(coordRaw: string): string {
  if (!coordRaw || coordRaw.trim() === '') {
    return '';
  }

  let raw = coordRaw.trim();
  
  // Удаляем опреснитель (Да/Нет)
  raw = raw.replace(/\s+(Да|Нет)\s+/i, ' ');
  raw = raw.replace(/^(Да|Нет)\s+/i, '');
  raw = raw.replace(/\s+(Да|Нет)$/i, '');
  
  // Удаляем электропитание (БЭП/СЭП) из конца строки
  raw = raw.replace(/\s+(БЭП|СЭП)$/i, '');
  raw = raw.replace(/\s+(БЭП|СЭП)\s+/i, ' ');
  
  // Если после удаления остались лишние пробелы, нормализуем
  raw = raw.replace(/\s+/g, ' ').trim();
  
  if (!raw) {
    return '';
  }
  
  // Разбиваем на логические части
  // Части обычно разделены пробелами, но нужно сохранить составные элементы (например, "пр. № 1")
  const parts = splitIntoLogicalParts(raw);
  
  // Объединяем с запятыми
  return parts.join(', ');
}

/**
 * Разбивает строку на логические части для форматирования
 * Сохраняет составные элементы (например, "пр. № 1" как одну часть)
 */
function splitIntoLogicalParts(text: string): string[] {
  const parts: string[] = [];
  let currentPart = '';
  let i = 0;
  const words = text.split(/\s+/);
  
  while (i < words.length) {
    const word = words[i];
    
    // Если это сокращение с точкой (п., м., пр., ул., и т.д.)
    if (/^[а-яА-Яa-zA-Z]\.$/.test(word) && i + 1 < words.length) {
      // Начинаем составную часть
      currentPart = word;
      i++;
      
      // Собираем следующие слова, пока не встретим новое сокращение или конец
      while (i < words.length) {
        const nextWord = words[i];
        // Если следующее слово - сокращение с точкой, завершаем текущую часть
        if (/^[а-яА-Яa-zA-Z]\.$/.test(nextWord)) {
          break;
        }
        currentPart += ' ' + nextWord;
        i++;
      }
      parts.push(currentPart);
      currentPart = '';
    } 
    // Если это номер (№ или просто цифры) и предыдущая часть была сокращением
    else if ((word === '№' || /^\d+$/.test(word)) && parts.length > 0) {
      // Добавляем к последней части
      if (parts.length > 0) {
        parts[parts.length - 1] += ' ' + word;
      } else {
        parts.push(word);
      }
      i++;
    }
    // Если это географические координаты (с N, S, E, W)
    else if (/^[\d-]+[,.]?\d*$/.test(word) && i + 1 < words.length && /^[NSWE]$/i.test(words[i + 1])) {
      currentPart = word + ' ' + words[i + 1];
      i += 2;
      // Может быть вторая часть координат
      if (i < words.length && /^[\d-]+[,.]?\d*$/.test(words[i])) {
        currentPart += ' ' + words[i];
        i++;
        if (i < words.length && /^[NSWE]?$/i.test(words[i]) && words[i].length <= 2) {
          currentPart += ' ' + words[i];
          i++;
        }
      }
      parts.push(currentPart);
      currentPart = '';
    }
    else {
      // Обычное слово
      parts.push(word);
      i++;
    }
  }
  
  // Объединяем части, которые должны быть вместе (например, "п." + "Владивосток" -> "п. Владивосток")
  const mergedParts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    // Если это сокращение и следующая часть не является сокращением
    if (/^[а-яА-Яa-zA-Z]\.$/.test(part) && i + 1 < parts.length && !/^[а-яА-Яa-zA-Z]\.$/.test(parts[i + 1])) {
      mergedParts.push(part + ' ' + parts[i + 1]);
      i++; // пропускаем следующую часть
    } else {
      mergedParts.push(part);
    }
  }
  
  return mergedParts;
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
  
  const match = coordRaw.match(/(БЭП|СЭП)/i);
  return match ? match[1].toUpperCase() : '';
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
  
  const match = coordRaw.match(/\b(Да|Нет)\b/i);
  if (!match) {
    return false;
  }
  
  return match[1].toLowerCase() === 'да';
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
  
  const match = coordRaw.match(/\b(Да|Нет)\b/i);
  if (!match) {
    return '';
  }
  
  return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
}

/**
 * Получает все части местоположения в виде массива
 * 
 * @param coordRaw - сырая строка с координатами
 * @returns массив частей местоположения без опреснителя и электропитания
 */
export function getLocationParts(coordRaw: string): string[] {
  const location = extractLocation(coordRaw);
  if (!location) {
    return [];
  }
  
  // Разбиваем по запятым, но сохраняем составные части
  return location.split(', ').filter(part => part.trim() !== '');
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
