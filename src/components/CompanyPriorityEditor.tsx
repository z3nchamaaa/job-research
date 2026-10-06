"use client";

import { useRef, useState } from "react";

interface Props {
  companyId: string;
  priority: number;
  onUpdated: () => void | Promise<void>;
}

export default function CompanyPriorityEditor({ companyId, priority, onUpdated }: Props) {
  const saving = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [hasError, setHasError] = useState(false);

  const updatePriority = async (nextPriority: number) => {
    if (saving.current || nextPriority === priority) return;
    saving.current = true;
    setIsSaving(true);
    setHasError(false);
    setMessage("保存中…");
    try {
      const response = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: nextPriority }),
      });
      if (!response.ok) throw new Error("Priority update failed");
      await onUpdated();
      setMessage("保存しました");
    } catch {
      setHasError(true);
      setMessage("志望度を保存できませんでした。もう一度お試しください。");
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-xs text-on-surface-variant">志望度</span>
      <div role="group" aria-label="志望度（1〜5）" aria-busy={isSaving} className="flex shrink-0">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`志望度を${value}に変更`}
            aria-pressed={priority === value}
            disabled={isSaving}
            onClick={() => void updatePriority(value)}
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-2xl transition hover:bg-on-surface/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-50 ${value <= priority ? "text-amber-500" : "text-outline-variant"}`}
          >
            <span aria-hidden="true">{value <= priority ? "★" : "☆"}</span>
          </button>
        ))}
      </div>
      <span role="status" aria-live="polite" className={`text-xs ${hasError ? "text-error" : "text-on-surface-variant"}`}>
        {message}
      </span>
    </div>
  );
}
