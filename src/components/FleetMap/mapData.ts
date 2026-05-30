import L from "leaflet";

export const PLATFORMS = [
  { name: "Невская (Д-33)",       lat: 55.52279,  lng: 20.14161  },
  { name: "Филановского",         lat: 45.02549,  lng: 48.53279  },
  { name: "Орлан",                lat: 52.4117,   lng: 143.3933  },
  { name: "Пильтун-Астохская Б",  lat: 52.932965, lng: 143.497391},
  { name: "Моликпак",             lat: 52.715942, lng: 143.566493},
  { name: "Лунская А",            lat: 51.4150,   lng: 143.6613  },
  { name: "Беркут",               lat: 52.4622,   lng: 143.6542  },
  { name: "Варандей",             lat: 69.05369,  lng: 58.15005  },
  { name: "Приразломная",         lat: 69.26611,  lng: 57.28615  },
];

export const WRECKS = [
  { name: "кофф.№1", lat: 45.0753, lng: 36.5312 },
  { name: "кофф.№3", lat: 45.0839, lng: 36.5406 },
  { name: "кофф.№2", lat: 45.0664, lng: 36.5411 },
];

export const platformIcon = L.divIcon({
  className: "",
  html: `<svg width="8" height="10" viewBox="0 0 16 20" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 0 C8 0 0 10 0 13.5 A8 8 0 0 0 16 13.5 C16 10 8 0 8 0 Z" fill="#000" stroke="#fff" stroke-width="1.5"/>
  </svg>`,
  iconSize: [8, 10],
  iconAnchor: [4, 10],
  tooltipAnchor: [0, -10],
});

export const wreckIcon = L.divIcon({
  className: "",
  html: `<svg width="8" height="8" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
    <line x1="1" y1="1" x2="15" y2="15" stroke="#cc0000" stroke-width="3" stroke-linecap="round"/>
    <line x1="15" y1="1" x2="1" y2="15" stroke="#cc0000" stroke-width="3" stroke-linecap="round"/>
  </svg>`,
  iconSize: [8, 8],
  iconAnchor: [4, 4],
  tooltipAnchor: [0, -6],
});
