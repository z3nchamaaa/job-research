"use client";

import { Sparkles, Plus, Kanban, Table2, Calendar, RefreshCw, Wallet, Check, User } from "lucide-react";

interface Props {
  activeView: "kanban" | "table" | "schedule" | "compensation";
  onViewChange: (view: "kanban" | "table" | "schedule" | "compensation") => void;
  onOpenAiModal: () => void;
  onOpenManualModal: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenProfileModal: () => void;
  isProfileDisabled?: boolean;
}

export default function Header({
  activeView,
  onViewChange,
  onOpenAiModal,
  onOpenManualModal,
  onRefresh,
  isRefreshing,
  onOpenProfileModal,
  isProfileDisabled = false,
}: Props) {
  return (
    <header className="sticky top-0 z-40 bg-surface-container">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between sm:h-16 py-2 sm:py-0 gap-y-3 sm:gap-y-0 gap-x-4">
          {/* Logo & App Name */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-medium text-lg sm:text-xl text-on-surface tracking-tight whitespace-nowrap">
                  就活Tracker
                </h1>
                <span className="hidden xl:inline-block rounded-lg border border-outline-variant px-2 py-0.5 text-[10px] font-medium text-on-surface-variant whitespace-nowrap">
                  企業調査をAIで補助
                </span>
              </div>
              <p className="text-xs text-on-surface-variant hidden xl:block">
                応募先や選考日程をまとめて管理
              </p>
            </div>
          </div>

          {/* View Switcher (M3 Segmented button) */}
          <div className="order-last w-full sm:order-none sm:w-auto flex sm:inline-flex rounded-full border border-outline overflow-hidden">
            <button
              onClick={() => onViewChange("kanban")}
              title="カンバン"
              className={`h-10 px-4 text-sm font-medium whitespace-nowrap border-l border-outline first:border-l-0 flex flex-1 justify-center sm:flex-none sm:inline-flex items-center gap-1.5 transition cursor-pointer ${
                activeView === "kanban"
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-surface-variant hover:bg-on-surface/8"
              }`}
            >
              {activeView === "kanban" ? <Check className="h-4 w-4" /> : <Kanban className="h-4 w-4" />}
              <span className="hidden xl:inline">カンバン</span>
            </button>
            <button
              onClick={() => onViewChange("table")}
              title="リスト"
              className={`h-10 px-4 text-sm font-medium whitespace-nowrap border-l border-outline first:border-l-0 flex flex-1 justify-center sm:flex-none sm:inline-flex items-center gap-1.5 transition cursor-pointer ${
                activeView === "table"
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-surface-variant hover:bg-on-surface/8"
              }`}
            >
              {activeView === "table" ? <Check className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
              <span className="hidden xl:inline">リスト</span>
            </button>
            <button
              onClick={() => onViewChange("schedule")}
              title="日程・締切"
              className={`h-10 px-4 text-sm font-medium whitespace-nowrap border-l border-outline first:border-l-0 flex flex-1 justify-center sm:flex-none sm:inline-flex items-center gap-1.5 transition cursor-pointer ${
                activeView === "schedule"
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-surface-variant hover:bg-on-surface/8"
              }`}
            >
              {activeView === "schedule" ? <Check className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
              <span className="hidden xl:inline">日程・締切</span>
            </button>
            <button
              onClick={() => onViewChange("compensation")}
              title="待遇比較"
              className={`h-10 px-4 text-sm font-medium whitespace-nowrap border-l border-outline first:border-l-0 flex flex-1 justify-center sm:flex-none sm:inline-flex items-center gap-1.5 transition cursor-pointer ${
                activeView === "compensation"
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-surface-variant hover:bg-on-surface/8"
              }`}
            >
              {activeView === "compensation" ? <Check className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
              <span className="hidden xl:inline">待遇比較</span>
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenProfileModal}
              disabled={isProfileDisabled}
              title="就活軸を編集"
              aria-label="就活軸を編集"
              className="rounded-full h-10 w-10 inline-flex items-center justify-center text-on-surface-variant hover:bg-on-surface/8 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <User className="h-5 w-5" />
            </button>
            <button
              onClick={onRefresh}
              title="更新"
              disabled={isRefreshing}
              className="rounded-full h-10 w-10 inline-flex items-center justify-center text-on-surface-variant hover:bg-on-surface/8 transition disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={onOpenManualModal}
              title="企業を登録"
              className="inline-flex items-center justify-center gap-1 rounded-full bg-secondary-container text-on-secondary-container h-10 w-10 md:w-auto md:px-6 text-sm font-medium whitespace-nowrap hover:brightness-95 transition cursor-pointer"
            >
              <Plus className="h-4 w-4" /> <span className="hidden md:inline">企業を登録</span>
            </button>

            <button
              onClick={onOpenAiModal}
              title="AIプロンプトで登録"
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary text-on-primary w-10 h-10 xl:w-auto xl:px-6 text-sm font-medium whitespace-nowrap hover:shadow-sm hover:brightness-110 transition cursor-pointer"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              <span className="hidden xl:inline">AIプロンプトで登録</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
