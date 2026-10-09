"use client";

import { useState } from "react";
import type { ScheduleEventItem, CompanyItem } from "@/types";
import { EVENT_LABELS, calendarFile, googleCalendarUrl, localDateTime, nextEvent } from "@/lib/calendar";

interface Props {
  events: ScheduleEventItem[];
  companies: CompanyItem[];
  onEventCreated: () => void;
  onSelectCompany: (company: CompanyItem) => void;
  fixedCompany?: CompanyItem;
}
const fieldClass = "block min-w-0 w-full rounded-lg border border-outline bg-surface-container-high px-3 py-2 text-sm mt-1";
const buttonClass = "rounded-full border border-outline px-4 py-2 text-sm hover:bg-on-surface/8 disabled:opacity-50 cursor-pointer";

export default function ScheduleView({ events, companies, onEventCreated, onSelectCompany, fixedCompany }: Props) {
  const [draft, setDraft] = useState<Partial<ScheduleEventItem> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const upcoming = nextEvent(events);
  function update(values: Partial<ScheduleEventItem>) { setDraft(previous => ({ ...previous, ...values })); }
  async function request(url: string, method: string, body?: unknown) {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "予定を保存できませんでした。");
      onEventCreated(); return true;
    } catch (error) { setError(error instanceof Error ? error.message : "通信できませんでした。もう一度お試しください。"); return false; }
    finally { setBusy(false); }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!draft || busy) return;
    const start = new Date(draft.startAt || ""), end = draft.endAt ? new Date(draft.endAt) : null;
    if (!Number.isFinite(start.getTime()) || (end && (!Number.isFinite(end.getTime()) || end <= start))) {
      setError("終了日時は開始日時より後にしてください。"); return;
    }
    const payload = { title: draft.title, eventType: draft.eventType, companyId: fixedCompany?.id || draft.companyId || null,
      startAt: start.toISOString(), endAt: end?.toISOString() || null, location: draft.location || "", memo: draft.memo || "" };
    if (await request(draft.id ? `/api/events/${draft.id}` : "/api/events", draft.id ? "PATCH" : "POST", payload)) setDraft(null);
  }
  function download(event: ScheduleEventItem) {
    const url = URL.createObjectURL(new Blob([calendarFile(event)], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "job-event.ics";
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  return (
    <section className="space-y-4 min-w-0 text-on-surface">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">{fixedCompany ? "この企業の予定" : "面接・インターン・締切"}</h3>
        <button type="button" disabled={busy} className={buttonClass} onClick={() => { setError(""); setDraft({ title: "", companyId: fixedCompany?.id || "", eventType: "INTERVIEW", startAt: "", endAt: "" }); }}>予定・締切を追加</button>
      </div>
      {upcoming && <p className="rounded-xl bg-primary-container p-3 text-sm text-on-primary-container [overflow-wrap:anywhere]">次の予定：{new Date(upcoming.startAt).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" })}　{upcoming.title}</p>}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {draft && <form onSubmit={save} className="rounded-xl border border-outline-variant p-4 space-y-4 min-w-0">
        <h4 className="font-medium">{draft.id ? "予定を編集" : "予定を登録"}</h4>
        <label className="block text-sm">タイトル *<input className={fieldClass} required value={draft.title || ""} onChange={e => update({ title: e.target.value })} placeholder="例：最終面接、夏季インターン" /></label>
        {!fixedCompany && <label className="block text-sm">関連する企業<select aria-label="関連する企業" disabled={!!draft.id} className={fieldClass} value={draft.companyId || ""} onChange={e => update({ companyId: e.target.value })}><option value="">選択なし</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{draft.id && <span className="text-xs text-on-surface-variant">企業の紐づけは登録後に変更できません。</span>}</label>}
        <label className="block text-sm">種別<select aria-label="種別" className={fieldClass} value={draft.eventType} onChange={e => update({ eventType: e.target.value as ScheduleEventItem["eventType"] })}>{Object.entries(EVENT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
          <label className="block min-w-0 text-sm">開始日時 *<input className={fieldClass} type="datetime-local" required value={draft.startAt || ""} onChange={e => update({ startAt: e.target.value })} /></label>
          <label className="block min-w-0 text-sm">終了日時<input className={fieldClass} type="datetime-local" value={draft.endAt || ""} onChange={e => update({ endAt: e.target.value })} /></label>
        </div>
        <p className="text-xs text-on-surface-variant">日時はこの端末のタイムゾーンで入力します。終了日時が空欄の場合、カレンダーには1時間の予定として追加します。</p>
        <label className="block text-sm">場所・参加URL<input className={fieldClass} value={draft.location || ""} onChange={e => update({ location: e.target.value })} /></label>
        <label className="block text-sm">メモ<textarea className={fieldClass} rows={3} value={draft.memo || ""} onChange={e => update({ memo: e.target.value })} /></label>
        <div className="flex flex-wrap gap-2"><button disabled={busy} className={buttonClass} type="submit">{busy ? "保存中…" : "保存"}</button><button disabled={busy} className={buttonClass} type="button" onClick={() => { setDraft(null); setError(""); }}>キャンセル</button></div>
      </form>}
      {!events.length && <p className="text-sm text-on-surface-variant py-4">予定はまだありません。面接やインターンの日程を登録できます。</p>}
      <div className="grid grid-cols-1 gap-4">
        {[...events].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)).map(raw => {
          const event = { ...raw, company: fixedCompany ? { id: fixedCompany.id, name: fixedCompany.name, status: fixedCompany.status } : raw.company };
          return <article key={event.id} className="rounded-xl border border-outline-variant p-4 space-y-3 min-w-0 [overflow-wrap:anywhere]">
            <div className="flex flex-wrap gap-2 text-xs text-on-surface-variant"><span>{EVENT_LABELS[event.eventType] || "その他"}</span>{event.isDone && <span>完了</span>}</div>
            <h4 className={`font-medium ${event.isDone ? "line-through" : ""}`}>{event.title}</h4>
            {!fixedCompany && event.company && <button type="button" className="text-primary text-sm text-left" onClick={() => { const company = companies.find(c => c.id === event.company?.id); if (company) onSelectCompany(company); }}>{event.company.name}</button>}
            <p className="text-sm">{new Date(event.startAt).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" })}{event.endAt && ` ～ ${new Date(event.endAt).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" })}`}</p>
            {event.location && <p className="text-sm text-on-surface-variant">{event.location}</p>}
            {event.memo && <p className="text-sm whitespace-pre-wrap text-on-surface-variant">{event.memo}</p>}
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} type="button" className={buttonClass} onClick={() => { setError(""); setDraft({ ...event, startAt: localDateTime(event.startAt), endAt: event.endAt ? localDateTime(event.endAt) : "" }); }}>編集</button>
              <button disabled={busy} type="button" className={buttonClass} onClick={() => request(`/api/events/${event.id}`, "PATCH", { isDone: !event.isDone })}>{event.isDone ? "未完了に戻す" : "完了にする"}</button>
              <button disabled={busy} type="button" className={buttonClass} onClick={() => { if (confirm(`予定「${event.title}」を削除しますか？`)) request(`/api/events/${event.id}`, "DELETE"); }}>削除</button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className={`${buttonClass} inline-block`}>Googleカレンダーに追加</a>
              <button type="button" className={buttonClass} onClick={() => download(event)}>カレンダーファイル（.ics）</button>
            </div>
          </article>;
        })}
      </div>
      {!!events.length && <p className="text-xs text-on-surface-variant">Googleカレンダーは開いた画面で保存してください。.icsはAppleカレンダーやOutlookなどに取り込めます。アプリで予定を変更しても、追加済みのカレンダーには自動反映されません。</p>}
    </section>
  );
}
