import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { T } from "../../lib/types";

interface DprSettings {
  run_requested: boolean;
  status: "idle" | "running" | "done" | "error";
  last_run_at: string | null;
  last_run_msg: string | null;
}

const fmtTime = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
};

export function DprTriggerButton() {
  const [settings, setSettings] = useState<DprSettings | null>(null);
  const [requesting, setRequesting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("dpr_settings")
      .select("run_requested,status,last_run_at,last_run_msg")
      .eq("id", 1)
      .single();
    if (data) setSettings(data as DprSettings);
  };

  useEffect(() => {
    fetchSettings();
    intervalRef.current = setInterval(fetchSettings, 10_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const handleRun = async () => {
    setRequesting(true);
    await supabase
      .from("dpr_settings")
      .update({ run_requested: true })
      .eq("id", 1);
    await fetchSettings();
    setRequesting(false);
  };

  const isRunning = settings?.status === "running" || settings?.run_requested;
  const isError   = settings?.status === "error";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <button
        onClick={handleRun}
        disabled={isRunning || requesting}
        style={{
          padding: "5px 12px",
          borderRadius: 5,
          border: `1px solid ${isError ? "#e53935" : T.border}`,
          background: isRunning ? T.bg3 : isError ? "#fdecea" : T.accent,
          color: isRunning ? T.text2 : isError ? "#c62828" : "#fff",
          fontSize: 11,
          fontWeight: 600,
          cursor: isRunning ? "default" : "pointer",
          whiteSpace: "nowrap",
          transition: "all 0.15s",
        }}
      >
        {isRunning ? "⏳ Выполняется..." : isError ? "⚠ Повторить сбор" : "📥 Собрать ДПР"}
      </button>
      {settings && (
        <div style={{ fontSize: 9, color: isError ? "#c62828" : T.text2, lineHeight: 1.3 }}>
          {isError && settings.last_run_msg
            ? settings.last_run_msg.slice(0, 60)
            : settings.last_run_at
              ? `✓ ${fmtTime(settings.last_run_at)}`
              : ""}
        </div>
      )}
    </div>
  );
}
