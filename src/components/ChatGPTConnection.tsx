"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { ExternalLink, Loader2, LogOut, RefreshCw } from "lucide-react";
import type { DesktopModel, DesktopSession, SyukatsuDesktopAPI } from "../types/desktop";
import { describeDesktopError, useDesktopBridge } from "./desktopBridge";

type Phase = "initializing" | "ready" | "loadingModels" | "signingIn" | "signingOut";

interface Props {
  /** 選択中のモデル。未接続・利用不可・ログアウト時は null。安定した参照を渡すこと。 */
  onModelChange: (modelSlug: string | null) => void;
  /** AI生成中など、モデルの切り替えを一時的に禁止する場合に true。 */
  modelLocked?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSession(value: unknown): DesktopSession {
  if (!isRecord(value)) return { connected: false, sharing: false };
  const connected = value.connected === true;
  return {
    connected,
    sharing: connected && value.sharing === true,
    email: typeof value.email === "string" && value.email !== "" ? value.email : undefined,
    needsReauthentication: value.needsReauthentication === true,
    authError: typeof value.authError === "string" ? value.authError : undefined,
  };
}

function normalizeModels(value: unknown): DesktopModel[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const models: DesktopModel[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const { slug, displayName } = item;
    if (typeof slug !== "string" || slug === "" || seen.has(slug)) continue;
    seen.add(slug);
    models.push({
      slug,
      displayName: typeof displayName === "string" && displayName !== "" ? displayName : slug,
    });
  }
  return models;
}

const SESSION_ERROR = "ChatGPT連携の状態を取得できませんでした。時間をおいて再度お試しください。";

export default function ChatGPTConnection({ onModelChange, modelLocked = false }: Props) {
  const api = useDesktopBridge();
  const selectId = useId();

  const [phase, setPhase] = useState<Phase>("initializing");
  const [session, setSession] = useState<DesktopSession | null>(null);
  const [models, setModels] = useState<DesktopModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);

  const mountedRef = useRef(false);
  const operationRef = useRef(0);
  const signingInRef = useRef(false);
  const onModelChangeRef = useRef(onModelChange);

  useEffect(() => {
    onModelChangeRef.current = onModelChange;
  }, [onModelChange]);

  const isCurrent = useCallback(
    (operation: number) => mountedRef.current && operationRef.current === operation,
    []
  );

  const beginOperation = useCallback(() => {
    operationRef.current += 1;
    return operationRef.current;
  }, []);

  const chooseModel = useCallback((slug: string | null) => {
    setSelectedModel(slug ?? "");
    onModelChangeRef.current(slug);
  }, []);

  const loadSession = useCallback(
    async (bridge: SyukatsuDesktopAPI, operation: number) => {
      const nextSession = normalizeSession(await bridge.getSession());
      if (!isCurrent(operation)) return;
      setSession(nextSession);
      if (nextSession.needsReauthentication) setError(nextSession.authError || "保存済みの認証情報を読み取れませんでした。再ログインしてください。");

      if (!nextSession.connected || !nextSession.sharing) {
        setModels([]);
        chooseModel(null);
        setPhase("ready");
        return;
      }

      setPhase("loadingModels");
      const nextModels = normalizeModels(await bridge.listModels());
      if (!isCurrent(operation)) return;
      setModels(nextModels);
      chooseModel(nextModels[0]?.slug ?? null);
      setPhase("ready");
    },
    [chooseModel, isCurrent]
  );

  const failLoad = useCallback(
    (operation: number, err: unknown, fallback: string) => {
      if (!isCurrent(operation)) return;
      setModels([]);
      chooseModel(null);
      setError(describeDesktopError(err, fallback));
      setPhase("ready");
    },
    [chooseModel, isCurrent]
  );

  useEffect(() => {
    if (!api) return;
    mountedRef.current = true;
    const operation = beginOperation();
    loadSession(api, operation).catch((err: unknown) => {
      failLoad(operation, err, SESSION_ERROR);
    });

    return () => {
      mountedRef.current = false;
      operationRef.current += 1;
      if (signingInRef.current) {
        signingInRef.current = false;
        api.cancelSignIn().catch(() => undefined);
      }
    };
  }, [api, beginOperation, failLoad, loadSession]);

  const handleSignIn = async () => {
    if (!api || phase !== "ready") return;
    if (session?.needsReauthentication && !window.confirm("この端末の保存済み認証情報を削除して、再ログインします。企業・選考・予定・就活軸のデータは削除しません。続けますか？")) return;
    const operation = beginOperation();
    signingInRef.current = true;
    setError(null);
    setPhase("signingIn");
    try {
      if (session?.needsReauthentication) {
        await api.signOut();
        if (!isCurrent(operation)) return;
        setSession({ connected: false, sharing: false });
        setRecoveryNotice("この端末の認証情報をリセットしました。以前の接続許可は解除できていない可能性があります。必要に応じてChatGPT側の設定で確認してください。");
      }
      await api.signIn();
      if (!isCurrent(operation)) return;
      signingInRef.current = false;
      await loadSession(api, operation);
    } catch (err: unknown) {
      failLoad(operation, err, "ChatGPTへのログインに失敗しました。もう一度お試しください。");
    } finally {
      if (operationRef.current === operation) {
        signingInRef.current = false;
      }
    }
  };

  const handleCancelSignIn = async () => {
    if (!api || !signingInRef.current) return;
    signingInRef.current = false;
    const operation = beginOperation();
    setPhase("ready");
    try {
      await api.cancelSignIn();
    } catch (err: unknown) {
      if (isCurrent(operation)) {
        setError(describeDesktopError(err, "ログインのキャンセルに失敗しました。"));
      }
    }
  };

  const handleSignOut = async () => {
    if (!api || phase !== "ready") return;
    const operation = beginOperation();
    setError(null);
    setPhase("signingOut");
    chooseModel(null);
    try {
      const { remoteRevoked } = await api.signOut();
      if (!isCurrent(operation)) return;
      setSession({ connected: false, sharing: false });
      setModels([]);
      setPhase("ready");
      if (!remoteRevoked) {
        setError("完全にログアウトできませんでした。ブラウザからChatGPTの設定を開き、接続されたアプリの解除を行ってください。");
      }
    } catch (err: unknown) {
      if (!isCurrent(operation)) return;
      const message = describeDesktopError(err, "ログアウトに失敗しました。");
      try {
        await loadSession(api, operation);
        if (isCurrent(operation)) setError(message);
      } catch (reloadErr: unknown) {
        failLoad(operation, reloadErr, SESSION_ERROR);
      }
    }
  };

  const handleReloadModels = async () => {
    if (!api || phase !== "ready") return;
    const operation = beginOperation();
    setError(null);
    setPhase("loadingModels");
    try {
      await loadSession(api, operation);
    } catch (err: unknown) {
      failLoad(operation, err, "利用可能なモデルを取得できませんでした。");
    }
  };

  const handleOpenUsage = async () => {
    if (!api) return;
    setError(null);
    try {
      await api.openUsage();
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(describeDesktopError(err, "利用状況のページを開けませんでした。"));
      }
    }
  };

  const handleSelectModel = (e: ChangeEvent<HTMLSelectElement>) => {
    const slug = e.target.value;
    if (models.some((model) => model.slug === slug)) {
      chooseModel(slug);
    }
  };

  if (!api) return null;

  const connected = session?.connected === true;
  const sharing = connected && session?.sharing === true;
  const isReady = phase === "ready";

  const textButtonClass =
    "inline-flex shrink-0 items-center gap-1 rounded-full px-3 h-8 text-xs font-medium text-primary hover:bg-primary/8 transition cursor-pointer disabled:opacity-50";
  const continueButtonClass =
    "inline-flex shrink-0 items-center justify-center rounded-full bg-primary text-on-primary px-5 h-10 text-sm font-medium hover:shadow-sm hover:brightness-110 transition cursor-pointer";

  let statusMessage: string | null = null;
  if (phase === "initializing") statusMessage = "ChatGPT連携の状態を確認しています…";
  if (phase === "loadingModels") statusMessage = "利用可能なモデルを取得しています…";
  if (phase === "signingOut") statusMessage = "ログアウトしています…";

  return (
    <section
      aria-label="ChatGPT連携"
      className="min-w-0 space-y-3 rounded-2xl border border-outline-variant bg-surface-container-low p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-on-surface">ChatGPTプランを使用</p>
          {connected && (
            <p className="mt-0.5 text-xs text-on-surface-variant break-all">
              {session?.email ? `接続中: ${session.email}` : "接続中"}
            </p>
          )}
        </div>
        {connected && isReady && (
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={handleOpenUsage} className={textButtonClass}>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              利用状況を管理
            </button>
            <button type="button" onClick={handleSignOut} className={textButtonClass}>
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              ログアウト
            </button>
          </div>
        )}
      </div>

      <div aria-live="assertive">
        {recoveryNotice && <p className="rounded-xl bg-secondary-container p-3 text-xs text-on-secondary-container break-words">{recoveryNotice}</p>}
        {error && (
          <div role="alert" className="rounded-xl bg-error-container p-3 text-xs text-on-error-container break-words">
            {error}
          </div>
        )}
      </div>

      <div aria-live="polite">
        {statusMessage && (
          <p className="flex items-center gap-2 text-xs text-on-surface-variant">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            <span className="min-w-0 break-words">{statusMessage}</span>
          </p>
        )}

        {phase === "signingIn" && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex min-w-0 flex-1 items-center gap-2 text-xs text-on-surface-variant">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
              <span className="min-w-0 break-words">
                開いたブラウザでChatGPTにログインしてください。ログインすると、この画面の表示が更新されます。
              </span>
            </p>
            <button type="button" onClick={handleCancelSignIn} className={textButtonClass}>
              キャンセル
            </button>
          </div>
        )}
      </div>

      {isReady && !connected && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleSignIn} className={continueButtonClass}>
            {session?.needsReauthentication ? "認証情報をリセットして再ログイン" : "Continue with ChatGPT"}
          </button>
        </div>
      )}

      {isReady && connected && !sharing && (
        <div className="space-y-2">
          <p className="rounded-xl bg-error-container p-3 text-xs text-on-error-container break-words">
            ChatGPTの利用が許可されていません。もう一度ログインし、データ共有を許可してください。
          </p>
          <button type="button" onClick={handleSignIn} className={continueButtonClass}>
            Continue with ChatGPT
          </button>
        </div>
      )}

      {sharing && (phase === "ready" || phase === "loadingModels") && models.length > 0 && (
        <div className="min-w-0 space-y-1">
          <label htmlFor={selectId} className="block text-xs font-medium text-on-surface">
            使用するモデル
          </label>
          <select
            id={selectId}
            value={selectedModel}
            onChange={handleSelectModel}
            disabled={!isReady || modelLocked}
            className="w-full min-w-0 max-w-full rounded-lg border border-outline bg-transparent p-2 text-sm text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
          >
            {models.map((model) => (
              <option key={model.slug} value={model.slug}>
                {model.displayName}
              </option>
            ))}
          </select>
        </div>
      )}

      {isReady && sharing && models.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-xs text-on-surface-variant break-words">
            使えるモデルが見つかりませんでした。「利用状況を管理」でプランを確認し、モデルを再取得してください。
          </p>
          <button type="button" onClick={handleReloadModels} className={textButtonClass}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            モデルを再取得
          </button>
        </div>
      )}
    </section>
  );
}
