"use client";

import { useState } from "react";
import { Building2, X, Plus, Trash2 } from "lucide-react";
import { SelectionStatus, STATUS_LABELS } from "@/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ManualAddCompanyModal({ isOpen, onClose, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [jobType, setJobType] = useState("");
  const [priority, setPriority] = useState(3);
  const [status, setStatus] = useState<SelectionStatus>("APPLIED");
  const [isEarlySelection, setIsEarlySelection] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [myPageUrl, setMyPageUrl] = useState("");
  const [salary, setSalary] = useState("");
  const [benefits, setBenefits] = useState("");
  const [ratingSalary, setRatingSalary] = useState(0);
  const [ratingBenefits, setRatingBenefits] = useState(0);
  const [memo, setMemo] = useState("");
  const [steps, setSteps] = useState([
    { stepName: "エントリーシート提出", stepOrder: 1, memo: "" },
    { stepName: "1次面接", stepOrder: 2, memo: "" },
    { stepName: "最終面接", stepOrder: 3, memo: "" },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("企業名は必須です。");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          industry,
          jobType,
          priority,
          status,
          isEarlySelection,
          websiteUrl,
          myPageUrl,
          salary,
          benefits,
          ratingSalary,
          ratingBenefits,
          memo,
          steps: steps.map((s, idx) => ({ ...s, stepOrder: idx + 1, status: "PENDING" })),
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "登録に失敗しました。");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "エラーが発生しました。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/32 p-4 max-sm:p-0">
      <div className="relative w-full max-w-2xl rounded-[28px] bg-surface-container-high shadow-sm overflow-hidden my-8 max-h-[90vh] flex flex-col max-sm:h-dvh max-sm:max-h-none max-sm:rounded-none max-sm:my-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-2.5">
            <Building2 className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-normal text-on-surface">企業を手動で追加</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full h-10 w-10 inline-flex items-center justify-center text-on-surface-variant hover:bg-on-surface/8 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="rounded-xl bg-error-container text-on-error-container p-3 text-xs">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">企業名 *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：株式会社〇〇"
                className="w-full rounded-lg border border-outline bg-transparent px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">業界</label>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="例：IT / コンサル"
                className="w-full rounded-lg border border-outline bg-transparent px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">希望職種</label>
              <input
                type="text"
                value={jobType}
                onChange={(e) => setJobType(e.target.value)}
                placeholder="例：エンジニア職"
                className="w-full rounded-lg border border-outline bg-transparent px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">現在のステータス</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SelectionStatus)}
                className="w-full rounded-lg border border-outline bg-surface-container-high px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {Object.entries(STATUS_LABELS).map(([key, info]) => (
                  <option key={key} value={key}>
                    {info.label}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 mt-2 cursor-pointer select-none text-xs font-medium text-on-surface hover:text-primary">
                <input
                  type="checkbox"
                  checked={isEarlySelection}
                  onChange={(e) => setIsEarlySelection(e.target.checked)}
                  className="accent-primary rounded h-4 w-4"
                />
                <span>早期選考の案内あり</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">企業の採用URL</label>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-outline bg-transparent px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">マイページURL</label>
              <input
                type="url"
                value={myPageUrl}
                onChange={(e) => setMyPageUrl(e.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-outline bg-transparent px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 py-2">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">志望度 (優先度)</label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setPriority(star)}
                    className={`text-xl transition cursor-pointer ${star <= priority ? "text-amber-400 scale-110" : "text-outline-variant"}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">給与の魅力度</label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={`sal-${star}`}
                    type="button"
                    onClick={() => setRatingSalary(star)}
                    className={`text-xl transition cursor-pointer ${star <= ratingSalary ? "text-amber-400 scale-110" : "text-outline-variant"}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">福利厚生の魅力度</label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={`ben-${star}`}
                    type="button"
                    onClick={() => setRatingBenefits(star)}
                    className={`text-xl transition cursor-pointer ${star <= ratingBenefits ? "text-amber-400 scale-110" : "text-outline-variant"}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">給与メモ</label>
              <textarea
                rows={2}
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="例：初任給30万円、みなし残業20時間を含む"
                className="w-full rounded-lg border border-outline bg-transparent px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">福利厚生メモ</label>
              <textarea
                rows={2}
                value={benefits}
                onChange={(e) => setBenefits(e.target.value)}
                placeholder="例：家賃補助5万円、在宅勤務可"
                className="w-full rounded-lg border border-outline bg-transparent px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">メモ</label>
            <textarea
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="志望動機のメモや面談での気づきなど"
              className="w-full rounded-lg border border-outline bg-transparent px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* ステップ */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-on-surface-variant">選考ステップ</label>
              <button
                type="button"
                onClick={() => setSteps([...steps, { stepName: "新規ステップ", stepOrder: steps.length + 1, memo: "" }])}
                className="inline-flex items-center gap-1 rounded-full text-primary px-3 h-8 text-xs font-medium hover:bg-primary/8 transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> 追加
              </button>
            </div>
            <div className="space-y-2">
              {steps.map((st, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs font-medium text-on-surface-variant w-4 text-center">{idx + 1}.</span>
                  <input
                    type="text"
                    value={st.stepName}
                    onChange={(e) => {
                      const updated = [...steps];
                      updated[idx].stepName = e.target.value;
                      setSteps(updated);
                    }}
                    className="flex-1 rounded-lg border border-outline bg-transparent px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    placeholder="ステップ名"
                  />
                  <button
                    type="button"
                    onClick={() => setSteps(steps.filter((_, i) => i !== idx))}
                    className="rounded-full h-8 w-8 inline-flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/8 transition cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full text-primary px-4 h-10 text-sm font-medium hover:bg-primary/8 transition cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-full bg-primary text-on-primary px-6 h-10 text-sm font-medium hover:shadow-sm hover:brightness-110 disabled:opacity-50 transition cursor-pointer"
            >
              {isSaving ? "登録中..." : "登録する"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
