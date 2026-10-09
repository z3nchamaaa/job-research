"use client";

import { CompanyItem, SelectionStatus, STATUS_LABELS } from "@/types";
import { nextEvent } from "@/lib/calendar";
import { ChevronRight, ChevronLeft, Building2, MessageSquare, Calendar, ExternalLink, Zap } from "lucide-react";

interface Props {
  companies: CompanyItem[];
  onSelectCompany: (company: CompanyItem) => void;
  onStatusChange: (companyId: string, newStatus: SelectionStatus) => void;
}

const STATUS_LANES: { key: SelectionStatus; statuses: SelectionStatus[]; label?: string }[] = [
  { key: "INTERESTED", statuses: ["INTERESTED"] },
  { key: "APPLIED", statuses: ["APPLIED"] },
  { key: "ES_PASSED", statuses: ["ES_PASSED"] },
  { key: "INTERVIEWING", statuses: ["INTERVIEWING", "FINAL"], label: "面接" },
  { key: "OFFER", statuses: ["OFFER"] },
  { key: "REJECTED", statuses: ["REJECTED"] },
  { key: "WITHDRAWN", statuses: ["WITHDRAWN"] },
];

type DisplayLane =
  | { key: "EARLY_SELECTION"; label: string; isEarlyLane: true }
  | { key: SelectionStatus; statuses: SelectionStatus[]; label?: string; isEarlyLane?: false };

const DISPLAY_LANES: DisplayLane[] = [
  { key: "INTERESTED", statuses: ["INTERESTED"] },
  { key: "EARLY_SELECTION", label: "早期選考", isEarlyLane: true },
  { key: "APPLIED", statuses: ["APPLIED"] },
  { key: "ES_PASSED", statuses: ["ES_PASSED"] },
  { key: "INTERVIEWING", statuses: ["INTERVIEWING", "FINAL"], label: "面接" },
  { key: "OFFER", statuses: ["OFFER"] },
  { key: "REJECTED", statuses: ["REJECTED"] },
  { key: "WITHDRAWN", statuses: ["WITHDRAWN"] },
];

const EARLY_STATUS_ORDER: SelectionStatus[] = [
  "FINAL",
  "INTERVIEWING",
  "ES_PASSED",
  "APPLIED",
  "INTERESTED",
];

export default function KanbanBoard({ companies, onSelectCompany, onStatusChange }: Props) {
  const isEarlyCandidate = (c: CompanyItem) =>
    c.isEarlySelection && !["OFFER", "REJECTED", "WITHDRAWN"].includes(c.status);

  const getCompaniesForLane = (lane: DisplayLane) => {
    if (lane.isEarlyLane) {
      return companies
        .filter(isEarlyCandidate)
        .sort((a, b) => {
          const indexA = EARLY_STATUS_ORDER.indexOf(a.status);
          const indexB = EARLY_STATUS_ORDER.indexOf(b.status);
          return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
        });
    }

    const laneCompanies = companies.filter(
      (c) => lane.statuses.includes(c.status) && !isEarlyCandidate(c)
    );

    if (lane.key === "INTERVIEWING") {
      return [...laneCompanies].sort((a, b) => {
        if (a.status === "FINAL" && b.status !== "FINAL") return -1;
        if (a.status !== "FINAL" && b.status === "FINAL") return 1;
        return 0;
      });
    }

    return laneCompanies;
  };

  const moveLane = (company: CompanyItem, direction: "prev" | "next") => {
    const currentIndex = STATUS_LANES.findIndex((lane) => lane.statuses.includes(company.status));
    if (currentIndex === -1) return;
    const targetIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
    if (targetIndex >= 0 && targetIndex < STATUS_LANES.length) {
      onStatusChange(company.id, STATUS_LANES[targetIndex].key);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pb-6 pt-2 select-none">
      {DISPLAY_LANES.map((lane) => {
        const laneCompanies = getCompaniesForLane(lane);
        const laneTitle = lane.isEarlyLane ? lane.label : lane.label || STATUS_LABELS[lane.key].label;

        return (
          <div
            key={lane.key}
            className="flex flex-col rounded-2xl bg-surface-container-low sm:min-h-[180px] max-h-[480px]"
          >
            {/* Lane Header */}
            <div className="flex items-center justify-between px-3.5 py-3 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${
                  lane.isEarlyLane
                    ? "bg-tertiary"
                    : lane.key === "OFFER"
                    ? "bg-emerald-600"
                    : lane.key === "REJECTED"
                    ? "bg-error"
                    : lane.key === "WITHDRAWN"
                    ? "bg-outline"
                    : lane.key === "INTERVIEWING"
                    ? "bg-amber-600"
                    : "bg-primary"
                }`} />
                <h3 className="text-sm font-medium text-on-surface flex items-center gap-1.5">
                  {lane.isEarlyLane && <Zap className="h-3.5 w-3.5 text-tertiary" />}
                  {laneTitle}
                </h3>
              </div>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container">
                {laneCompanies.length}
              </span>
            </div>

            {/* Lane Cards */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
              {laneCompanies.length === 0 ? (
                <div className="h-12 sm:h-24 flex items-center justify-center border border-dashed border-outline-variant rounded-xl text-xs text-on-surface-variant">
                  企業なし
                </div>
              ) : (
                laneCompanies.map((c) => {
                  const currentLaneIndex = STATUS_LANES.findIndex((l) => l.statuses.includes(c.status));
                  const currentStep = c.steps.find((s) => s.status === "PENDING") || c.steps[c.steps.length - 1];
                  const upcomingEvent = nextEvent(c.events || []);

                  return (
                    <div
                      key={c.id}
                      onClick={() => onSelectCompany(c)}
                      className="group relative rounded-xl border border-outline-variant bg-surface-container-lowest p-3 hover:bg-surface-container-low transition cursor-pointer"
                    >
                      {/* Priority & Industry */}
                      <div className="flex items-center justify-between gap-1 text-xs mb-1">
                        <span className="font-medium text-amber-400">
                          {"★".repeat(c.priority)}
                        </span>
                        {c.industry && (
                          <span className="truncate max-w-[120px] rounded-lg border border-outline-variant px-1.5 py-0.5 text-on-surface-variant text-xs font-medium">
                            {c.industry}
                          </span>
                        )}
                      </div>

                      {/* Company Name */}
                      <h4 className="font-medium text-on-surface text-sm leading-snug group-hover:text-primary transition line-clamp-2 [overflow-wrap:anywhere]">
                        {c.name}
                      </h4>

                      {/* Chips */}
                      {lane.isEarlyLane ? (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {c.status === "FINAL" ? (
                            <span className="inline-flex items-center rounded-lg bg-primary-container text-on-primary-container px-2 h-6 text-[11px] font-medium">
                              最終面接
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-lg bg-surface-container-highest text-on-surface-variant px-2 h-6 text-[11px] font-medium">
                              {STATUS_LABELS[c.status].label}
                            </span>
                          )}
                        </div>
                      ) : (
                        (c.isEarlySelection || c.status === "FINAL") && (
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {c.isEarlySelection && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-tertiary-container text-on-tertiary-container px-2 h-6 text-[11px] font-medium">
                                <Zap className="h-3 w-3" />
                                早期選考
                              </span>
                            )}
                            {c.status === "FINAL" && (
                              <span className="inline-flex items-center rounded-lg bg-primary-container text-on-primary-container px-2 h-6 text-[11px] font-medium">
                                最終面接
                              </span>
                            )}
                          </div>
                        )
                      )}

                      {/* Job Type */}
                      {c.jobType && (
                        <p className="text-xs text-on-surface-variant mt-0.5 line-clamp-1">{c.jobType}</p>
                      )}

                      {/* Current / Next Step */}
                      {currentStep && (
                        <div className="mt-2.5 rounded-lg bg-primary-container text-on-primary-container px-2 py-1 flex items-center justify-between text-xs">
                          <span className="font-medium truncate">次: {currentStep.stepName}</span>
                          {currentStep.dueDate && (
                            <span className="text-[10px] text-on-primary-container/80 shrink-0">
                              {new Date(currentStep.dueDate).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Footer Info & Quick Move */}
                      {upcomingEvent && <p className="mt-2 text-xs text-primary [overflow-wrap:anywhere]">次の予定：{new Date(upcomingEvent.startAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}　{upcomingEvent.title}</p>}
                      <div className="mt-2.5 pt-2 border-t border-outline-variant flex items-center justify-between text-xs text-on-surface-variant">
                        <div className="flex items-center gap-2">
                          {c.interviews?.length > 0 && (
                            <span className="flex items-center gap-0.5 text-on-surface-variant font-medium">
                              <MessageSquare className="h-3 w-3" /> {c.interviews.length}
                            </span>
                          )}
                          {c.myPageUrl && (
                            <a
                              href={c.myPageUrl}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary hover:underline"
                              title="マイページ"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>

                        {/* Quick Step Buttons */}
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                          {currentLaneIndex > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveLane(c, "prev");
                              }}
                              title="前のステータスに戻す"
                              className="h-8 w-8 rounded-full inline-flex items-center justify-center text-on-surface-variant hover:bg-on-surface/8 transition cursor-pointer"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {currentLaneIndex < STATUS_LANES.length - 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                moveLane(c, "next");
                              }}
                              title="次のステータスへ進める"
                              className="h-8 w-8 rounded-full inline-flex items-center justify-center text-on-surface-variant hover:bg-on-surface/8 transition cursor-pointer"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
