"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Copy, Check, UploadCloud, X, TerminalSquare, Loader2, Sparkles } from "lucide-react";
import ChatGPTConnection from "./ChatGPTConnection";
import { describeDesktopError, useDesktopBridge } from "./desktopBridge";
import { buildCompanyPayload, parseCompanyDraft } from "../lib/company-draft";
import {
  MAX_COMPANY_NAME_LENGTH,
  buildCompanyPrompt,
} from "../lib/company-prompt";
import type { CareerProfile } from "../lib/career-profile";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  careerProfile: CareerProfile;
}

export default function PromptAddCompanyModal({ isOpen, onClose, onSuccess, careerProfile }: Props) {
  const bridge = useDesktopBridge();
  const isDesktop = bridge !== null;
  const companyNameId = useId();
  const aiHeadingId = useId();

  const [jsonInput, setJsonInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [aiCompanyName, setAiCompanyName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateNotice, setGenerateNotice] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(isOpen);

  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const aiDraftRef = useRef<string | null>(null);

  // 閉じたときはAI生成の進行状態だけを戻す（入力済みのJSONや企業名は保持する）。
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (!isOpen) {
      setIsGenerating(false);
      setSelectedModel(null);
      setGenerateError(null);
      setGenerateNotice(null);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  // 開閉が切り替わった時点で、実行中のAI生成の結果は破棄する。
  useLayoutEffect(() => {
    generationRef.current += 1;
  }, [isOpen]);

  const handleModelChange = useCallback((slug: string | null) => {
    setSelectedModel(slug);
    if (slug !== null) return;

    generationRef.current += 1;
    setIsGenerating(false);
    setGenerateError(null);
    setGenerateNotice(null);
    const aiDraft = aiDraftRef.current;
    aiDraftRef.current = null;
    if (aiDraft !== null) {
      setJsonInput((current) => (current === aiDraft ? "" : current));
    }
  }, []);

  if (!isOpen) return null;

  const handleClose = () => {
    generationRef.current += 1;
    onClose();
  };

  const handleCopyPrompt = async () => {
    let success = false;
    const textToCopy = buildCompanyPrompt(aiCompanyName, careerProfile);

    if (window.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(textToCopy);
        success = true;
      } catch (err) {
        console.error("Failed to copy via navigator.clipboard:", err);
      }
    }

    if (!success) {
      const textarea = document.createElement("textarea");
      textarea.value = textToCopy;
      textarea.readOnly = true;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      try {
        textarea.select();
        success = document.execCommand("copy");
      } catch (err) {
        console.error("Failed to copy via fallback:", err);
        success = false;
      } finally {
        document.body.removeChild(textarea);
      }
    }

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      alert("コピーに失敗しました。プロンプトを手動で選択してコピーしてください。");
    }
  };

  const handleGenerate = async () => {
    if (!bridge || isGenerating || isSaving) return;

    const model = selectedModel;
    if (!model) {
      setGenerateError("ChatGPTに接続し、使用するモデルを選択してください。");
      return;
    }
    const trimmedName = aiCompanyName.trim();
    if (trimmedName === "") {
      setGenerateError("企業名を入力してください。");
      return;
    }
    if (trimmedName.length > MAX_COMPANY_NAME_LENGTH || aiCompanyName.length > MAX_COMPANY_NAME_LENGTH) {
      setGenerateError(`企業名は${MAX_COMPANY_NAME_LENGTH}文字以内で入力してください。`);
      return;
    }

    generationRef.current += 1;
    const generation = generationRef.current;
    const isCurrent = () => mountedRef.current && generationRef.current === generation;

    setIsGenerating(true);
    setGenerateError(null);
    setGenerateNotice(null);

    try {
      const output: unknown = await bridge.generate({
        model,
        input: buildCompanyPrompt(trimmedName, careerProfile),
        webSearch: true,
      });
      if (!isCurrent()) return;

      if (typeof output !== "string") {
        setGenerateError("AIの返答を読み取れませんでした。もう一度作成してください。");
        return;
      }

      const result = parseCompanyDraft(output);
      if (!result.ok) {
        setGenerateError(
          `登録案を読み取れませんでした（${result.error}）。JSONを修正するか、もう一度作成してください。`
        );
        return;
      }

      const pretty = JSON.stringify(result.draft, null, 2);
      aiDraftRef.current = pretty;
      setJsonInput(pretty);
      setError(null);
      setGenerateNotice(
        "登録案を下のJSON欄に入れました。内容を確認し、必要なら直してから「JSONから登録する」を押してください。"
      );
    } catch (err: unknown) {
      if (!isCurrent()) return;
      setGenerateError(describeDesktopError(err, "AIによる登録案の作成に失敗しました。"));
    } finally {
      if (isCurrent()) {
        setIsGenerating(false);
      }
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSaving || isGenerating) return;
    if (!jsonInput.trim()) {
      setError("JSONデータを貼り付けてください。");
      return;
    }

    const result = parseCompanyDraft(jsonInput);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCompanyPayload(result.draft)),
      });

      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const message =
          typeof body === "object" &&
          body !== null &&
          "error" in body &&
          typeof body.error === "string" &&
          body.error !== ""
            ? body.error
            : "登録に失敗しました。";
        throw new Error(message);
      }

      aiDraftRef.current = null;
      setJsonInput("");
      setGenerateNotice(null);
      onSuccess();
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : "エラーが発生しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const fieldClass =
    "w-full min-w-0 rounded-lg border border-outline bg-transparent p-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/32 p-4 max-sm:p-0">
      <div className="relative w-full max-w-2xl rounded-[28px] bg-surface-container-high shadow-sm overflow-hidden my-8 max-h-[90vh] flex flex-col max-sm:h-dvh max-sm:max-h-none max-sm:rounded-none max-sm:my-0">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-6 pt-6 pb-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <TerminalSquare className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
            <h2 className="min-w-0 break-words text-2xl font-normal text-on-surface">AIプロンプトで登録</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="閉じる"
            className="shrink-0 rounded-full h-10 w-10 inline-flex items-center justify-center text-on-surface-variant hover:bg-on-surface/8 transition cursor-pointer"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-6">
          <div className="space-y-1">
            <label htmlFor={companyNameId} className="block text-xs font-medium text-on-surface">
              企業名
            </label>
            <input
              id={companyNameId}
              type="text"
              value={aiCompanyName}
              onChange={(e) => setAiCompanyName(e.target.value)}
              disabled={isGenerating}
              maxLength={MAX_COMPANY_NAME_LENGTH}
              placeholder="株式会社..."
              className={fieldClass}
            />
          </div>

          {isDesktop && (
            <section
              aria-labelledby={aiHeadingId}
              className="min-w-0 space-y-4 border-b border-outline-variant pb-6"
            >
              <ChatGPTConnection onModelChange={handleModelChange} modelLocked={isGenerating} />

              <div className="min-w-0 space-y-3">
                <h3
                  id={aiHeadingId}
                  className="flex items-center gap-2 text-sm font-medium text-on-surface"
                >
                  <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 break-words">企業名からAIで登録案を作成</span>
                </h3>
                <p className="text-xs text-on-surface-variant break-words">
                  企業名と就活軸をOpenAIに送り、Web検索で企業情報を調べます。企業のマイページに登録したIDやパスワードは送りません。調査結果は、登録前に確認してください。
                </p>
                <p className="text-xs text-on-surface-variant break-words">
                  利用には、対応するChatGPTプランと利用許可、インターネット接続が必要です。APIキーは不要です。
                </p>

                <div aria-live="assertive">
                  {generateError && (
                    <div
                      role="alert"
                      className="rounded-xl bg-error-container p-3 text-xs text-on-error-container break-words"
                    >
                      {generateError}
                    </div>
                  )}
                </div>
                <div aria-live="polite">
                  {generateNotice && (
                    <p className="rounded-xl bg-secondary-container p-3 text-xs text-on-secondary-container break-words">
                      {generateNotice}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={isGenerating || isSaving || !selectedModel}
                    aria-busy={isGenerating}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary text-on-primary px-6 h-10 text-sm font-medium hover:shadow-sm hover:brightness-110 disabled:opacity-50 transition cursor-pointer"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                    )}
                    {isGenerating ? "登録案を作成中..." : "AIで登録案を作成"}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Step 1 */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-on-surface flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-on-primary text-xs font-medium shrink-0">1</span>
              コピーしてChatGPTなどで使う
            </h3>
            <p className="text-xs text-on-surface-variant pl-8">
              プロンプトをコピーし、ChatGPTやClaudeに貼り付けてください。
            </p>
            <div className="ml-8 relative">
              <details open className="p-3 bg-surface-container-lowest border border-outline-variant rounded-xl text-xs text-on-surface">
                <summary className="cursor-pointer font-medium text-on-surface-variant select-none pr-24">
                  送信・コピーするプロンプト
                </summary>
                <pre className="mt-2 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                  {buildCompanyPrompt(aiCompanyName, careerProfile)}
                </pre>
              </details>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="absolute top-2 right-2 rounded-full h-8 px-3 inline-flex items-center gap-1 bg-secondary-container text-on-secondary-container text-xs font-medium hover:brightness-95 transition cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "コピーしました" : "コピー"}
              </button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-on-surface flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-on-primary text-xs font-medium shrink-0">2</span>
              生成されたJSONを貼り付ける
            </h3>
            <p className="text-xs text-on-surface-variant pl-8">
              AIから返ってきたJSONを貼り付け、内容を確認してから登録してください。
            </p>
            {isDesktop && (
              <p className="text-xs text-on-surface-variant pl-8 break-words">
                上の「AIで登録案を作成」で作成した登録案もここに表示されます。自動では登録されません。
              </p>
            )}

            <form onSubmit={handleSubmit} className="ml-8 space-y-4">
              <div aria-live="assertive">
                {error && (
                  <div
                    role="alert"
                    className="rounded-xl bg-error-container text-on-error-container p-3 text-xs break-words"
                  >
                    {error}
                  </div>
                )}
              </div>
              <textarea
                rows={8}
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                aria-label="登録する企業情報のJSON"
                placeholder={'{\n  "name": "株式会社...",\n  "industry": "IT",\n  ...\n}'}
                className="w-full rounded-lg border border-outline bg-transparent p-3 text-xs text-on-surface placeholder:text-on-surface-variant/70 font-mono focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="shrink-0 rounded-full text-primary px-4 h-10 text-sm font-medium hover:bg-primary/8 cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isGenerating}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-primary text-on-primary px-6 h-10 text-sm font-medium hover:shadow-sm hover:brightness-110 disabled:opacity-50 transition cursor-pointer"
                >
                  <UploadCloud className="h-4 w-4" />
                  {isSaving ? "登録中..." : "JSONから登録する"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
