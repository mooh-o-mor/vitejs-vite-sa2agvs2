import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import { mkPieIcon } from "./mapIcons";
import { PLATFORMS, platformIcon, WRECKS, wreckIcon } from "./mapData";

export function useMapInit(mapRef: React.RefObject<HTMLDivElement | null>) {
  const mapObj = useRef<L.Map | null>(null);
  const markersRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;

    const map = L.map(mapRef.current, {
      center: [62, 90],
      zoom: 3,
      zoomControl: false,
      attributionControl: false,
      zoomSnap: 1,
      zoomDelta: 1,
      wheelPxPerZoomLevel: 120,
    });

    map.on("wheel", (e: any) => {
      const delta = e.originalEvent.deltaY > 0 ? 1 : -1;
      const newZoom = Math.max(0, Math.min(map.getMaxZoom(), map.getZoom() + delta));
      map.setZoom(newZoom, { animate: false });
      e.originalEvent.preventDefault();
    });
    map.on("dblclick", (e: L.LeafletMouseEvent) => {
      e.originalEvent.preventDefault();
      map.setView(e.latlng, map.getZoom() + 2, { animate: true });
    });

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "", subdomains: "abc", maxZoom: 19 }
    ).addTo(map);

    (map.getPanes().tilePane as HTMLElement).style.filter = "saturate(30%) brightness(92%)";

    L.tileLayer(
      "https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png",
      { attribution: "", maxZoom: 18, minZoom: 1, opacity: 0.3 }
    ).addTo(map);

    PLATFORMS.forEach((p) => {
      const marker = L.marker([p.lat, p.lng], { icon: platformIcon });
      marker.bindTooltip(p.name, {
        permanent: false,
        direction: "top",
        className: "vessel-label-map",
      });
      marker.addTo(map);
    });

    fetch("/norwegian_eca.geojson")
      .then((r) => r.json())
      .then((data) => {
        L.geoJSON(data, {
          style: {
            color: "#16a34a",
            weight: 1.5,
            opacity: 0.7,
            fillColor: "#22c55e",
            fillOpacity: 0.07,
            dashArray: "6 4",
          },
        })
          .bindTooltip("ECA — Норвежское море (с 01.03.2026, SOx с 01.03.2027)", { sticky: true, className: "vessel-label-map" })
          .addTo(map);
      });

    WRECKS.forEach((w) => {
      const marker = L.marker([w.lat, w.lng], { icon: wreckIcon });
      marker.bindTooltip(w.name.replace("\\n", "<br>"), {
        permanent: false,
        direction: "top",
        className: "vessel-label-map",
      });
      marker.addTo(map);
    });

    markersRef.current = (L as any).markerClusterGroup({
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: false,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: false,
      iconCreateFunction: (cluster: any) => {
        const children = cluster.getAllChildMarkers();
        const counts = { asg: 0, asd: 0, rem: 0, oth: 0 } as Record<string, number>;
        const toKey = (s: string) =>
          s === "asg" ? "asg" : s === "asd" ? "asd" : s === "rem" ? "rem" : "oth";
        children.forEach((m: any) => {
          counts[toKey(m.options._status || "oth")]++;
        });
        return mkPieIcon(counts, children.length);
      },
    }).addTo(map);

    markersRef.current.on("clusterclick", (e: any) => {
      const cluster = e.layer;
      const children = cluster.getAllChildMarkers();
      const lats = new Set(children.map((m: any) => m.getLatLng().lat.toFixed(6)));
      const lngs = new Set(children.map((m: any) => m.getLatLng().lng.toFixed(6)));
      const allSameCoords = lats.size === 1 && lngs.size === 1;
      if (allSameCoords) {
        cluster.spiderfy();
      } else {
        cluster.zoomToBounds({ padding: [50, 50] });
      }
    });

    mapObj.current = map;

    mapRef.current.addEventListener("mousedown", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        map.setView([62, 90], 3, { animate: true });
      }
    });

    let touchStartTime = 0;

    mapRef.current.addEventListener("touchstart", () => {
      touchStartTime = Date.now();
    });

    mapRef.current.addEventListener("touchend", (e) => {
      if (Date.now() - touchStartTime > 600) {
        e.preventDefault();
        map.setView([62, 90], 3, { animate: true });
      }
    });

    return () => { map.remove(); mapObj.current = null; };
  }, []);

  return { mapObj, markersRef };
}
