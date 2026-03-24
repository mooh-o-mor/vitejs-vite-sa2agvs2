import L from "leaflet";

export const CLR = { asg: "#e53935", asd: "#2e7d32", rem: "#757575", oth: "#6b8aa8" };
export const STATUS_BG = { asg: "#ffebee", asd: "#e8f5e9", rem: "#f5f5f5", oth: "#ffffff" };
export const STATUS_HEADER_BG = { asg: "#ffcdd2", asd: "#c8e6c9", rem: "#e0e0e0", oth: "#f5f5f5" };

export function mkIcon(c: string) {
  const color = CLR[c as keyof typeof CLR] || CLR.oth;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="32" viewBox="0 0 26 32">
    <path d="M13 0C5.8 0 0 5.8 0 13c0 9 13 19 13 19s13-10 13-19C26 5.8 20.2 0 13 0z" fill="white"/>
    <path d="M13 1.5C6.6 1.5 1.5 6.6 1.5 13c0 8.3 11.5 17.5 11.5 17.5S24.5 21.3 24.5 13C24.5 6.6 19.4 1.5 13 1.5z" fill="${color}"/>
    <circle cx="13" cy="13" r="4.5" fill="white" opacity=".9"/>
  </svg>`;
  return L.divIcon({ html: svg, iconSize: [26, 32], iconAnchor: [13, 32], popupAnchor: [0, -34], className: "" });
}

export function mkPieIcon(counts: Record<string, number>, total: number) {
  const sz = total < 5 ? 38 : total < 10 ? 44 : 50;
  const r = sz / 2;
  const ir = r * 0.55;
  const segments = [
    { key: "asg", count: counts.asg || 0, color: CLR.asg },
    { key: "asd", count: counts.asd || 0, color: CLR.asd },
    { key: "rem", count: counts.rem || 0, color: CLR.rem },
    { key: "oth", count: counts.oth || 0, color: CLR.oth },
  ].filter((s) => s.count > 0);

  let paths = "";
  if (segments.length === 1) {
    paths = `<circle cx="${r}" cy="${r}" r="${r}" fill="${segments[0].color}"/>`;
  } else {
    let startAngle = -Math.PI / 2;
    for (const seg of segments) {
      const angle = (seg.count / total) * 2 * Math.PI;
      const endAngle = startAngle + angle;
      const x1 = r + r * Math.cos(startAngle);
      const y1 = r + r * Math.sin(startAngle);
      const x2 = r + r * Math.cos(endAngle);
      const y2 = r + r * Math.sin(endAngle);
      const large = angle > Math.PI ? 1 : 0;
      paths += `<path d="M${r},${r} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large},1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${seg.color}"/>`;
      startAngle = endAngle;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 ${sz} ${sz}">
    <circle cx="${r}" cy="${r}" r="${r}" fill="white"/>
    ${paths}
    <circle cx="${r}" cy="${r}" r="${ir}" fill="white"/>
    <text x="${r}" y="${r}" text-anchor="middle" dominant-baseline="central"
      font-family="monospace" font-size="${total > 9 ? 11 : 13}" font-weight="700" fill="#1a2a3a">${total}</text>
  </svg>`;
  return L.divIcon({ html: svg, className: "", iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] });
}