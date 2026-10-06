"use client";

import { useSyncExternalStore } from "react";
import type { SyukatsuDesktopAPI } from "../types/desktop";

let cachedBridge: SyukatsuDesktopAPI | null | undefined;

function subscribe(): () => void {
  return () => {};
}

function getClientSnapshot(): SyukatsuDesktopAPI | null {
  if (cachedBridge === undefined) {
    cachedBridge = window.syukatsuDesktop ?? null;
  }
  return cachedBridge;
}

function getServerSnapshot(): SyukatsuDesktopAPI | null {
  return null;
}

/**
 * Electron の preload が公開する window.syukatsuDesktop を返す。
 * サーバー描画とハイドレーション時は null を返すため、Web版と表示が一致する。
 */
export function useDesktopBridge(): SyukatsuDesktopAPI | null {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}

const SECRET_PATTERN =
  /(access[_-]?token|refresh[_-]?token|id[_-]?token|authorization|bearer\s|code[_-]?verifier|client[_-]?secret|api[_-]?key|eyJ[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{10,})/i;
const JAPANESE_PATTERN = /[\u3040-\u30ff\u4e00-\u9fff]/;
const MAX_DETAIL_LENGTH = 200;

/**
 * IPC 例外を日本語のメッセージに変換する。
 * Electron の "Error invoking remote method '...':" 接頭辞を除去し、
 * トークン等の秘密情報らしき文字列を含む場合は詳細を表示しない。
 */
export function describeDesktopError(err: unknown, fallback: string): string {
  let message = "";
  if (err instanceof Error) {
    message = err.message;
  } else if (typeof err === "string") {
    message = err;
  }

  message = message
    .replace(/^Error invoking remote method '[^']*':\s*/i, "")
    .replace(/^(?:[A-Za-z]*Error:\s*)+/, "")
    .trim();

  if (message === "" || SECRET_PATTERN.test(message)) {
    return fallback;
  }
  if (JAPANESE_PATTERN.test(message)) {
    return message.length > MAX_DETAIL_LENGTH * 2
      ? `${message.slice(0, MAX_DETAIL_LENGTH * 2)}…`
      : message;
  }
  const detail =
    message.length > MAX_DETAIL_LENGTH ? `${message.slice(0, MAX_DETAIL_LENGTH)}…` : message;
  return `${fallback}（詳細: ${detail}）`;
}
