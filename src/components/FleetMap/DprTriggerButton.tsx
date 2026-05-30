import { useState, useEffect } from "react";
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
    const channel = supabase
      .channel("dpr-settings-changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dpr_settings", filter: "id=eq.1" },
        (payload) => setSettings(payload.new as DprSettings)
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Пока статус "running" — форсим ререндер раз в 30 сек, чтобы пересчитать isStale
  // (real-time подписка молчит, если демон мёртв и не шлёт UPDATE)
  useEffect(() => {
    if (settings?.status !== "running") return;
    const id = setInterval(() => setSettings(s => (s ? { ...s } : s)), 30_000);
    return () => clearInterval(id);
  }, [settings?.status]);

  const lastRunTs = settings?.last_run_at ? new Date(settings.last_run_at).getTime() : null;
  const isStale =
    (settings?.status === "running" && (!lastRunTs || Date.now() - lastRunTs > 10 * 60_000)) ||
    (!lastRunTs && (settings?.run_requested ?? false));

  const isRunning = !isStale && (settings?.status === "running" || settings?.run_requested);
  const isError   = settings?.status === "error";
  const btnStyle = isStale || isError ? "error" : isRunning ? "running" : "idle";

  const handleRun = async () => {
    setRequesting(true);
    if (isStale) {
      await supabase
        .from("dpr_settings")
        .update({ status: "idle", run_requested: true })
        .eq("id", 1);
    } else {
      await supabase
        .from("dpr_settings")
        .update({ run_requested: true })
        .eq("id", 1);
    }
    await fetchSettings();
    setRequesting(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <button
        onClick={handleRun}
        disabled={isRunning || requesting}
        style={{
          padding: "5px 12px",
          borderRadius: 5,
          border: `1px solid ${btnStyle === "error" ? "#e53935" : T.border}`,
          background: isRunning ? T.bg3 : btnStyle === "error" ? "#fdecea" : T.accent,
          color: isRunning ? T.text2 : btnStyle === "error" ? "#c62828" : "#fff",
          fontSize: 11,
          fontWeight: 600,
          cursor: isRunning ? "default" : "pointer",
          whiteSpace: "nowrap",
          transition: "all 0.15s",
        }}
      >
        {isStale ? "⚠ Демон не отвечает" : isRunning ? "⏳ Выполняется..." : isError ? "⚠ Повторить сбор" : "📥 Собрать ДПР"}
      </button>
      {settings && (
        <div style={{ fontSize: 9, color: btnStyle === "error" ? "#c62828" : T.text2, lineHeight: 1.3 }}>
          {isError && settings.last_run_msg
            ? settings.last_run_msg.slice(0, 60)
            : isStale
              ? "Нет ответа > 10 мин"
              : settings.last_run_at
                ? `✓ ${fmtTime(settings.last_run_at)}`
                : ""}
        </div>
      )}
    </div>
  );
}
