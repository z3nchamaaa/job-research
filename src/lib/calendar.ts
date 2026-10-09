import type { ScheduleEventItem } from "../types/index.ts";

export const EVENT_LABELS = {
  INTERVIEW: "面接", INTERNSHIP: "インターン", ES_DEADLINE: "ES締切",
  WEB_TEST: "Webテスト", BRIEFING: "説明会", OTHER: "その他",
};

export function nextEvent(events: ScheduleEventItem[], now = Date.now()) {
  return events.filter(e => !e.isDone && new Date(e.endAt || e.startAt).getTime() >= now)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];
}

export function localDateTime(value: string) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const stamp = (value: string | Date) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const title = (e: ScheduleEventItem) => e.company?.name ? `${e.company.name}：${e.title}` : e.title;
const end = (e: ScheduleEventItem) => e.endAt || new Date(Date.parse(e.startAt) + 60 * 60 * 1000).toISOString();
const details = (e: ScheduleEventItem) => [e.memo, !e.endAt ? "終了日時が未設定のため、カレンダーでは1時間の予定にしています。" : ""].filter(Boolean).join("\n\n");

export function googleCalendarUrl(e: ScheduleEventItem) {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.search = new URLSearchParams({ action: "TEMPLATE", text: title(e), dates: `${stamp(e.startAt)}/${stamp(end(e))}`, details: details(e), location: e.location || "" }).toString();
  return url.href;
}

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

// RFC 5545: fold at 75 UTF-8 octets, without splitting a code point.
function fold(value: string) {
  const encoder = new TextEncoder();
  let line = "", bytes = 0;
  const lines: string[] = [];
  for (const char of value) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) { lines.push(line); line = " "; bytes = 1; }
    line += char; bytes += size;
  }
  lines.push(line);
  return lines.join("\r\n");
}

export function calendarFile(e: ScheduleEventItem, now = new Date()) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Job Research//Calendar//JA", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${escapeText(e.id)}@job-research.local`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(e.startAt)}`, `DTEND:${stamp(end(e))}`,
    `SUMMARY:${escapeText(title(e))}`, `LOCATION:${escapeText(e.location || "")}`, `DESCRIPTION:${escapeText(details(e))}`,
    "END:VEVENT", "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}
