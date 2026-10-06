export type SelectionStatus =
  | "INTERESTED"    // 検討中・気になり
  | "APPLIED"       // エントリー済み・ES作成中
  | "ES_PASSED"     // 書類通過・Webテスト中
  | "INTERVIEWING"  // 面接選考中 (1次〜複数次)
  | "FINAL"         // 最終面接
  | "OFFER"         // 内定・内々定
  | "REJECTED"      // 不合格・お祈り
  | "WITHDRAWN";    // 辞退

export const STATUS_LABELS: Record<SelectionStatus, { label: string; color: string; bg: string; border: string }> = {
  INTERESTED: { label: "気になる・検討中", color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200" },
  APPLIED: { label: "ES・応募完了", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  ES_PASSED: { label: "書類通過・適性検査", color: "text-cyan-600", bg: "bg-cyan-50", border: "border-cyan-200" },
  INTERVIEWING: { label: "面接進行中", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  FINAL: { label: "最終面接", color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
  OFFER: { label: "内定獲得 🎉", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-300" },
  REJECTED: { label: "お祈り・不通過", color: "text-rose-600", bg: "bg-rose-50", border: "border-rose-200" },
  WITHDRAWN: { label: "辞退", color: "text-gray-500", bg: "bg-gray-100", border: "border-gray-200" },
};

export interface SelectionStepItem {
  id: string;
  companyId: string;
  stepName: string;
  stepOrder: number;
  status: "PENDING" | "PASSED" | "FAILED" | "SKIPPED";
  dueDate?: string | null;
  location?: string | null;
  memo?: string | null;
}

export interface InterviewNoteItem {
  id: string;
  companyId: string;
  stepName: string;
  interviewDate?: string | null;
  interviewer?: string | null;
  questions?: string | null;
  answers?: string | null;
  feedback?: string | null;
  nextAction?: string | null;
  createdAt: string;
}

export interface ScheduleEventItem {
  id: string;
  companyId?: string | null;
  company?: { id: string; name: string; status: string } | null;
  stepId?: string | null;
  title: string;
  eventType: "INTERVIEW" | "ES_DEADLINE" | "WEB_TEST" | "BRIEFING" | "OTHER";
  startAt: string;
  endAt?: string | null;
  location?: string | null;
  memo?: string | null;
  isDone: boolean;
}

export interface CompanyItem {
  id: string;
  name: string;
  industry?: string | null;
  jobType?: string | null;
  priority: number;
  status: SelectionStatus;
  isEarlySelection: boolean;
  websiteUrl?: string | null;
  myPageUrl?: string | null;
  myPageId?: string | null;
  myPagePassword?: string | null;
  description?: string | null;
  features?: string | null;
  location?: string | null;
  salary?: string | null;
  benefits?: string | null;
  ratingSalary: number;
  ratingBenefits: number;
  startingSalary?: number | null;
  bonusTimes?: number | null;
  bonusMonths?: number | null;
  annualIncome?: number | null;
  annualHolidays?: number | null;
  fixedOvertime?: string | null;
  housingAllowance?: string | null;
  remoteWork?: string | null;
  memo?: string | null;
  aiExtractedJson?: string | null;
  createdAt: string;
  updatedAt: string;
  steps: SelectionStepItem[];
  interviews: InterviewNoteItem[];
  events: ScheduleEventItem[];
}
