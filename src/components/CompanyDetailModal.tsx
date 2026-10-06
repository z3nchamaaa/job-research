"use client";

import { useState } from "react";
import {
  Building2,
  X,
  ExternalLink,
  Calendar,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Plus,
  Trash2,
  Sparkles,
  Lightbulb,
  Edit2,
  Save,
  Wallet,
  Zap,
} from "lucide-react";
import { CompanyItem, STATUS_LABELS, SelectionStatus } from "@/types";

const STATUS_STYLES: Record<SelectionStatus, { bg: string; text: string }> = {
  INTERESTED: { bg: "bg-secondary-container", text: "text-on-secondary-container" },
  APPLIED: { bg: "bg-primary-container", text: "text-on-primary-container" },
  ES_PASSED: { bg: "bg-surface-container-highest", text: "text-on-surface" },
  INTERVIEWING: { bg: "bg-amber-100", text: "text-amber-900" },
  FINAL: { bg: "bg-tertiary-container", text: "text-on-tertiary-container" },
  OFFER: { bg: "bg-emerald-100", text: "text-emerald-900" },
  REJECTED: { bg: "bg-error-container", text: "text-on-error-container" },
  WITHDRAWN: { bg: "bg-surface-container-highest", text: "text-on-surface-variant" },
};

interface Props {
  company: CompanyItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

export default function CompanyDetailModal({ company, isOpen, onClose, onUpdated }: Props) {
  const [activeTab, setActiveTab] = useState<"steps" | "interviews" | "compensation" | "ai_prep" | "memo">("steps");

  // 面接追加フォーム
  const [showAddInterview, setShowAddInterview] = useState(false);
  const [interviewStepName, setInterviewStepName] = useState("1次面接");
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [questions, setQuestions] = useState("");
  const [answers, setAnswers] = useState("");
  const [feedback, setFeedback] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [isSubmittingInterview, setIsSubmittingInterview] = useState(false);

  // 編集モード (企業メモ・マイページ)
  const [isEditing, setIsEditing] = useState(false);
  const [editMemo, setEditMemo] = useState(company?.memo || "");
  const [editMyPageUrl, setEditMyPageUrl] = useState(company?.myPageUrl || "");
  const [editMyPageId, setEditMyPageId] = useState(company?.myPageId || "");

  // 編集モード (給与・福利厚生)
  const [isEditingCompensation, setIsEditingCompensation] = useState(false);
  const [editStartingSalary, setEditStartingSalary] = useState(
    company?.startingSalary != null ? String(company.startingSalary) : ""
  );
  const [editBonusTimes, setEditBonusTimes] = useState(
    company?.bonusTimes != null ? String(company.bonusTimes) : ""
  );
  const [editBonusMonths, setEditBonusMonths] = useState(
    company?.bonusMonths != null ? String(company.bonusMonths) : ""
  );
  const [editAnnualIncome, setEditAnnualIncome] = useState(
    company?.annualIncome != null ? String(company.annualIncome) : ""
  );
  const [editAnnualHolidays, setEditAnnualHolidays] = useState(
    company?.annualHolidays != null ? String(company.annualHolidays) : ""
  );
  const [editFixedOvertime, setEditFixedOvertime] = useState(company?.fixedOvertime || "");
  const [editHousingAllowance, setEditHousingAllowance] = useState(company?.housingAllowance || "");
  const [editRemoteWork, setEditRemoteWork] = useState(company?.remoteWork || "");
  const [editSalary, setEditSalary] = useState(company?.salary || "");
  const [editBenefits, setEditBenefits] = useState(company?.benefits || "");
  const [editRatingSalary, setEditRatingSalary] = useState(company?.ratingSalary || 0);
  const [editRatingBenefits, setEditRatingBenefits] = useState(company?.ratingBenefits || 0);

  if (!isOpen || !company) return null;

  // AI抽出データのパース
  let aiData: any = null;
  if (company.aiExtractedJson) {
    try {
      aiData = typeof company.aiExtractedJson === "string" ? JSON.parse(company.aiExtractedJson) : company.aiExtractedJson;
    } catch (e) {
      console.warn("Failed to parse AI data:", e);
    }
  }

  const handleStatusChange = async (newStatus: SelectionStatus) => {
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        alert("ステータスの更新に失敗しました。");
        return;
      }
      onUpdated();
    } catch (err) {
      console.error("Status update error:", err);
      alert("ステータスの更新に失敗しました。");
    }
  };

  const handleToggleEarlySelection = async () => {
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEarlySelection: !company.isEarlySelection }),
      });
      if (!res.ok) {
        alert("早期選考の更新に失敗しました。");
        return;
      }
      onUpdated();
    } catch (err) {
      console.error("Early selection update error:", err);
      alert("早期選考の更新に失敗しました。");
    }
  };

  const handleStepStatusChange = async (stepId: string, status: string) => {
    try {
      const res = await fetch(`/api/steps/${stepId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        alert("ステップの更新に失敗しました。");
        return;
      }
      onUpdated();
    } catch (err) {
      console.error("Step status update error:", err);
      alert("ステップの更新に失敗しました。");
    }
  };

  const handleSaveInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingInterview(true);
    try {
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: company.id,
          stepName: interviewStepName,
          interviewDate: interviewDate || new Date().toISOString(),
          interviewer,
          questions,
          answers,
          feedback,
          nextAction,
        }),
      });
      if (!res.ok) {
        alert("面接ログの保存に失敗しました。");
        return;
      }
      setShowAddInterview(false);
      setQuestions("");
      setAnswers("");
      setFeedback("");
      setNextAction("");
      onUpdated();
    } catch (err) {
      console.error("Save interview error:", err);
      alert("面接ログの保存に失敗しました。");
    } finally {
      setIsSubmittingInterview(false);
    }
  };

  const handleSaveInfo = async () => {
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memo: editMemo,
          myPageUrl: editMyPageUrl,
          myPageId: editMyPageId,
        }),
      });
      if (!res.ok) {
        alert("企業情報の保存に失敗しました。");
        return;
      }
      setIsEditing(false);
      onUpdated();
    } catch (err) {
      console.error("Update info error:", err);
      alert("企業情報の保存に失敗しました。");
    }
  };

  const handleSaveCompensation = async () => {
    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startingSalary: editStartingSalary === "" ? null : editStartingSalary,
          bonusTimes: editBonusTimes === "" ? null : editBonusTimes,
          bonusMonths: editBonusMonths === "" ? null : editBonusMonths,
          annualIncome: editAnnualIncome === "" ? null : editAnnualIncome,
          annualHolidays: editAnnualHolidays === "" ? null : editAnnualHolidays,
          fixedOvertime: editFixedOvertime === "" ? null : editFixedOvertime,
          housingAllowance: editHousingAllowance === "" ? null : editHousingAllowance,
          remoteWork: editRemoteWork === "" ? null : editRemoteWork,
          salary: editSalary,
          benefits: editBenefits,
          ratingSalary: editRatingSalary,
          ratingBenefits: editRatingBenefits,
        }),
      });
      if (!res.ok) {
        alert("給与・福利厚生の保存に失敗しました。");
        return;
      }
      setIsEditingCompensation(false);
      onUpdated();
    } catch (err) {
      console.error("Save compensation error:", err);
      alert("給与・福利厚生の保存に失敗しました。");
    }
  };

  const handleDelete = async () => {
    if (!confirm(`「${company.name}」を就活管理から削除しますか？`)) return;
    try {
      const res = await fetch(`/api/companies/${company.id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("企業の削除に失敗しました。");
        return;
      }
      onUpdated();
      onClose();
    } catch (err) {
      console.error("Delete error:", err);
      alert("企業の削除に失敗しました。");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/32 p-4 max-sm:p-0">
      <div className="relative w-full max-w-4xl rounded-[28px] bg-surface-container-high shadow-sm overflow-hidden my-6 max-h-[92vh] flex flex-col max-sm:h-dvh max-sm:max-h-none max-sm:rounded-none max-sm:my-0">
        {/* Header */}
        <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 flex flex-col md:flex-row justify-between gap-3 md:items-center">
          {/* 左側 or モバイル全体 */}
          <div className="flex items-start gap-3 w-full md:w-auto">
            {/* ロゴアイコン */}
            <div className="hidden sm:flex h-11 w-11 items-center justify-center rounded-xl bg-primary-container text-on-primary-container shrink-0">
              <Building2 className="h-6 w-6" />
            </div>
            
            <div className="flex-1 min-w-0">
              {/* スマホ用: 企業名と閉じるボタンの行 */}
              <div className="flex items-start justify-between gap-2 md:block">
                <h2 className="text-lg sm:text-2xl font-normal text-on-surface line-clamp-2 md:line-clamp-none break-words">
                  {company.name}
                </h2>
                <button
                  onClick={onClose}
                  className="md:hidden rounded-full h-10 w-10 shrink-0 inline-flex items-center justify-center text-on-surface-variant hover:bg-on-surface/8 transition cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* 星とチップ (スマホでは2行目、PCでは企業名の下) */}
              <div className="flex items-center gap-2 mt-1.5 md:mt-1 text-xs text-on-surface-variant flex-wrap">
                <div className="flex text-amber-400 text-sm shrink-0">
                  {"★".repeat(company.priority)}
                </div>
                {company.industry && <span className="rounded-lg border border-outline-variant px-2 py-0.5 font-medium">{company.industry}</span>}
                {company.jobType && <span className="rounded-lg border border-outline-variant px-2 py-0.5 font-medium">{company.jobType}</span>}
                {company.websiteUrl && (
                  <a
                    href={company.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    企業サイト <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {company.myPageUrl && (
                  <a
                    href={company.myPageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    マイページ <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {/* スマホ用: 3行目 (早期選考トグルとステータス) */}
              <div className="md:hidden flex items-center gap-2.5 mt-2.5">
                <button
                  type="button"
                  onClick={handleToggleEarlySelection}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                    company.isEarlySelection
                      ? "bg-tertiary-container text-on-tertiary-container"
                      : "border border-outline-variant text-on-surface-variant hover:bg-on-surface/8"
                  }`}
                >
                  <Zap className="h-3.5 w-3.5 shrink-0" />
                  早期選考
                </button>

                <div className="flex items-center gap-1.5">
                  <select
                    value={company.status}
                    onChange={(e) => handleStatusChange(e.target.value as SelectionStatus)}
                    className={`rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary ${
                      STATUS_STYLES[company.status]?.bg || "bg-surface-container-high"
                    } ${STATUS_STYLES[company.status]?.text || "text-on-surface"}`}
                  >
                    {Object.entries(STATUS_LABELS).map(([key, info]) => (
                      <option key={key} value={key} className="bg-surface-container-high text-on-surface">
                        {info.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* PC用: 右側のコントロール */}
          <div className="hidden md:flex items-center gap-2.5 shrink-0">
            {/* 早期選考トグルボタン */}
            <button
              type="button"
              onClick={handleToggleEarlySelection}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                company.isEarlySelection
                  ? "bg-tertiary-container text-on-tertiary-container"
                  : "border border-outline-variant text-on-surface-variant hover:bg-on-surface/8"
              }`}
            >
              <Zap className="h-3.5 w-3.5 shrink-0" />
              早期選考
            </button>

            {/* ステータスドロップダウン */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-on-surface-variant font-medium">状況:</span>
              <select
                value={company.status}
                onChange={(e) => handleStatusChange(e.target.value as SelectionStatus)}
                className={`rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary ${
                  STATUS_STYLES[company.status]?.bg || "bg-surface-container-high"
                } ${STATUS_STYLES[company.status]?.text || "text-on-surface"}`}
              >
                {Object.entries(STATUS_LABELS).map(([key, info]) => (
                  <option key={key} value={key} className="bg-surface-container-high text-on-surface">
                    {info.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={onClose}
              className="rounded-full h-10 w-10 inline-flex items-center justify-center text-on-surface-variant hover:bg-on-surface/8 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-outline-variant bg-surface-container-high px-6 overflow-x-auto shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            onClick={() => setActiveTab("steps")}
            className={`relative h-12 px-4 text-sm font-medium transition flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
              activeTab === "steps"
                ? "text-primary"
                : "text-on-surface-variant hover:bg-on-surface/8"
            }`}
          >
            選考ステップ ({company.steps.length})
            {activeTab === "steps" && (
              <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("interviews")}
            className={`relative h-12 px-4 text-sm font-medium transition flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
              activeTab === "interviews"
                ? "text-primary"
                : "text-on-surface-variant hover:bg-on-surface/8"
            }`}
          >
            面接ログ・振り返り ({company.interviews?.length || 0})
            {activeTab === "interviews" && (
              <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("compensation")}
            className={`relative h-12 px-4 text-sm font-medium transition flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
              activeTab === "compensation"
                ? "text-primary"
                : "text-on-surface-variant hover:bg-on-surface/8"
            }`}
          >
            <Wallet className="h-4 w-4" />
            給与・福利厚生
            {activeTab === "compensation" && (
              <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-primary" />
            )}
          </button>
          {aiData?.interviewPrepTips && (
            <button
              onClick={() => setActiveTab("ai_prep")}
              className={`relative h-12 px-4 text-sm font-medium transition flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
                activeTab === "ai_prep"
                  ? "text-primary"
                  : "text-on-surface-variant hover:bg-on-surface/8"
              }`}
            >
              <Sparkles className="h-4 w-4 text-primary" />
              AI対策スターター
              {activeTab === "ai_prep" && (
                <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-primary" />
              )}
            </button>
          )}
          <button
            onClick={() => setActiveTab("memo")}
            className={`relative h-12 px-4 text-sm font-medium transition flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer ${
              activeTab === "memo"
                ? "text-primary"
                : "text-on-surface-variant hover:bg-on-surface/8"
            }`}
          >
            企業メモ・マイページ
            {activeTab === "memo" && (
              <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-primary" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: 選考ステップ */}
          {activeTab === "steps" && (
            <div className="space-y-4">
              <h3 className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                選考タイムライン
              </h3>
              {company.steps.length === 0 ? (
                <p className="text-xs text-on-surface-variant py-4 text-center">ステップが登録されていません。</p>
              ) : (
                <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-outline-variant">
                  {company.steps.map((st, idx) => (
                    <div key={st.id} className="relative flex items-start gap-4 pl-8">
                      <div
                        className={`absolute left-1.5 top-1.5 h-4 w-4 rounded-full border-2 transition ${
                          st.status === "PASSED"
                            ? "border-emerald-600 bg-emerald-600"
                            : st.status === "FAILED"
                            ? "border-error bg-error"
                            : "border-outline bg-surface-container-high"
                        }`}
                      />
                      <div className="flex-1 rounded-xl border border-outline-variant bg-surface-container-lowest p-3.5 shadow-2xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-on-surface min-w-0 break-words">
                            {idx + 1}. {st.stepName}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                handleStepStatusChange(st.id, st.status === "PASSED" ? "PENDING" : "PASSED")
                              }
                              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap shrink-0 ${
                                st.status === "PASSED"
                                  ? "bg-emerald-100 text-emerald-900"
                                  : "border border-outline-variant text-on-surface-variant hover:bg-on-surface/8"
                              }`}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> 合格
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleStepStatusChange(st.id, st.status === "FAILED" ? "PENDING" : "FAILED")
                              }
                              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap shrink-0 ${
                                st.status === "FAILED"
                                  ? "bg-error-container text-on-error-container"
                                  : "border border-outline-variant text-on-surface-variant hover:bg-on-surface/8"
                              }`}
                            >
                              <XCircle className="h-3.5 w-3.5" /> 不通過
                            </button>
                          </div>
                        </div>
                        {st.memo && <p className="text-xs text-on-surface-variant mt-1.5">{st.memo}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: 面接ログ・振り返り */}
          {activeTab === "interviews" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                  面接ログ・質問の振り返り
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddInterview(!showAddInterview)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-secondary-container text-on-secondary-container px-4 h-9 text-xs font-medium hover:brightness-95 transition cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> 面接の振り返りを記録
                </button>
              </div>

              {/* 新規面接記録フォーム */}
              {showAddInterview && (
                <form
                  onSubmit={handleSaveInterview}
                  className="rounded-xl border border-outline-variant bg-surface-container-low p-4 space-y-3.5"
                >
                  <h4 className="text-sm font-medium text-on-surface">新しい面接振り返りの作成</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">面接フェーズ</label>
                      <input
                        type="text"
                        value={interviewStepName}
                        onChange={(e) => setInterviewStepName(e.target.value)}
                        className="w-full rounded-lg border border-outline bg-transparent px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="例：1次面接 / 役員面接"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">面接日</label>
                      <input
                        type="date"
                        value={interviewDate}
                        onChange={(e) => setInterviewDate(e.target.value)}
                        className="w-full rounded-lg border border-outline bg-transparent px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">面接官情報</label>
                      <input
                        type="text"
                        value={interviewer}
                        onChange={(e) => setInterviewer(e.target.value)}
                        className="w-full rounded-lg border border-outline bg-transparent px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="例：現場リーダー 30代前半"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">聞かれた質問</label>
                    <textarea
                      rows={2}
                      value={questions}
                      onChange={(e) => setQuestions(e.target.value)}
                      placeholder="例：自己紹介、なぜ他社ではなくうちか、開発で一番苦労した点"
                      className="w-full rounded-lg border border-outline bg-transparent p-2.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">自分の回答・逆質問</label>
                    <textarea
                      rows={2}
                      value={answers}
                      onChange={(e) => setAnswers(e.target.value)}
                      placeholder="話した経験や、逆質問で聞いたこと"
                      className="w-full rounded-lg border border-outline bg-transparent p-2.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">手応え・反省点</label>
                      <textarea
                        rows={2}
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="うまく伝えられたこと、伝えきれなかったこと"
                        className="w-full rounded-lg border border-outline bg-transparent p-2.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">次回への改善アクション</label>
                      <textarea
                        rows={2}
                        value={nextAction}
                        onChange={(e) => setNextAction(e.target.value)}
                        placeholder="次の面接までに調べたいこと、練習したいこと"
                        className="w-full rounded-lg border border-outline bg-transparent p-2.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddInterview(false)}
                      className="rounded-full text-primary px-3 h-8 text-xs font-medium hover:bg-primary/8 transition cursor-pointer"
                    >
                      キャンセル
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingInterview}
                      className="rounded-full bg-primary text-on-primary px-5 h-8 text-xs font-medium hover:shadow-sm hover:brightness-110 disabled:opacity-50 transition cursor-pointer"
                    >
                      保存する
                    </button>
                  </div>
                </form>
              )}

              {/* ログ一覧 */}
              {company.interviews?.length === 0 ? (
                <div className="text-center py-8 rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest text-on-surface-variant text-xs">
                  まだ面接ログがありません。「面接の振り返りを記録」から質問や反省点を残せます。
                </div>
              ) : (
                <div className="space-y-3">
                  {company.interviews.map((item) => (
                    <div key={item.id} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between border-b border-outline-variant pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-on-surface">{item.stepName}</span>
                          {item.interviewDate && (
                            <span className="text-xs text-on-surface-variant flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(item.interviewDate).toLocaleDateString("ja-JP")}
                            </span>
                          )}
                        </div>
                        {item.interviewer && (
                          <span className="text-xs rounded-lg border border-outline-variant px-2 py-0.5 text-on-surface-variant font-medium">
                            面接官: {item.interviewer}
                          </span>
                        )}
                      </div>

                      {item.questions && (
                        <div>
                          <span className="text-xs font-medium text-on-surface-variant">聞かれた質問:</span>
                          <p className="text-xs text-on-surface whitespace-pre-wrap mt-0.5 bg-surface-container-low p-2 rounded-lg border border-outline-variant">
                            {item.questions}
                          </p>
                        </div>
                      )}

                      {item.answers && (
                        <div>
                          <span className="text-xs font-medium text-on-surface-variant">回答・逆質問:</span>
                          <p className="text-xs text-on-surface whitespace-pre-wrap mt-0.5">{item.answers}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 text-xs">
                        {item.feedback && (
                          <div className="bg-amber-100 text-amber-900 p-2.5 rounded-lg border border-amber-200">
                            <span className="font-medium text-amber-900 block mb-0.5">手応え・反省:</span>
                            <p className="text-slate-800">{item.feedback}</p>
                          </div>
                        )}
                        {item.nextAction && (
                          <div className="bg-emerald-100 text-emerald-900 p-2.5 rounded-lg border border-emerald-200">
                            <span className="font-medium text-emerald-900 block mb-0.5">次回アクション:</span>
                            <p className="text-slate-800">{item.nextAction}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AI対策スターター */}
          {activeTab === "ai_prep" && aiData?.interviewPrepTips && (
            <div className="space-y-4">
              <div className="rounded-xl bg-primary-container text-on-primary-container p-4 space-y-3">
                <div className="flex items-center gap-2 text-on-primary-container font-medium text-sm">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span>AIが分析した企業別面接対策ポイント</span>
                </div>

                {aiData.interviewPrepTips.fitLevel && (
                  <div>
                    <h4 className="text-xs font-medium text-on-primary-container mb-1">志望軸とのマッチ度</h4>
                    <div className="bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant text-xs text-on-surface">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                            String(aiData.interviewPrepTips.fitLevel).includes("高")
                              ? "bg-emerald-100 text-emerald-900"
                              : String(aiData.interviewPrepTips.fitLevel).includes("中")
                              ? "bg-amber-100 text-amber-900"
                              : "bg-surface-container-highest text-on-surface"
                          }`}
                        >
                          {aiData.interviewPrepTips.fitLevel}
                        </span>
                        {aiData.interviewPrepTips.fitReason && (
                          <span className="text-on-surface">{aiData.interviewPrepTips.fitReason}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-medium text-on-primary-container mb-1">求める人物像</h4>
                  <p className="text-xs text-on-surface bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant">
                    {aiData.interviewPrepTips.idealCandidate}
                  </p>
                </div>

                {aiData.interviewPrepTips.expectedQuestions?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-on-primary-container mb-1">想定される深掘り質問</h4>
                    <ul className="list-disc list-inside space-y-1 text-xs text-on-surface bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant">
                      {aiData.interviewPrepTips.expectedQuestions.map((q: string, i: number) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiData.interviewPrepTips.reverseQuestions?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-on-primary-container mb-1">逆質問の例</h4>
                    <ul className="list-disc list-inside space-y-1 text-xs text-on-surface bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant">
                      {aiData.interviewPrepTips.reverseQuestions.map((q: string, i: number) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {aiData.interviewPrepTips.appealPoints?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-on-primary-container mb-1">この企業で使える自分の強み</h4>
                    <ul className="list-disc list-inside space-y-1 text-xs text-on-surface bg-surface-container-lowest p-2.5 rounded-lg border border-outline-variant">
                      {aiData.interviewPrepTips.appealPoints.map((point: string, i: number) => (
                        <li key={i}>{point}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: 給与・福利厚生 */}
          {activeTab === "compensation" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                  給与・福利厚生の管理
                </h3>
                {!isEditingCompensation ? (
                  <button
                    onClick={() => {
                      setEditStartingSalary(
                        company.startingSalary != null ? String(company.startingSalary) : ""
                      );
                      setEditBonusTimes(
                        company.bonusTimes != null ? String(company.bonusTimes) : ""
                      );
                      setEditBonusMonths(
                        company.bonusMonths != null ? String(company.bonusMonths) : ""
                      );
                      setEditAnnualIncome(
                        company.annualIncome != null ? String(company.annualIncome) : ""
                      );
                      setEditAnnualHolidays(
                        company.annualHolidays != null ? String(company.annualHolidays) : ""
                      );
                      setEditFixedOvertime(company.fixedOvertime || "");
                      setEditHousingAllowance(company.housingAllowance || "");
                      setEditRemoteWork(company.remoteWork || "");
                      setEditSalary(company.salary || "");
                      setEditBenefits(company.benefits || "");
                      setEditRatingSalary(company.ratingSalary || 0);
                      setEditRatingBenefits(company.ratingBenefits || 0);
                      setIsEditingCompensation(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-full text-primary px-3 h-8 text-xs font-medium hover:bg-primary/8 transition cursor-pointer"
                  >
                    <Edit2 className="h-3.5 w-3.5" /> 編集
                  </button>
                ) : (
                  <button
                    onClick={handleSaveCompensation}
                    className="inline-flex items-center gap-1 rounded-full bg-primary text-on-primary px-4 h-8 text-xs font-medium hover:shadow-sm hover:brightness-110 transition cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" /> 保存
                  </button>
                )}
              </div>

              <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-4 space-y-4">
                {/* 上段: 数値・条件項目 */}
                {!isEditingCompensation ? (
                  /* 表示モード: 2〜4列のカードグリッド */
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {/* 初任給 */}
                    <div className="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant shadow-2xs">
                      <div className="text-[11px] font-medium text-on-surface-variant mb-1">初任給（月額）</div>
                      {company.startingSalary != null ? (
                        <div className="text-sm font-medium text-on-surface">
                          ¥{company.startingSalary.toLocaleString("ja-JP")}
                        </div>
                      ) : (
                        <div className="text-xs text-on-surface-variant/70">未登録</div>
                      )}
                    </div>

                    {/* 賞与 */}
                    <div className="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant shadow-2xs">
                      <div className="text-[11px] font-medium text-on-surface-variant mb-1">賞与（回数・月数）</div>
                      {company.bonusTimes != null || company.bonusMonths != null ? (
                        <div>
                          <div className="text-sm font-medium text-on-surface">
                            {company.bonusTimes != null && `年${company.bonusTimes}回`}
                            {company.bonusTimes != null && company.bonusMonths != null && " / "}
                            {company.bonusMonths != null && `${company.bonusMonths}ヶ月分`}
                          </div>
                          {company.startingSalary != null && company.bonusMonths != null && (
                            <div className="text-[11px] text-on-surface-variant mt-0.5">
                              目安 約¥{Math.round(company.startingSalary * company.bonusMonths).toLocaleString("ja-JP")}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-on-surface-variant/70">未登録</div>
                      )}
                    </div>

                    {/* 想定年収 */}
                    <div className="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant shadow-2xs">
                      <div className="text-[11px] font-medium text-on-surface-variant mb-1">想定年収 (1年目目安)</div>
                      {company.annualIncome != null ? (
                        <div className="text-sm font-medium text-on-surface">
                          {company.annualIncome}万円
                        </div>
                      ) : company.startingSalary != null ? (
                        <div>
                          <div className="text-sm font-medium text-on-surface-variant">
                            目安 約{Math.round((company.startingSalary * (12 + (company.bonusMonths ?? 0))) / 10000)}万円
                          </div>
                          <div className="text-[10px] text-on-surface-variant mt-0.5 leading-tight">
                            ※初任給×(12+賞与月数)で算出
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-on-surface-variant/70">未登録</div>
                      )}
                    </div>

                    {/* 年間休日 */}
                    <div className="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant shadow-2xs">
                      <div className="text-[11px] font-medium text-on-surface-variant mb-1">年間休日</div>
                      {company.annualHolidays != null ? (
                        <div className="text-sm font-medium text-on-surface">
                          {company.annualHolidays}日
                        </div>
                      ) : (
                        <div className="text-xs text-on-surface-variant/70">未登録</div>
                      )}
                    </div>

                    {/* みなし残業 */}
                    <div className="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant shadow-2xs">
                      <div className="text-[11px] font-medium text-on-surface-variant mb-1">みなし残業</div>
                      {company.fixedOvertime ? (
                        <div className="text-xs font-medium text-on-surface break-words">
                          {company.fixedOvertime}
                        </div>
                      ) : (
                        <div className="text-xs text-on-surface-variant/70">未登録</div>
                      )}
                    </div>

                    {/* 住宅手当 */}
                    <div className="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant shadow-2xs">
                      <div className="text-[11px] font-medium text-on-surface-variant mb-1">住宅手当・社宅</div>
                      {company.housingAllowance ? (
                        <div className="text-xs font-medium text-on-surface break-words">
                          {company.housingAllowance}
                        </div>
                      ) : (
                        <div className="text-xs text-on-surface-variant/70">未登録</div>
                      )}
                    </div>

                    {/* リモート可否 */}
                    <div className="bg-surface-container-lowest p-3 rounded-xl border border-outline-variant shadow-2xs col-span-2 md:col-span-2">
                      <div className="text-[11px] font-medium text-on-surface-variant mb-1">リモートワーク</div>
                      {company.remoteWork ? (
                        <div className="text-xs font-medium text-on-surface break-words">
                          {company.remoteWork}
                        </div>
                      ) : (
                        <div className="text-xs text-on-surface-variant/70">未登録</div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* 編集モード */
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">初任給 (円/月)</label>
                      <input
                        type="number"
                        value={editStartingSalary}
                        onChange={(e) => setEditStartingSalary(e.target.value)}
                        placeholder="例：250000"
                        className="w-full rounded-lg border border-outline bg-transparent px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">賞与回数 (回/年)</label>
                      <input
                        type="number"
                        value={editBonusTimes}
                        onChange={(e) => setEditBonusTimes(e.target.value)}
                        placeholder="例：2"
                        className="w-full rounded-lg border border-outline bg-transparent px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">賞与 (ヶ月分/年)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={editBonusMonths}
                        onChange={(e) => setEditBonusMonths(e.target.value)}
                        placeholder="例：4.5"
                        className="w-full rounded-lg border border-outline bg-transparent px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">想定年収 (万円)</label>
                      <input
                        type="number"
                        value={editAnnualIncome}
                        onChange={(e) => setEditAnnualIncome(e.target.value)}
                        placeholder="例：450"
                        className="w-full rounded-lg border border-outline bg-transparent px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">年間休日 (日)</label>
                      <input
                        type="number"
                        value={editAnnualHolidays}
                        onChange={(e) => setEditAnnualHolidays(e.target.value)}
                        placeholder="例：125"
                        className="w-full rounded-lg border border-outline bg-transparent px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">みなし残業</label>
                      <input
                        type="text"
                        value={editFixedOvertime}
                        onChange={(e) => setEditFixedOvertime(e.target.value)}
                        placeholder="例：なし / 30h・45,000円"
                        className="w-full rounded-lg border border-outline bg-transparent px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">住宅手当・社宅</label>
                      <input
                        type="text"
                        value={editHousingAllowance}
                        onChange={(e) => setEditHousingAllowance(e.target.value)}
                        placeholder="例：月3万円補助 / 寮あり"
                        className="w-full rounded-lg border border-outline bg-transparent px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-on-surface-variant mb-1">リモート可否</label>
                      <input
                        type="text"
                        value={editRemoteWork}
                        onChange={(e) => setEditRemoteWork(e.target.value)}
                        placeholder="例：可 / 一部可 / 不可"
                        className="w-full rounded-lg border border-outline bg-transparent px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                )}

                {/* 下段: 給与・福利厚生メモと星評価 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-outline-variant pt-3">
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">
                      給与の魅力度
                    </label>
                    {isEditingCompensation ? (
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={`esal-${star}`}
                            type="button"
                            onClick={() => setEditRatingSalary(star)}
                            className={`text-lg transition cursor-pointer ${
                              star <= editRatingSalary ? "text-amber-400 scale-110" : "text-outline-variant"
                            }`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center text-sm text-amber-400">
                        {company.ratingSalary > 0
                          ? "★".repeat(company.ratingSalary)
                          : <span className="text-xs text-on-surface-variant">未評価</span>}
                      </div>
                    )}
                    <label className="block text-xs font-medium text-on-surface-variant mt-2 mb-1">
                      給与メモ
                    </label>
                    {isEditingCompensation ? (
                      <textarea
                        rows={2}
                        value={editSalary}
                        onChange={(e) => setEditSalary(e.target.value)}
                        className="w-full rounded-lg border border-outline bg-transparent p-2 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="例：初任給30万、昇給年1回"
                      />
                    ) : (
                      <p className="text-xs text-on-surface whitespace-pre-wrap">
                        {company.salary || "未設定"}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">
                      福利厚生の魅力度
                    </label>
                    {isEditingCompensation ? (
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={`eben-${star}`}
                            type="button"
                            onClick={() => setEditRatingBenefits(star)}
                            className={`text-lg transition cursor-pointer ${
                              star <= editRatingBenefits ? "text-amber-400 scale-110" : "text-outline-variant"
                            }`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center text-sm text-amber-400">
                        {company.ratingBenefits > 0
                          ? "★".repeat(company.ratingBenefits)
                          : <span className="text-xs text-on-surface-variant">未評価</span>}
                      </div>
                    )}
                    <label className="block text-xs font-medium text-on-surface-variant mt-2 mb-1">
                      福利厚生メモ
                    </label>
                    {isEditingCompensation ? (
                      <textarea
                        rows={2}
                        value={editBenefits}
                        onChange={(e) => setEditBenefits(e.target.value)}
                        className="w-full rounded-lg border border-outline bg-transparent p-2 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="例：家賃補助あり、カフェテリアプラン"
                      />
                    ) : (
                      <p className="text-xs text-on-surface whitespace-pre-wrap">
                        {company.benefits || "未設定"}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: 企業メモ & マイページ */}
          {activeTab === "memo" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">
                  マイページ・メモ管理
                </h3>
                {!isEditing ? (
                  <button
                    onClick={() => {
                      setEditMemo(company.memo || "");
                      setEditMyPageUrl(company.myPageUrl || "");
                      setEditMyPageId(company.myPageId || "");
                      setIsEditing(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-full text-primary px-3 h-8 text-xs font-medium hover:bg-primary/8 transition cursor-pointer"
                  >
                    <Edit2 className="h-3.5 w-3.5" /> 編集
                  </button>
                ) : (
                  <button
                    onClick={handleSaveInfo}
                    className="inline-flex items-center gap-1 rounded-full bg-primary text-on-primary px-4 h-8 text-xs font-medium hover:shadow-sm hover:brightness-110 transition cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" /> 保存
                  </button>
                )}
              </div>

              <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">マイページURL</label>
                    {isEditing ? (
                      <input
                        type="url"
                        value={editMyPageUrl}
                        onChange={(e) => setEditMyPageUrl(e.target.value)}
                        className="w-full rounded-lg border border-outline bg-transparent px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="https://..."
                      />
                    ) : (
                      <p className="text-xs text-on-surface truncate">
                        {company.myPageUrl ? (
                          <a
                            href={company.myPageUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline flex items-center gap-1 font-medium"
                          >
                            {company.myPageUrl} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          "未設定"
                        )}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">ログインID / 会員番号</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editMyPageId}
                        onChange={(e) => setEditMyPageId(e.target.value)}
                        className="w-full rounded-lg border border-outline bg-transparent px-3 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        placeholder="IDまたはメールアドレス"
                      />
                    ) : (
                      <p className="text-xs text-on-surface">{company.myPageId || "未設定"}</p>
                    )}
                  </div>
                </div>

                <div className="border-t border-outline-variant pt-3">
                  <label className="block text-xs font-medium text-on-surface-variant mb-1">フリーメモ (志望動機、社風など)</label>
                  {isEditing ? (
                    <textarea
                      rows={4}
                      value={editMemo}
                      onChange={(e) => setEditMemo(e.target.value)}
                      className="w-full rounded-lg border border-outline bg-transparent p-2.5 text-xs text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  ) : (
                    <p className="text-xs text-on-surface whitespace-pre-wrap">
                      {company.memo || "メモはまだありません。"}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            className="inline-flex items-center gap-1.5 rounded-full text-error px-4 h-10 text-sm font-medium hover:bg-error/8 transition cursor-pointer"
          >
            <Trash2 className="h-4 w-4" /> 企業を削除
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full text-primary px-4 h-10 text-sm font-medium hover:bg-primary/8 transition cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
