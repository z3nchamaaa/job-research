"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { CareerProfile } from "../lib/career-profile";
import { DEFAULT_CAREER_PROFILE, normalizeCareerProfile } from "../lib/career-profile";
import { useDesktopBridge } from "./desktopBridge";
import type { SyukatsuDesktopAPI } from "../types/desktop";

const LOCAL_STORAGE_KEY = "syukatsu.career-profile.v1";

export function useCareerProfile() {
  const bridge = useDesktopBridge();
  const [profile, setProfile] = useState<CareerProfile>(DEFAULT_CAREER_PROFILE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const sequenceRef = useRef(0);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  const retry = useCallback(() => {
    setReloadTrigger((count) => count + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const seq = ++sequenceRef.current;

    const executeLoad = async () => {
      // 微小遅延でハイドレーションとwindow.syukatsuDesktopの安定化を待つ
      await Promise.resolve();
      if (cancelled || seq !== sequenceRef.current) return;

      setLoading(true);
      setError(null);

      try {
        const activeBridge: SyukatsuDesktopAPI | null =
          bridge ?? (typeof window !== "undefined" ? window.syukatsuDesktop ?? null : null);

        let loaded: CareerProfile;

        if (activeBridge) {
          if (typeof activeBridge.getCareerProfile !== "function") {
            throw new Error("デスクトップ環境でプロフィールの取得機能が利用できません。");
          }
          const raw = await activeBridge.getCareerProfile();
          loaded = normalizeCareerProfile(raw);
        } else {
          // UIプレビュー（ブラウザ環境のみ）
          if (typeof window === "undefined") {
            return;
          }
          try {
            const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
            if (stored) {
              loaded = normalizeCareerProfile(JSON.parse(stored));
            } else {
              loaded = DEFAULT_CAREER_PROFILE;
            }
          } catch (storageErr) {
            throw new Error(
              storageErr instanceof Error
                ? storageErr.message
                : "ローカルストレージの読み込みに失敗しました。"
            );
          }
        }

        if (cancelled || seq !== sequenceRef.current) return;
        setProfile(loaded);
      } catch (err) {
        if (cancelled || seq !== sequenceRef.current) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled && seq === sequenceRef.current) {
          setLoading(false);
        }
      }
    };

    Promise.resolve().then(() => {
      if (!cancelled && seq === sequenceRef.current) {
        void executeLoad();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [bridge, reloadTrigger]);

  const saveProfile = useCallback(
    async (newProfile: CareerProfile): Promise<CareerProfile> => {
      const toSave = normalizeCareerProfile(newProfile);
      const activeBridge: SyukatsuDesktopAPI | null =
        bridge ?? (typeof window !== "undefined" ? window.syukatsuDesktop ?? null : null);

      let savedResult: CareerProfile;

      if (activeBridge) {
        if (typeof activeBridge.saveCareerProfile !== "function") {
          throw new Error("デスクトップ環境でプロフィールの保存機能が利用できません。");
        }
        const res = await activeBridge.saveCareerProfile(toSave);
        savedResult = normalizeCareerProfile(res);
      } else {
        if (typeof window === "undefined") {
          throw new Error("保存環境が見つかりません。");
        }
        try {
          window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(toSave));
          savedResult = toSave;
        } catch {
          throw new Error("ローカルストレージへの保存に失敗しました。");
        }
      }

      setProfile(savedResult);
      return savedResult;
    },
    [bridge]
  );

  return { profile, loading, error, saveProfile, retry };
}
