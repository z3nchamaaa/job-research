"use client";

import { useState } from "react";
import { ScheduleEventItem, CompanyItem } from "@/types";
import { Calendar, Plus, Clock, MapPin, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";

interface Props {
  events: ScheduleEventItem[];
  companies: CompanyItem[];
  onEventCreated: () => void;
  onSelectCompany: (company: CompanyItem) => void;
}

const EVENT_TYPE_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  INTERVIEW: { label: "面接", bg: "bg-amber-100", text: "text-amber-900" },
  ES_DEADLINE: { label: "ES締切", bg: "bg-error-container", text: "text-on-error-container" },
  WEB_TEST: { label: "Webテスト", bg: "bg-primary-container", text: "text-on-primary-container" },
  BRIEFING: { label: "説明会", bg: "bg-tertiary-container", text: "text-on-tertiary-container" },
  OTHER: { label: "その他", bg: "bg-secondary-container", text: "text-on-secondary-container" },
};

export default function ScheduleView({ events, companies, onEventCreated, onSelectCompany }: Props) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [eventType, setEventType] = useState("INTERVIEW");
  const [startAt, setStartAt] = useState("");
  const [location, setLocation] = useState("");
  const [memo, setMemo] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleToggleDone = async (ev: ScheduleEventItem) => {
    try {
      const res = await fetch(`/api/events/${ev.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDone: !ev.isDone }),
      });
      if (!res.ok) {
        alert("予定の更新に失敗しました。");
        return;
      }
      onEventCreated();
    } catch (err) {
      console.error("Toggle event done error:", err);
      alert("予定の更新に失敗しました。");
    }
  };

  const handleDeleteEvent = async (ev: ScheduleEventItem) => {
    if (!confirm(`予定「${ev.title}」を削除しますか？`)) return;
    try {
      const res = await fetch(`/api/events/${ev.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        alert("予定の削除に失敗しました。");
        return;
      }
      onEventCreated();
    } catch (err) {
      console.error("Delete event error:", err);
      alert("予定の削除に失敗しました。");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startAt) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          companyId: companyId || null,
          eventType,
          startAt: new Date(startAt).toISOString(),
          location,
          memo,
        }),
      });
      if (res.ok) {
        setShowAddModal(false);
        setTitle("");
        setStartAt("");
        setLocation("");
        setMemo("");
        onEventCreated();
      }
    } catch (err) {
      console.error("Create event error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium text-on-surface flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          面接・締切スケジュール
        </h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary text-on-primary px-6 h-10 text-sm font-medium hover:shadow-sm hover:brightness-110 cursor-pointer"
        >
          <Plus className="h-4 w-4" /> 予定・締切を追加
        </button>
      </div>

      {/* イベント一覧 */}
      {events.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest text-on-surface-variant text-sm">
          予定が登録されていません。「予定・締切を追加」から面接やES締切を登録できます。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((ev) => {
            const typeInfo = EVENT_TYPE_LABELS[ev.eventType] || EVENT_TYPE_LABELS.OTHER;
            const startDate = new Date(ev.startAt);
            const isPast = startDate < new Date();

            return (
              <div
                key={ev.id}
                className={`rounded-xl border p-4 space-y-2.5 transition ${
                  ev.isDone
                    ? "border-outline-variant bg-surface-container text-on-surface-variant"
                    : isPast
                    ? "border-outline-variant bg-surface-container-lowest opacity-80"
                    : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${typeInfo.bg} ${typeInfo.text}`}>
                      {typeInfo.label}
                    </span>
                    {ev.isDone && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900">
                        完了
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-on-surface-variant font-medium">
                    <span>
                      {startDate.toLocaleDateString("ja-JP", {
                        month: "short",
                        day: "numeric",
                        weekday: "short",
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleDone(ev)}
                      title={ev.isDone ? "未完了に戻す" : "完了にする"}
                      className={`h-8 w-8 rounded-full inline-flex items-center justify-center transition cursor-pointer ${
                        ev.isDone
                          ? "text-emerald-700 hover:bg-emerald-50"
                          : "text-on-surface-variant hover:bg-on-surface/8 hover:text-emerald-700"
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteEvent(ev)}
                      title="予定を削除"
                      className="h-8 w-8 rounded-full inline-flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/8 transition cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <h4 className={`font-medium text-sm leading-snug ${ev.isDone ? "line-through text-on-surface-variant" : "text-on-surface"}`}>
                  {ev.title}
                </h4>

                {ev.company && (
                  <button
                    onClick={() => {
                      const matched = companies.find((c) => c.id === ev.company?.id);
                      if (matched) onSelectCompany(matched);
                    }}
                    className="text-xs text-primary hover:underline font-medium block text-left"
                  >
                    🏢 {ev.company.name}
                  </button>
                )}

                <div className="flex items-center gap-3 text-xs text-on-surface-variant pt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {startDate.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {ev.location && (
                    <span className="flex items-center gap-1 truncate max-w-[150px]">
                      <MapPin className="h-3.5 w-3.5" />
                      {ev.location}
                    </span>
                  )}
                </div>

                {ev.memo && (
                  <p className="text-xs text-on-surface-variant bg-surface-container-low p-2 rounded-lg border border-outline-variant">
                    {ev.memo}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* イベント追加モーダル */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/32 p-4 max-sm:p-0">
          <div className="relative w-full max-w-md rounded-[28px] bg-surface-container-high shadow-sm overflow-hidden my-8 max-h-[90vh] flex flex-col max-sm:h-dvh max-sm:max-h-none max-sm:rounded-none max-sm:my-0">
            <div className="px-6 pt-6 pb-2 shrink-0">
              <h3 className="text-2xl font-normal text-on-surface">予定・締切の新規登録</h3>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">タイトル *</label>
                  <input
                    type="text"
                    required
                    placeholder="例: 1次面接 / ES提出締切"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-outline bg-transparent px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">関連する企業</label>
                  <select
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    className="w-full rounded-lg border border-outline bg-surface-container-high px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="">（選択なし）</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">種別</label>
                    <select
                      value={eventType}
                      onChange={(e) => setEventType(e.target.value)}
                      className="w-full rounded-lg border border-outline bg-surface-container-high px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    >
                      <option value="INTERVIEW">面接</option>
                      <option value="ES_DEADLINE">ES締切</option>
                      <option value="WEB_TEST">Webテスト</option>
                      <option value="BRIEFING">説明会</option>
                      <option value="OTHER">その他</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">日時 *</label>
                    <input
                      type="datetime-local"
                      required
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                      className="w-full rounded-lg border border-outline bg-transparent px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">場所 / Zoom URL</label>
                  <input
                    type="text"
                    placeholder="例: Zoom (URL) または 本社3F"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full rounded-lg border border-outline bg-transparent px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">メモ</label>
                  <textarea
                    rows={2}
                    placeholder="持ち物や準備すること"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    className="w-full rounded-lg border border-outline bg-transparent p-2 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div className="px-6 py-4 shrink-0 flex justify-end gap-2 border-t border-outline-variant bg-surface-container-high">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-full text-primary px-4 h-10 text-sm font-medium hover:bg-primary/8 cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-full bg-primary text-on-primary px-6 h-10 text-sm font-medium hover:shadow-sm hover:brightness-110 disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? "保存中..." : "保存する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
