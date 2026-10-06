"use client";

import { CompanyItem, ScheduleEventItem } from "@/types";
import { Award, Briefcase, Clock, FileCheck, Users, AlertCircle } from "lucide-react";

interface Props {
  companies: CompanyItem[];
  events: ScheduleEventItem[];
}

export default function MetricCards({ companies, events }: Props) {
  const total = companies.length;
  const interviewing = companies.filter((c) => c.status === "INTERVIEWING" || c.status === "FINAL").length;
  const offers = companies.filter((c) => c.status === "OFFER").length;
  const passedDocs = companies.filter(
    (c) => c.status !== "INTERESTED" && c.status !== "APPLIED" && c.status !== "REJECTED"
  ).length;

  // 直近7日以内の未完了予定
  const now = new Date();
  const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const urgentEvents = events.filter((ev) => {
    const d = new Date(ev.startAt);
    return d >= now && d <= next7Days && !ev.isDone;
  });

  return (
    <div className="space-y-3">
      {/* 緊急アラート（直近予定がある場合） */}
      {urgentEvents.length > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-amber-100 p-3.5 text-amber-900">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="h-5 w-5 text-amber-700 shrink-0" />
            <div className="text-xs">
              <span className="font-medium">7日以内の予定や締切が{urgentEvents.length}件あります。</span>
              <span className="text-amber-800">
                {urgentEvents
                  .slice(0, 2)
                  .map((e) => `${e.title} (${new Date(e.startAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })})`)
                  .join("、")}
                {urgentEvents.length > 2 && " ほか"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* メトリクスグリッド */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* 総エントリー */}
        <div className="rounded-xl bg-surface-container-low p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-surface-variant">登録企業</span>
            <div className="h-8 w-8 rounded-full flex items-center justify-center bg-secondary-container text-on-secondary-container">
              <Briefcase className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-normal text-on-surface">{total}</span>
            <span className="text-xs text-on-surface-variant">社</span>
          </div>
        </div>

        {/* 書類通過数 */}
        <div className="rounded-xl bg-surface-container-low p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-surface-variant">書類通過</span>
            <div className="h-8 w-8 rounded-full flex items-center justify-center bg-secondary-container text-on-secondary-container">
              <FileCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-normal text-on-surface">{passedDocs}</span>
            <span className="text-xs text-on-surface-variant">
              {total > 0 ? `(${Math.round((passedDocs / total) * 100)}%)` : "社"}
            </span>
          </div>
        </div>

        {/* 面接選考中 */}
        <div className="rounded-xl bg-surface-container-low p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-surface-variant">面接選考中</span>
            <div className="h-8 w-8 rounded-full flex items-center justify-center bg-secondary-container text-on-secondary-container">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-normal text-on-surface">{interviewing}</span>
            <span className="text-xs text-on-surface-variant">社</span>
          </div>
        </div>

        {/* 内定獲得 */}
        <div className="rounded-xl bg-tertiary-container text-on-tertiary-container p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-on-tertiary-container">内定獲得 🎉</span>
            <div className="h-8 w-8 rounded-full flex items-center justify-center bg-on-tertiary-container/10 text-on-tertiary-container">
              <Award className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-normal text-on-tertiary-container">{offers}</span>
            <span className="text-xs text-on-tertiary-container/80 font-medium">社</span>
          </div>
        </div>
      </div>
    </div>
  );
}
