const kinds = ["INTERVIEW", "INTERNSHIP", "ES_DEADLINE", "WEB_TEST", "BRIEFING", "OTHER"];
export class EventInputError extends Error {}

export function eventInput(body: unknown, current?: { startAt: Date; endAt: Date | null }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new EventInputError("入力内容を確認してください。");
  const input = body as Record<string, unknown>;
  const data: { title?: string; eventType?: string; startAt?: Date; endAt?: Date | null; location?: string | null; memo?: string | null; isDone?: boolean } = {};
  for (const field of ["title", "location", "memo"] as const) {
    if (field in input) {
      const value = input[field];
      if (typeof value !== "string" && !(value === null && field !== "title")) throw new EventInputError("タイトル・場所・メモは文字で入力してください。");
      if (field === "title") data.title = (value as string).trim();
      else data[field] = value === null ? null : (value as string).trim();
    }
  }
  if ((!current || "title" in input) && !data.title) throw new EventInputError("タイトルを入力してください。");
  if (!current || "eventType" in input) {
    const value = input.eventType ?? "INTERVIEW";
    if (typeof value !== "string" || !kinds.includes(value)) throw new EventInputError("予定の種別を選んでください。");
    data.eventType = value;
  }
  for (const field of ["startAt", "endAt"] as const) {
    if (field in input || (!current && field === "startAt")) {
      const value = input[field];
      if (field === "endAt" && (value === null || value === "")) { data.endAt = null; continue; }
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new EventInputError("有効な日時を入力してください。");
      const [year, month, day] = value.slice(0, 10).split("-").map(Number);
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      if (month < 1 || month > 12 || day < 1 || day > [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] || Number(value.slice(11, 13)) > 23) throw new EventInputError("有効な日時を入力してください。");
      data[field] = new Date(value);
    }
  }
  const start = data.startAt ?? current?.startAt;
  const end = data.endAt === undefined ? current?.endAt : data.endAt;
  if (start && end && end <= start) throw new EventInputError("終了日時は開始日時より後にしてください。");
  if ("isDone" in input) {
    if (typeof input.isDone !== "boolean") throw new EventInputError("完了状態を確認してください。");
    data.isDone = input.isDone;
  }
  return data;
}
