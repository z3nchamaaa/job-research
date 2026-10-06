"use client";

import { useState } from "react";
import { CompanyItem, SelectionStatus, STATUS_LABELS } from "@/types";
import { Search, ExternalLink, MessageSquare, Filter, Building2, Zap } from "lucide-react";

interface Props {
  companies: CompanyItem[];
  onSelectCompany: (company: CompanyItem) => void;
  onStatusChange: (companyId: string, newStatus: SelectionStatus) => void;
}

export default function TableView({ companies, onSelectCompany, onStatusChange }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [industryFilter, setIndustryFilter] = useState<string>("ALL");
  const [onlyEarlySelection, setOnlyEarlySelection] = useState(false);

  // 業界ユニークリスト
  const industries = Array.from(
    new Set(companies.map((c) => c.industry).filter(Boolean))
  ) as string[];

  // フィルタリング
  const filtered = companies.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.industry && c.industry.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.jobType && c.jobType.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
    const matchesIndustry = industryFilter === "ALL" || c.industry === industryFilter;
    const matchesEarly = !onlyEarlySelection || c.isEarlySelection;

    return matchesSearch && matchesStatus && matchesIndustry && matchesEarly;
  });

  // M3 status chip style
  const getStatusChipClass = (status: SelectionStatus) => {
    switch (status) {
      case "OFFER":
        return "bg-emerald-100 text-emerald-900 border-emerald-300";
      case "REJECTED":
        return "bg-error-container text-on-error-container border-error/20";
      case "WITHDRAWN":
        return "bg-surface-container-high text-on-surface-variant border-outline-variant";
      case "FINAL":
        return "bg-tertiary-container text-on-tertiary-container border-tertiary/20";
      case "INTERVIEWING":
        return "bg-amber-100 text-amber-900 border-amber-300";
      case "ES_PASSED":
        return "bg-cyan-100 text-cyan-900 border-cyan-300";
      case "APPLIED":
        return "bg-primary-container text-on-primary-container border-primary/20";
      case "INTERESTED":
      default:
        return "bg-secondary-container text-on-secondary-container border-secondary/20";
    }
  };

  return (
    <div className="space-y-4">
      {/* フィルタバー */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-surface-container-lowest p-3.5 rounded-xl border border-outline-variant">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-on-surface-variant" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="企業名・業界・職種で検索..."
            className="w-full pl-9 pr-4 py-1.5 text-sm rounded-lg border border-outline bg-transparent text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* ステータス絞り込み */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm rounded-lg border border-outline px-3 py-1.5 text-on-surface bg-surface-container-lowest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="ALL">すべてのステータス</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>

          {/* 業界絞り込み */}
          {industries.length > 0 && (
            <select
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
              className="text-sm rounded-lg border border-outline px-3 py-1.5 text-on-surface bg-surface-container-lowest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            >
              <option value="ALL">すべての業界</option>
              {industries.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          )}

          {/* 早期選考のみ */}
          <label className="flex items-center gap-1.5 text-sm text-on-surface cursor-pointer select-none px-2 py-1.5 rounded-lg hover:bg-surface-container transition">
            <input
              type="checkbox"
              checked={onlyEarlySelection}
              onChange={(e) => setOnlyEarlySelection(e.target.checked)}
              className="accent-primary rounded h-4 w-4"
            />
            <span>早期選考のみ</span>
          </label>
        </div>
      </div>

      {/* スマホ: カードリスト */}
      <div className="sm:hidden flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-8 text-center text-on-surface-variant text-sm">
            条件に一致する企業がありません。
          </div>
        ) : (
          filtered.map((c) => {
            const currentStep = c.steps.find((s) => s.status === "PENDING") || c.steps[c.steps.length - 1];
            return (
              <div
                key={c.id}
                onClick={() => onSelectCompany(c)}
                className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 hover:bg-surface-container-low transition cursor-pointer flex flex-col gap-2"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-on-surface">{c.name}</span>
                  {c.isEarlySelection && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-tertiary-container text-on-tertiary-container px-2 h-6 text-[11px] font-medium shrink-0">
                      <Zap className="h-3 w-3" />
                      早期選考
                    </span>
                  )}
                </div>
                <div className="text-xs text-on-surface-variant">
                  {c.industry || "-"} / {c.jobType || "-"}
                </div>
                <div className="flex items-center gap-3">
                  <div onClick={(e) => e.stopPropagation()}>
                    <select
                      value={c.status}
                      onChange={(e) => onStatusChange(c.id, e.target.value as SelectionStatus)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer ${getStatusChipClass(c.status)}`}
                    >
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <span className="text-amber-400 font-medium text-sm">{"★".repeat(c.priority)}</span>
                </div>
                {currentStep && (
                  <div>
                    <span className="inline-block rounded-lg border border-outline-variant px-2 py-0.5 text-on-surface-variant text-xs font-medium">
                      {currentStep.stepName}
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* PC: テーブル本体 */}
      <div className="hidden sm:block rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-container border-b border-outline-variant text-on-surface-variant text-xs font-medium uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">企業名</th>
                <th className="px-4 py-3">ステータス</th>
                <th className="px-4 py-3">業界 / 職種</th>
                <th className="px-4 py-3">本命度</th>
                <th className="px-4 py-3">直近ステップ</th>
                <th className="px-4 py-3">面接ログ</th>
                <th className="px-4 py-3">リンク</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant text-sm">
                    条件に一致する企業がありません。
                  </td>
                </tr>
              ) : (
                filtered.map((c) => {
                  const currentStep = c.steps.find((s) => s.status === "PENDING") || c.steps[c.steps.length - 1];

                  return (
                    <tr
                      key={c.id}
                      onClick={() => onSelectCompany(c)}
                      className="hover:bg-surface-container-low transition cursor-pointer"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container font-medium shrink-0">
                            {c.name.slice(0, 1)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-on-surface block hover:text-primary transition">
                                {c.name}
                              </span>
                              {c.isEarlySelection && (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-tertiary-container text-on-tertiary-container px-2 h-6 text-[11px] font-medium shrink-0">
                                  <Zap className="h-3 w-3" />
                                  早期選考
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={c.status}
                          onChange={(e) => onStatusChange(c.id, e.target.value as SelectionStatus)}
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer ${getStatusChipClass(c.status)}`}
                        >
                          {Object.entries(STATUS_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="text-on-surface font-medium">{c.industry || "-"}</div>
                        <div className="text-on-surface-variant text-xs">{c.jobType || "-"}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="text-amber-400 font-medium">{"★".repeat(c.priority)}</span>
                      </td>

                      <td className="px-4 py-3.5">
                        {currentStep ? (
                          <span className="inline-block rounded-lg border border-outline-variant px-2 py-0.5 text-on-surface-variant text-xs font-medium">
                            {currentStep.stepName}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant">-</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        {c.interviews?.length > 0 ? (
                          <span className="flex items-center gap-1 text-primary font-medium">
                            <MessageSquare className="h-3.5 w-3.5" />
                            {c.interviews.length} 件
                          </span>
                        ) : (
                          <span className="text-on-surface-variant">-</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {c.websiteUrl && (
                            <a
                              href={c.websiteUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="企業HP"
                              className="text-on-surface-variant hover:text-primary p-1"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {c.myPageUrl && (
                            <a
                              href={c.myPageUrl}
                              target="_blank"
                              rel="noreferrer"
                              title="マイページ"
                              className="text-primary hover:underline p-1 font-medium flex items-center gap-0.5 text-xs"
                            >
                              マイページ
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
