import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { T } from "../../lib/types";

interface Props {
  value: string;
  vesselName: string;
  reportDate: string;
  field: "contract_info" | "note" | "work_period";
  onUpdate: (vesselName: string, field: string, newValue: string) => void;
  editable?: boolean;
  placeholder?: string;
}

export function EditableCell({ 
  value, 
  vesselName, 
  reportDate, 
  field,
  onUpdate,
  editable = true,
  placeholder = "✎ добавить"
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updateData = { [field]: editValue };
      const { error } = await supabase
        .from("dpr_entries")
        .update(updateData)
        .eq("vessel_name", vesselName)
        .eq("report_date", reportDate);
      
      if (error) throw error;
      onUpdate(vesselName, field, editValue);
      setIsEditing(false);
    } catch (err) {
      console.error("Ошибка сохранения:", err);
      alert("Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditValue(value || "");
      setIsEditing(false);
    }
  };

  if (!editable) {
    return <span style={{ color: T.text2, fontSize: 11 }}>{value || "—"}</span>;
  }

  if (isEditing) {
    return (
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          style={{
            padding: "4px 6px",
            borderRadius: 4,
            border: `1px solid ${T.accent}`,
            fontSize: 11,
            width: "100%",
            minWidth: field === "contract_info" ? 120 : field === "work_period" ? 140 : 160,
            background: "#fff",
          }}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "2px 6px",
            borderRadius: 4,
            border: "none",
            background: T.accent,
            color: "#fff",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          {saving ? "..." : "✓"}
        </button>
        <button
          onClick={() => {
            setEditValue(value || "");
            setIsEditing(false);
          }}
          style={{
            padding: "2px 6px",
            borderRadius: 4,
            border: `1px solid ${T.border}`,
            background: "transparent",
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>
    );
  }

  const isEmpty = !value || value === "";
  const isContract = field === "contract_info";
  const isWorkPeriod = field === "work_period";

  return (
    <div
      onClick={() => setIsEditing(true)}
      style={{
        cursor: "pointer",
        padding: "2px 4px",
        borderRadius: 4,
        background: isEmpty ? "#fef3c7" : "transparent",
        minWidth: isContract ? 120 : isWorkPeriod ? 140 : 160,
        color: isEmpty ? "#b45309" : T.text,
        border: "1px solid transparent",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = T.accent;
        e.currentTarget.style.background = isEmpty ? "#fff3e0" : "#f8fafc";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "transparent";
        e.currentTarget.style.background = isEmpty ? "#fef3c7" : "transparent";
      }}
    >
      {value || placeholder}
    </div>
  );
}