import { supabase } from "./supabase";

export let PORTS: Record<string, [number, number]> = {};

export async function loadPorts() {
  const { data, error } = await supabase
    .from("ports")
    .select("name, lat, lng");

  if (error) {
    console.error("Ошибка загрузки портов:", error);
    return;
  }

  if (data) {
    const newPorts: Record<string, [number, number]> = {};
    data.forEach((port: any) => {
      newPorts[port.name.toLowerCase()] = [port.lat, port.lng];
    });
    PORTS = newPorts;
    console.log(`Загружено ${Object.keys(PORTS).length} портов`);
  }
}
