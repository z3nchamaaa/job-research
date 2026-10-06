"use client";

import { useState, useEffect, useRef, useId } from "react";
import type { CareerProfile } from "../lib/career-profile";
import { X, ChevronRight, ChevronLeft, Check, Loader2 } from "lucide-react";
import { DEFAULT_CAREER_PROFILE } from "../lib/career-profile";

interface Props {
  isOpen?: boolean;
  onClose: () => void;
  initialProfile: CareerProfile;
  onSave: (p: CareerProfile) => Promise<void | CareerProfile>;
  isFirstRun?: boolean;
}

export default function CareerProfileModal({
  isOpen = true,
  onClose,
  initialProfile,
  onSave,
  isFirstRun: isFirstRunProp,
}: Props) {
  const isFirstRun = isFirstRunProp ?? !initialProfile.completed;

  // マウント時にdraft / step / エラー状態を初期化（エフェクトによる同期リセットは行わない）
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<CareerProfile>(initialProfile);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const majorId = useId();
  const industriesId = useId();
  const rolesId = useId();
  const prioritiesId = useId();
  const strengthsId = useId();

  // マウント時のアクティブ要素をキャプチャし、アンマウント時にフォーカス復元
  useEffect(() => {
    const previouslyFocused =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;

    if (dialogRef.current) {
      const firstInput = dialogRef.current.querySelector(
        'input, textarea, button:not([disabled])'
      ) as HTMLElement | null;
      firstInput?.focus();
    }

    return () => {
      previouslyFocused?.focus();
    };
  }, []);

  // ステップ切り替え時に新しいステップの最初の入力欄にフォーカス
  useEffect(() => {
    if (step > 1 && dialogRef.current) {
      const firstInput = dialogRef.current.querySelector(
        'input, textarea, button:not([disabled])'
      ) as HTMLElement | null;
      firstInput?.focus();
    }
  }, [step]);

  // キーボード操作: EscapeキーとTabフォーカストラップ
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isFirstRun && !isSaving) {
        onClose();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input[type="text"]:not([disabled]), select:not([disabled])'
        );
        if (focusableElements.length === 0) return;

        const first = focusableElements[0] as HTMLElement;
        const last = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isFirstRun, isSaving, onClose]);

  if (!isOpen) return null;

  const handleOutsideClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isFirstRun && !isSaving) {
      onClose();
    }
  };

  const handleSkip = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave({ ...DEFAULT_CAREER_PROFILE, completed: true });
      onClose();
    } catch {
      setSaveError("保存に失敗しました。もう一度お試しください。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave({ ...draft, completed: true });
      onClose();
    } catch {
      setSaveError("保存に失敗しました。もう一度お試しください。");
    } finally {
      setIsSaving(false);
    }
  };

  const fieldClass =
    "w-full rounded-xl border border-outline bg-transparent p-3 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none";
  const labelClass = "block text-sm font-medium text-on-surface mb-1.5";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/32 p-4 max-sm:p-0"
      onClick={handleOutsideClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-2xl flex flex-col bg-surface-container-high shadow-sm my-8 max-h-[90vh] rounded-[28px] max-sm:h-dvh max-sm:max-h-none max-sm:rounded-none max-sm:my-0"
      >
        {/* ヘッダー（固定） */}
        <div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4 border-b border-outline-variant/50 sticky top-0 bg-surface-container-high z-10 rounded-t-[28px] max-sm:rounded-none">
          <h2 id={titleId} className="text-xl font-medium text-on-surface">
            {isFirstRun ? "就活で大切にしたいこと" : "就活軸の編集"}
          </h2>
          {!isFirstRun && (
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              aria-label="閉じる"
              className="shrink-0 rounded-full h-10 w-10 inline-flex items-center justify-center text-on-surface-variant hover:bg-on-surface/8 transition cursor-pointer disabled:opacity-50"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* コンテンツ本体（内部スクロール） */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div aria-live="polite">
            {saveError && (
              <div
                role="alert"
                className="mb-4 rounded-xl bg-error-container p-3 text-sm text-on-error-container"
              >
                {saveError}
              </div>
            )}
          </div>

          {step === 1 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
              <div className="mb-6">
                <div className="text-xs font-medium text-primary mb-1">1 / 3</div>
                <h3 className="text-lg font-medium text-on-surface">学んだことと希望</h3>
                <p className="text-sm text-on-surface-variant mt-2">空欄のままでも進めます。あとから変更できます。</p>
              </div>

              <div>
                <label htmlFor={majorId} className={labelClass}>
                  専攻や学んだこと
                </label>
                <textarea
                  id={majorId}
                  rows={2}
                  maxLength={2000}
                  disabled={isSaving}
                  value={draft.major}
                  onChange={(e) => setDraft({ ...draft, major: e.target.value })}
                  placeholder="例：社会学。ゼミで地域の課題を研究"
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor={industriesId} className={labelClass}>
                  志望業界
                </label>
                <textarea
                  id={industriesId}
                  rows={2}
                  maxLength={2000}
                  disabled={isSaving}
                  value={draft.industries}
                  onChange={(e) => setDraft({ ...draft, industries: e.target.value })}
                  placeholder="例：IT、メーカー、人材"
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor={rolesId} className={labelClass}>
                  志望職種
                </label>
                <textarea
                  id={rolesId}
                  rows={2}
                  maxLength={2000}
                  disabled={isSaving}
                  value={draft.roles}
                  onChange={(e) => setDraft({ ...draft, roles: e.target.value })}
                  placeholder="例：総合職、企画営業、接客"
                  className={fieldClass}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
              <div className="mb-6">
                <div className="text-xs font-medium text-primary mb-1">2 / 3</div>
                <h3 className="text-lg font-medium text-on-surface">大切にしたいことと経験</h3>
              </div>

              <div>
                <label htmlFor={prioritiesId} className={labelClass}>
                  仕事選びで重視すること
                </label>
                <textarea
                  id={prioritiesId}
                  rows={3}
                  maxLength={2000}
                  disabled={isSaving}
                  value={draft.priorities}
                  onChange={(e) => setDraft({ ...draft, priorities: e.target.value })}
                  placeholder="例：研修制度、休日の多さ、在宅勤務"
                  className={fieldClass}
                />
              </div>

              <div>
                <label htmlFor={strengthsId} className={labelClass}>
                  強み・これまでの経験
                </label>
                <textarea
                  id={strengthsId}
                  rows={3}
                  maxLength={2000}
                  disabled={isSaving}
                  value={draft.strengths}
                  onChange={(e) => setDraft({ ...draft, strengths: e.target.value })}
                  placeholder="例：接客のアルバイト、サークルでのイベント企画"
                  className={fieldClass}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
              <div className="mb-6">
                <div className="text-xs font-medium text-primary mb-1">3 / 3</div>
                <h3 className="text-lg font-medium text-on-surface">確認</h3>
              </div>

              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-4 space-y-4">
                <div className="text-sm">
                  <span className="font-medium text-on-surface block mb-1">専攻や学んだこと</span>
                  <span className="text-on-surface-variant break-words">{draft.major || "(未入力)"}</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-on-surface block mb-1">志望業界</span>
                  <span className="text-on-surface-variant break-words">{draft.industries || "(未入力)"}</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-on-surface block mb-1">志望職種</span>
                  <span className="text-on-surface-variant break-words">{draft.roles || "(未入力)"}</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-on-surface block mb-1">仕事選びで重視すること</span>
                  <span className="text-on-surface-variant break-words">{draft.priorities || "(未入力)"}</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-on-surface block mb-1">強み・これまでの経験</span>
                  <span className="text-on-surface-variant break-words">{draft.strengths || "(未入力)"}</span>
                </div>
              </div>

              <div className="bg-secondary-container text-on-secondary-container p-4 rounded-xl text-xs leading-relaxed space-y-2">
                <p className="font-medium">入力した内容について</p>
                <p>入力した内容は、この端末に保存します。</p>
                <p>AIで登録案を作るときは、入力した内容をOpenAIに送ります。コピーしたプロンプトにも同じ内容が含まれます。</p>
                <p>氏名や住所、アカウントのID、パスワードは入力しないでください。</p>
              </div>
            </div>
          )}
        </div>

        {/* フッター（固定） */}
        <div className="shrink-0 p-4 sm:px-6 border-t border-outline-variant/50 sticky bottom-0 bg-surface-container-high z-10 flex flex-wrap items-center justify-between gap-3 rounded-b-[28px] max-sm:rounded-none">
          <div className="flex items-center">
            {isFirstRun ? (
              <button
                type="button"
                onClick={handleSkip}
                disabled={isSaving}
                className="text-sm font-medium text-primary hover:bg-primary/8 px-4 h-10 rounded-full transition cursor-pointer disabled:opacity-50"
              >
                後で設定する
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="text-sm font-medium text-primary hover:bg-primary/8 px-4 h-10 rounded-full transition cursor-pointer disabled:opacity-50"
              >
                キャンセル
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                disabled={isSaving}
                className="inline-flex items-center gap-1 text-sm font-medium text-on-surface border border-outline px-4 h-10 rounded-full hover:bg-on-surface/8 transition cursor-pointer disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" /> 戻る
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                disabled={isSaving}
                className="inline-flex items-center gap-1 text-sm font-medium bg-primary text-on-primary px-5 h-10 rounded-full hover:shadow-sm hover:brightness-110 transition cursor-pointer disabled:opacity-50"
              >
                次へ <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 text-sm font-medium bg-primary text-on-primary px-6 h-10 rounded-full hover:shadow-sm hover:brightness-110 transition cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {isSaving ? "保存中..." : "保存する"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
