/**
 * 企業登録用JSON（AIプロンプトの出力形式）の厳密な検証・正規化。
 * AI生成結果の取り込みと手動貼り付けの登録の両方で使用する。
 */

export interface InterviewPrepTips {
  fitLevel: string | null;
  fitReason: string | null;
  appealPoints: string[];
  idealCandidate: string | null;
  expectedQuestions: string[];
  reverseQuestions: string[];
}

export interface CompanyDraftStep {
  stepName: string;
  stepOrder: number;
  memo: string | null;
}

export interface CompanyDraft {
  name: string;
  industry: string | null;
  jobType: string | null;
  websiteUrl: string | null;
  description: string | null;
  features: string | null;
  location: string | null;
  salary: string | null;
  benefits: string | null;
  ratingSalary: number | null;
  ratingBenefits: number | null;
  startingSalary: number | null;
  bonusTimes: number | null;
  bonusMonths: number | null;
  annualIncome: number | null;
  annualHolidays: number | null;
  fixedOvertime: string | null;
  housingAllowance: string | null;
  remoteWork: string | null;
  suggestedSteps: CompanyDraftStep[] | null;
  interviewPrepTips: InterviewPrepTips | null;
}

export type CompanyDraftResult =
  | { ok: true; draft: CompanyDraft }
  | { ok: false; error: string };

export interface CompanyCreateStep {
  stepName: string;
  stepOrder: number;
  memo?: string;
}

export interface CompanyCreatePayload {
  name: string;
  industry: string;
  jobType: string;
  websiteUrl: string;
  description: string;
  features: string;
  location: string;
  salary: string;
  benefits: string;
  ratingSalary: number;
  ratingBenefits: number;
  startingSalary: number | null;
  bonusTimes: number | null;
  bonusMonths: number | null;
  annualIncome: number | null;
  annualHolidays: number | null;
  fixedOvertime: string | null;
  housingAllowance: string | null;
  remoteWork: string | null;
  aiExtractedJson: string;
  status: string;
  priority: number;
  steps: CompanyCreateStep[];
}

export const MAX_DRAFT_JSON_LENGTH = 200_000;
const MAX_NAME_LENGTH = 200;
const MAX_TEXT_LENGTH = 20_000;
const MAX_LIST_ITEMS = 50;
const MAX_LIST_ITEM_LENGTH = 2_000;
const MAX_STEPS = 30;
const MAX_STEP_ORDER = 1_000;

export const DEFAULT_STEPS: readonly CompanyCreateStep[] = [
  { stepName: "エントリーシート提出", stepOrder: 1 },
  { stepName: "1次面接", stepOrder: 2 },
  { stepName: "最終面接", stepOrder: 3 },
];

class DraftValidationError extends Error {}

function fail(message: string): never {
  throw new DraftValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 先頭・末尾の ```json ... ``` フェンスを除去する（CRLF対応）。 */
export function stripJsonFence(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  const match = /^```(?:json)?[ \t]*\n([\s\S]*?)\n?```$/i.exec(normalized);
  return (match ? match[1] : normalized).trim();
}

function optionalString(
  obj: Record<string, unknown>,
  key: string,
  label: string,
  maxLength: number = MAX_TEXT_LENGTH
): string | null {
  const value = obj[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    fail(`${label}（${key}）は文字列または null で指定してください。`);
  }
  if (value.length > maxLength) {
    fail(`${label}（${key}）が長すぎます（${maxLength}文字まで）。`);
  }
  return value;
}

interface NumberRule {
  min: number;
  max: number;
  integer: boolean;
}

function optionalNumber(
  obj: Record<string, unknown>,
  key: string,
  label: string,
  rule: NumberRule
): number | null {
  const value = obj[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label}（${key}）は数値または null で指定してください。`);
  }
  if (rule.integer && !Number.isInteger(value)) {
    fail(`${label}（${key}）は整数で指定してください。`);
  }
  if (value < rule.min || value > rule.max) {
    fail(`${label}（${key}）は${rule.min}〜${rule.max}の範囲で指定してください。`);
  }
  return value;
}

function stringList(obj: Record<string, unknown>, key: string, label: string): string[] {
  const value = obj[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    fail(`${label}（${key}）は文字列の配列で指定してください。`);
  }
  if (value.length > MAX_LIST_ITEMS) {
    fail(`${label}（${key}）の項目が多すぎます（${MAX_LIST_ITEMS}件まで）。`);
  }
  return value.map((item: unknown, index: number) => {
    if (typeof item !== "string") {
      fail(`${label}（${key}）の${index + 1}番目が文字列ではありません。`);
    }
    if (item.length > MAX_LIST_ITEM_LENGTH) {
      fail(`${label}（${key}）の${index + 1}番目が長すぎます（${MAX_LIST_ITEM_LENGTH}文字まで）。`);
    }
    return item;
  });
}

function parseSteps(value: unknown): CompanyDraftStep[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    fail("選考ステップ（suggestedSteps）は配列で指定してください。");
  }
  if (value.length > MAX_STEPS) {
    fail(`選考ステップ（suggestedSteps）が多すぎます（${MAX_STEPS}件まで）。`);
  }
  return value.map((item: unknown, index: number): CompanyDraftStep => {
    const label = `選考ステップの${index + 1}番目`;
    if (!isRecord(item)) {
      fail(`${label}はオブジェクトで指定してください。`);
    }
    const stepName = item.stepName;
    if (typeof stepName !== "string" || stepName.trim() === "") {
      fail(`${label}の stepName は空でない文字列で指定してください。`);
    }
    if (stepName.length > MAX_NAME_LENGTH) {
      fail(`${label}の stepName が長すぎます（${MAX_NAME_LENGTH}文字まで）。`);
    }
    let stepOrder = index + 1;
    const rawOrder = item.stepOrder;
    if (rawOrder !== undefined && rawOrder !== null) {
      if (
        typeof rawOrder !== "number" ||
        !Number.isInteger(rawOrder) ||
        rawOrder < 0 ||
        rawOrder > MAX_STEP_ORDER
      ) {
        fail(`${label}の stepOrder は0〜${MAX_STEP_ORDER}の整数で指定してください。`);
      }
      stepOrder = rawOrder;
    }
    const memo = optionalString(item, "memo", `${label}のメモ`);
    return { stepName: stepName.trim(), stepOrder, memo };
  });
}

function parseInterviewPrepTips(value: unknown): InterviewPrepTips | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    fail("面接対策（interviewPrepTips）はオブジェクトで指定してください。");
  }
  return {
    fitLevel: optionalString(value, "fitLevel", "面接対策のマッチ度", MAX_LIST_ITEM_LENGTH),
    fitReason: optionalString(value, "fitReason", "面接対策のマッチ度の理由"),
    appealPoints: stringList(value, "appealPoints", "面接対策のアピールポイント"),
    idealCandidate: optionalString(value, "idealCandidate", "面接対策の求める人物像"),
    expectedQuestions: stringList(value, "expectedQuestions", "面接対策の想定質問"),
    reverseQuestions: stringList(value, "reverseQuestions", "面接対策の逆質問"),
  };
}

/**
 * 想定年収の正規化（単位: 万円）。
 * AI出力等の小数を許容し、0〜100,000万円の範囲検証後に四捨五入して整数（万円）とする。
 */
export function normalizeAnnualIncome(obj: Record<string, unknown>): number | null {
  const value = optionalNumber(obj, "annualIncome", "想定年収（万円）", {
    min: 0,
    max: 100_000,
    integer: false,
  });
  if (value === null) return null;
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

const RATING_RULE: NumberRule = { min: 0, max: 5, integer: true };

function validateDraft(obj: Record<string, unknown>): CompanyDraft {
  const rawName = obj.name;
  if (typeof rawName !== "string" || rawName.trim() === "") {
    fail("企業名(name)が空でない文字列としてJSONに含まれていません。");
  }
  const name = rawName.trim();
  if (name.length > MAX_NAME_LENGTH) {
    fail(`企業名(name)が長すぎます（${MAX_NAME_LENGTH}文字まで）。`);
  }

  return {
    name,
    industry: optionalString(obj, "industry", "業界"),
    jobType: optionalString(obj, "jobType", "職種"),
    websiteUrl: optionalString(obj, "websiteUrl", "WebサイトURL"),
    description: optionalString(obj, "description", "企業概要"),
    features: optionalString(obj, "features", "特徴"),
    location: optionalString(obj, "location", "勤務地"),
    salary: optionalString(obj, "salary", "給与メモ"),
    benefits: optionalString(obj, "benefits", "福利厚生"),
    ratingSalary: optionalNumber(obj, "ratingSalary", "給与レーティング", RATING_RULE),
    ratingBenefits: optionalNumber(obj, "ratingBenefits", "福利厚生レーティング", RATING_RULE),
    startingSalary: optionalNumber(obj, "startingSalary", "初任給（月額・円）", {
      min: 0,
      max: 10_000_000,
      integer: true,
    }),
    bonusTimes: optionalNumber(obj, "bonusTimes", "賞与回数", { min: 0, max: 12, integer: true }),
    bonusMonths: optionalNumber(obj, "bonusMonths", "賞与月数", { min: 0, max: 24, integer: false }),
    // 想定年収（単位: 万円）。小数を許容し、四捨五入して整数の万円にする。
    annualIncome: normalizeAnnualIncome(obj),
    annualHolidays: optionalNumber(obj, "annualHolidays", "年間休日", {
      min: 0,
      max: 366,
      integer: true,
    }),
    fixedOvertime: optionalString(obj, "fixedOvertime", "みなし残業", MAX_LIST_ITEM_LENGTH),
    housingAllowance: optionalString(obj, "housingAllowance", "住宅手当・社宅", MAX_LIST_ITEM_LENGTH),
    remoteWork: optionalString(obj, "remoteWork", "リモートワーク", MAX_LIST_ITEM_LENGTH),
    suggestedSteps: parseSteps(obj.suggestedSteps),
    interviewPrepTips: parseInterviewPrepTips(obj.interviewPrepTips),
  };
}

/**
 * テキスト（コードフェンス付き可）をパースし、登録案として検証・正規化する。
 * 不正な場合は日本語のエラーメッセージを返し、例外は投げない。
 */
export function parseCompanyDraft(text: string): CompanyDraftResult {
  const body = stripJsonFence(text);
  if (body === "") {
    return { ok: false, error: "JSONデータが空です。" };
  }
  if (body.length > MAX_DRAFT_JSON_LENGTH) {
    return {
      ok: false,
      error: `JSONデータが大きすぎます（${MAX_DRAFT_JSON_LENGTH}文字まで）。`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      ok: false,
      error: "正しいJSONフォーマットではありません。AIの出力をそのまま貼り付けてください。",
    };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: "JSONは { } で囲まれたオブジェクトである必要があります。" };
  }

  try {
    return { ok: true, draft: validateDraft(parsed) };
  } catch (err: unknown) {
    if (err instanceof DraftValidationError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "JSONの検証中に予期しないエラーが発生しました。" };
  }
}

/** 検証済みの登録案を /api/companies への POST ペイロードに変換する。 */
export function buildCompanyPayload(draft: CompanyDraft): CompanyCreatePayload {
  const steps: CompanyCreateStep[] =
    draft.suggestedSteps && draft.suggestedSteps.length > 0
      ? draft.suggestedSteps.map((step) => ({
          stepName: step.stepName,
          stepOrder: step.stepOrder,
          memo: step.memo ?? undefined,
        }))
      : DEFAULT_STEPS.map((step) => ({ ...step }));

  return {
    name: draft.name,
    industry: draft.industry ?? "",
    jobType: draft.jobType ?? "",
    websiteUrl: draft.websiteUrl ?? "",
    description: draft.description ?? "",
    features: draft.features ?? "",
    location: draft.location ?? "",
    salary: draft.salary ?? "",
    benefits: draft.benefits ?? "",
    ratingSalary: draft.ratingSalary ?? 0,
    ratingBenefits: draft.ratingBenefits ?? 0,
    startingSalary: draft.startingSalary,
    bonusTimes: draft.bonusTimes,
    bonusMonths: draft.bonusMonths,
    annualIncome: draft.annualIncome,
    annualHolidays: draft.annualHolidays,
    fixedOvertime: draft.fixedOvertime,
    housingAllowance: draft.housingAllowance,
    remoteWork: draft.remoteWork,
    aiExtractedJson: JSON.stringify(
      draft.interviewPrepTips ? { interviewPrepTips: draft.interviewPrepTips } : {}
    ),
    status: "INTERESTED",
    priority: 3,
    steps,
  };
}
