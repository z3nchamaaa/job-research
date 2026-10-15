"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import type { UpdateStatus } from "@/types/desktop";

export default function AppUpdateButton() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState("");
  const [installing, setInstalling] = useState(false);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();

  useEffect(() => {
    const api = window.syukatsuDesktop;
    if (!api?.getUpdateStatus || !api.checkForUpdates) return;
    let active = true;
    const update = (value: UpdateStatus) => { if (active) setStatus(value); };
    api.getUpdateStatus().then(update).catch(() => {});
    // A check never downloads a file or closes the app.
    api.checkForUpdates().then(update).catch(() => {});
    const timer = setInterval(() => { api.getUpdateStatus().then(update).catch(() => {}); }, 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  if (!status) return null;
  const busy = installing || status.status === "checking" || status.status === "downloading";
  const run = async (action: "check" | "download" | "install") => {
    setError("");
    const api = window.syukatsuDesktop!;
    try {
      if (action === "install") {
        setInstalling(true);
        await api.installUpdate();
      } else setStatus(await (action === "check" ? api.checkForUpdates() : api.downloadUpdate()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新処理に失敗しました。");
    } finally { setInstalling(false); }
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} title={status.available ? `新しいバージョン ${status.latestVersion} があります` : "アプリの更新"} aria-label="アプリの更新" className="relative rounded-full h-10 w-10 inline-flex items-center justify-center text-on-surface-variant hover:bg-on-surface/8 cursor-pointer">
      <Download className="h-5 w-5" aria-hidden />
      {status.available && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" aria-label="更新あり" />}
    </button>
    <dialog ref={dialog} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} aria-labelledby={title} className="m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[calc(100dvh_-_2rem)] overflow-y-auto rounded-3xl bg-surface-container text-on-surface p-6 shadow-xl backdrop:bg-black/40">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 id={title} className="text-xl font-medium">アプリの更新</h2>
        <button type="button" aria-label="閉じる" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-on-surface/8 cursor-pointer"><X className="h-5 w-5" /></button>
      </div>
      <p className="text-sm text-on-surface-variant">現在のバージョン：{status.currentVersion}</p>
      <div className="mt-4 space-y-3 text-sm" aria-live="polite">
        {status.status === "current" && <p>現在のバージョンは最新です。</p>}
        {status.status === "checking" && <p>正式リリースを確認しています…</p>}
        {status.available && <p>バージョン {status.latestVersion} を利用できます。{status.size ? `（約${Math.ceil(status.size / 1000000)} MB）` : ""}</p>}
        {status.status === "downloading" && <><p>ダウンロード中：{status.progress}%</p><progress value={status.progress} max={100} aria-label="更新ファイルのダウンロード" className="w-full" /></>}
        {status.status === "ready" && <p>ダウンロードとチェックサムの検証が完了しました。</p>}
        {status.status === "opened" && <p>インストーラーの案内に従って更新してください。</p>}
        {(error || status.error) && <p role="alert" className="text-error">{error || status.error}</p>}
      </div>
      {status.releaseNotes && <details className="mt-4 text-sm"><summary className="cursor-pointer">変更内容</summary><pre className="mt-3 whitespace-pre-wrap break-words font-sans text-on-surface-variant">{status.releaseNotes}</pre></details>}
      <p className="mt-4 text-xs text-on-surface-variant">正式版のみ確認します。ダウンロードは自動で始まりません。更新時はアプリを終了します。MacはDMG内のアプリを置き換え、Linuxはパッケージ管理画面の案内に従ってください。</p>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy || status.status === "ready" || status.status === "opened"} onClick={() => run("check")} className="rounded-full border border-outline px-4 py-2 disabled:opacity-50 cursor-pointer">更新を確認</button>
        {status.available && status.status !== "ready" && status.status !== "opened" && <button type="button" disabled={busy} onClick={() => run("download")} className="rounded-full bg-primary text-on-primary px-4 py-2 disabled:opacity-50 cursor-pointer">{busy && <Loader2 className="inline h-4 w-4 animate-spin mr-1" />}ダウンロード</button>}
        {status.status === "ready" && <button type="button" disabled={busy} onClick={() => run("install")} className="rounded-full bg-primary text-on-primary px-4 py-2 disabled:opacity-50 cursor-pointer">アプリを終了して更新</button>}
      </div>
    </dialog>
  </>;
}
