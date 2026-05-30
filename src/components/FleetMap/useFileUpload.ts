import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { parseMsgFiles } from "../../lib/parseDpr";

export function useFileUpload({
  dataSource,
  setDataSource,
  loadDates,
  setSelDate,
}: {
  dataSource: string;
  setDataSource: (ds: "branches" | "vessels") => void;
  loadDates: () => Promise<void>;
  setSelDate: (d: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");

  async function handleUpload(files: FileList) {
    setUploading(true);
    setUploadMsg("Обработка...");
    try {
      const { data: vesselList } = await supabase.from("vessels").select("name, branch");
      const branchMap = new Map<string, string>();
      (vesselList || []).forEach((v: any) => {
        const original = v.name.trim();
        const upper = original.toUpperCase();
        branchMap.set(original, v.branch);
        branchMap.set(upper, v.branch);
        const withoutPrefix = original.replace(/^(МФАСС|ТБС|ССН|МБС|МВС|МБ|НИС)\s+/i, "");
        if (withoutPrefix !== original) {
          branchMap.set(withoutPrefix, v.branch);
          branchMap.set(withoutPrefix.toUpperCase(), v.branch);
        }
      });

      const { vessels: parsed, date } = await parseMsgFiles(Array.from(files), branchMap);

      if (!parsed.length) { setUploadMsg("⚠ Данные не найдены"); setUploading(false); return; }
      if (!date) { setUploadMsg("⚠ Дата не определена"); setUploading(false); return; }

      const dateStr = date.toISOString().slice(0, 10);
      setUploadMsg(`Найдено ${parsed.length} судов за ${dateStr}, сохраняю...`);

      const { data: existing } = await supabase
        .from("dpr_entries")
        .select("vessel_name, contract_info, work_period")
        .eq("report_date", dateStr);

      let prevData = existing || [];
      if (prevData.filter((r: any) => r.contract_info || r.work_period).length === 0) {
        const { data: prevDates } = await supabase
          .from("dpr_entries")
          .select("report_date")
          .lt("report_date", dateStr)
          .order("report_date", { ascending: false })
          .limit(1);
        if (prevDates && prevDates.length > 0) {
          const { data: prevRecords } = await supabase
            .from("dpr_entries")
            .select("vessel_name, contract_info, work_period")
            .eq("report_date", prevDates[0].report_date);
          prevData = prevRecords || [];
        }
      }

      const existingMap = new Map(prevData.map((r: any) => [r.vessel_name, r]));

      const rows = parsed.map((v) => {
        const prev = existingMap.get(v.name);
        const branch = v.branch || branchMap.get(v.name.toUpperCase()) || branchMap.get(v.name) || "";
        return {
          vessel_name: v.name,
          branch,
          report_date: dateStr,
          status: v.status,
          coord_raw: v.coordRaw,
          lat: v.lat,
          lng: v.lng,
          note: v.note,
          supplies: v.supplies,
          contract_info: prev?.contract_info || null,
          work_period: prev?.work_period || null,
        };
      });

      let batchError = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await supabase.from("dpr_entries").upsert(rows, { onConflict: "vessel_name,report_date" });
        batchError = res.error;
        if (!batchError) break;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }

      if (!batchError) {
        setUploadMsg(`✓ Загружено: ${rows.length} судов`);
      } else {
        console.warn("Batch failed, falling back to individual upserts:", batchError);
        let ok = 0,
          fail = 0;
        for (const row of rows) {
          let error = null;
          for (let attempt = 0; attempt < 3; attempt++) {
            const res = await supabase.from("dpr_entries").upsert(row, { onConflict: "vessel_name,report_date" });
            error = res.error;
            if (!error) break;
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          }
          if (error) { fail++; console.error(row.vessel_name, error); } else ok++;
        }
        setUploadMsg(`✓ Загружено: ${ok} судов${fail ? `, ошибок: ${fail}` : ""}`);
      }

      const hasTextDpr = parsed.some((v) => v.isTextDpr);
      if (hasTextDpr && dataSource !== "branches") {
        setDataSource("branches");
      }

      await loadDates();
      setSelDate(dateStr);
    } catch (e: any) {
      setUploadMsg("Ошибка: " + (e?.message || e));
    }
    setUploading(false);
  }

  return { uploading, uploadMsg, handleUpload };
}
