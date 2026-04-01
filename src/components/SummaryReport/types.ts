// Типы для судов
export interface Vessel {
  id: number;
  name: string;
  type: string;
  branch: string;
  status: string;
  coordinates?: string;
  contract?: string;
  work_period?: string;
  note?: string;
  created_at?: string;
  updated_at?: string;
}

// Типы для контрактов
export interface Contract {
  id: number;
  vessel_name: string;
  contract_number: string;
  start_date: string;
  end_date: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

// Константы
export const T = {
  border: "#e0e0e0",
  text: "#333333",
  text2: "#666666",
  bg: "#ffffff",
};

export const typeOrder = (type: string): number => {
  const order: Record<string, number> = {
    "МФАСС": 1,
    "ТБС": 2,
    "ССН": 3,
    "АСС": 4,
    "НИС": 5,
    "МБС": 6,
    "МВС": 7,
    "МБ": 8,
    "БП": 9,
    "ВСП": 10,
    "Баржа": 11,
  };
  return order[type] || 999;
};

export const YEAR = new Date().getFullYear();

export const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

export const COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD",
  "#98D8C8", "#F7D794", "#F3A683", "#778BEB", "#EA868F", "#2C3A47",
  "#3B3B98", "#CD6133", "#B33771", "#F97F51", "#25CCF7", "#EAB543"
];

export const SPECIAL_COLORS = {
  "АСГ": "#2e7d32",
  "АСД": "#ed6c02",
  "РЕМ": "#d32f2f",
  "ПЛАВ": "#0288d1"
};

export const totalDays = (year: number): number => {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
};

export const yearStart = (year: number): Date => {
  return new Date(year, 0, 1);
};

export const yearEnd = (year: number): Date => {
  return new Date(year, 11, 31);
};
