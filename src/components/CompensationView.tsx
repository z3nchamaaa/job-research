"use client";

import { useState, useMemo } from "react";
import { CompanyItem, STATUS_LABELS, SelectionStatus } from "@/types";
import {
  Wallet,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Building2,
  Filter,
  Zap,
} from "lucide-react";

interface Props {
  companies: CompanyItem[];
  onSelectCompany: (company: CompanyItem) => void;
}

type SortKey =
  | "startingSalary"
  | "bonusMonths"
  | "bonusAmount"
  | "annualIncome"
  | "annualHolidays"
  | "ratingSalary"
  | "ratingBenefits";

type SortOrder = "asc" | "desc";

// 待遇情報が1つでも入っているか判定
function hasCompensationData(c: CompanyItem): boolean {
  return (
    c.startingSalary != null ||
    c.bonusTimes != null ||
    c.bonusMonths != null ||
    c.annualIncome != null ||
    c.annualHolidays != null ||
    Boolean(c.fixedOvertime && c.fixedOvertime.trim() !== "") ||
    Boolean(c.housingAllowance && c.housingAllowance.trim() !== "") ||
    Boolean(c.remoteWork && c.remoteWork.trim() !== "") ||
    Boolean(c.salary && c.salary.trim() !== "") ||
    Boolean(c.benefits && c.benefits.trim() !== "") ||
    c.ratingSalary > 0 ||
    c.ratingBenefits > 0
  );
}

// 賞与額目安の計算
function getBonusAmount(c: CompanyItem): number | null {
  if (c.startingSalary != null && c.bonusMonths != null) {
    return Math.round(c.startingSalary * c.bonusMonths);
  }
  return null;
}

// 想定年収（算出目安含む）の取得
function getEffectiveAnnualIncome(
  c: CompanyItem
): { value: number; isEstimate: boolean } | null {
  if (c.annualIncome != null) {
    return { value: c.annualIncome, isEstimate: false };
  }
  if (c.startingSalary != null) {
    const months = 12 + (c.bonusMonths ?? 0);
    return {
      value: Math.round((c.startingSalary * months) / 10000),
      isEstimate: true,
    };
  }
  return null;
}

// ソート用数値取得
function getSortValue(c: CompanyItem, key: SortKey): number | null {
  switch (key) {
    case "startingSalary":
      return c.startingSalary ?? null;
    case "bonusMonths":
      return c.bonusMonths ?? null;
    case "bonusAmount":
      return getBonusAmount(c);
    case "annualIncome":
      return getEffectiveAnnualIncome(c)?.value ?? null;
    case "annualHolidays":
      return c.annualHolidays ?? null;
    case "ratingSalary":
      return c.ratingSalary > 0 ? c.ratingSalary : null;
    case "ratingBenefits":
      return c.ratingBenefits > 0 ? c.ratingBenefits : null;
  }
}

export default function CompensationView({ companies, onSelectCompany }: Props) {
  const [excludeRejected, setExcludeRejected] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("annualIncome");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // 全体で待遇情報が1件でも入っている企業があるかチェック
  const hasAnyCompInfo = useMemo(
    () => companies.some(hasCompensationData),
    [companies]
  );

  // フィルタリング（お祈り・辞退の除外）
  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      if (
        excludeRejected &&
        (c.status === "REJECTED" || c.status === "WITHDRAWN")
      ) {
        return false;
      }
      return true;
    });
  }, [companies, excludeRejected]);

  // ソート処理（未入力は常に末尾）
  const sortedCompanies = useMemo(() => {
    return [...filteredCompanies].sort((a, b) => {
      const valA = getSortValue(a, sortKey);
      const valB = getSortValue(b, sortKey);

      if (valA === null && valB === null) return 0;
      if (valA === null) return 1;
      if (valB === null) return -1;

      return sortOrder === "asc" ? valA - valB : valB - valA;
    });
  }, [filteredCompanies, sortKey, sortOrder]);

  // 数値列ごとの最大値を計算（表示中リスト基準）
  const maxValues = useMemo(() => {
    const keys: SortKey[] = [
      "startingSalary",
      "bonusMonths",
      "bonusAmount",
      "annualIncome",
      "annualHolidays",
      "ratingSalary",
      "ratingBenefits",
    ];
    const result: Partial<Record<SortKey, number>> = {};
    for (const key of keys) {
      const validValues = sortedCompanies
        .map((c) => getSortValue(c, key))
        .filter((v): v is number => v !== null && v > 0);
      if (validValues.length > 0) {
        result[key] = Math.max(...validValues);
      }
    }
    return result;
  }, [sortedCompanies]);

  const handleHeaderClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

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

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-on-surface-variant/40 ml-1 inline-block" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-primary ml-1 inline-block" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-primary ml-1 inline-block" />
    );
  };

  // 企業が0件、または待遇情報が1件も入っていない場合の空状態
  if (companies.length === 0 || !hasAnyCompInfo) {
    return (
      <div className="rounded-[28px] border border-outline-variant bg-surface-container-lowest p-12 text-center max-w-2xl mx-auto space-y-4 my-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
          <Wallet className="h-8 w-8" />
        </div>
        <div>
          <h3 className="text-lg font-medium text-on-surface">
            待遇情報がまだ登録されていません
          </h3>
          <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">
            初任給・賞与・想定年収・年間休日などの待遇情報を比較できます。
            <br />
            企業詳細の「<span className="font-medium text-on-surface">給与・福利厚生</span>」タブから入力できます。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 上部コントロールバー */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-surface-container-lowest p-3.5 rounded-xl border border-outline-variant">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-on-surface hover:text-primary">
            <input
              type="checkbox"
              checked={excludeRejected}
              onChange={(e) => setExcludeRejected(e.target.checked)}
              className="rounded border-outline text-primary accent-primary h-4 w-4"
            />
            <span>お祈り・辞退を除外</span>
          </label>
          <span className="text-outline-variant text-xs">|</span>
          <span className="text-xs text-on-surface-variant">
            表示中: <span className="font-medium text-on-surface">{sortedCompanies.length}</span> 社
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <span className="inline-block w-2.5 h-2.5 rounded-xs bg-emerald-100 border border-emerald-300"></span>
          <span>最大値ハイライト</span>
        </div>
      </div>

      {/* テーブル本体 */}
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-surface-container border-b border-outline-variant text-on-surface-variant text-xs font-medium uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 sticky left-0 bg-surface-container z-10 border-r border-outline-variant">
                  企業名
                </th>
                <th className="px-4 py-3">ステータス</th>
                <th
                  onClick={() => handleHeaderClick("startingSalary")}
                  className={`px-4 py-3 cursor-pointer hover:bg-surface-container-high transition select-none ${
                    sortKey === "startingSalary" ? "text-primary" : ""
                  }`}
                >
                  <div className="flex items-center">
                    初任給
                    {renderSortIcon("startingSalary")}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderClick("bonusMonths")}
                  className={`px-4 py-3 cursor-pointer hover:bg-surface-container-high transition select-none ${
                    sortKey === "bonusMonths" ? "text-primary" : ""
                  }`}
                >
                  <div className="flex items-center">
                    賞与 (回数・月数)
                    {renderSortIcon("bonusMonths")}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderClick("bonusAmount")}
                  className={`px-4 py-3 cursor-pointer hover:bg-surface-container-high transition select-none ${
                    sortKey === "bonusAmount" ? "text-primary" : ""
                  }`}
                >
                  <div className="flex items-center">
                    賞与額目安
                    {renderSortIcon("bonusAmount")}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderClick("annualIncome")}
                  className={`px-4 py-3 cursor-pointer hover:bg-surface-container-high transition select-none ${
                    sortKey === "annualIncome" ? "text-primary" : ""
                  }`}
                >
                  <div className="flex items-center">
                    想定年収
                    {renderSortIcon("annualIncome")}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderClick("annualHolidays")}
                  className={`px-4 py-3 cursor-pointer hover:bg-surface-container-high transition select-none ${
                    sortKey === "annualHolidays" ? "text-primary" : ""
                  }`}
                >
                  <div className="flex items-center">
                    年間休日
                    {renderSortIcon("annualHolidays")}
                  </div>
                </th>
                <th className="px-4 py-3">みなし残業</th>
                <th className="px-4 py-3">住宅手当</th>
                <th className="px-4 py-3">リモート</th>
                <th
                  onClick={() => handleHeaderClick("ratingSalary")}
                  className={`px-4 py-3 cursor-pointer hover:bg-surface-container-high transition select-none ${
                    sortKey === "ratingSalary" ? "text-primary" : ""
                  }`}
                >
                  <div className="flex items-center">
                    給与評価
                    {renderSortIcon("ratingSalary")}
                  </div>
                </th>
                <th
                  onClick={() => handleHeaderClick("ratingBenefits")}
                  className={`px-4 py-3 cursor-pointer hover:bg-surface-container-high transition select-none ${
                    sortKey === "ratingBenefits" ? "text-primary" : ""
                  }`}
                >
                  <div className="flex items-center">
                    福利厚生評価
                    {renderSortIcon("ratingBenefits")}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {sortedCompanies.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-on-surface-variant text-sm">
                    条件に一致する企業がありません。
                  </td>
                </tr>
              ) : (
                sortedCompanies.map((c) => {
                  const statusInfo = STATUS_LABELS[c.status] || STATUS_LABELS.APPLIED;
                  const bonusAmount = getBonusAmount(c);
                  const effectiveAnnual = getEffectiveAnnualIncome(c);

                  // 各数値列の最大値判定
                  const isMaxStartingSalary =
                    c.startingSalary != null &&
                    maxValues.startingSalary != null &&
                    c.startingSalary === maxValues.startingSalary;

                  const isMaxBonusMonths =
                    c.bonusMonths != null &&
                    maxValues.bonusMonths != null &&
                    c.bonusMonths === maxValues.bonusMonths;

                  const isMaxBonusAmount =
                    bonusAmount != null &&
                    maxValues.bonusAmount != null &&
                    bonusAmount === maxValues.bonusAmount;

                  const isMaxAnnualIncome =
                    effectiveAnnual != null &&
                    maxValues.annualIncome != null &&
                    effectiveAnnual.value === maxValues.annualIncome;

                  const isMaxAnnualHolidays =
                    c.annualHolidays != null &&
                    maxValues.annualHolidays != null &&
                    c.annualHolidays === maxValues.annualHolidays;

                  const isMaxRatingSalary =
                    c.ratingSalary > 0 &&
                    maxValues.ratingSalary != null &&
                    c.ratingSalary === maxValues.ratingSalary;

                  const isMaxRatingBenefits =
                    c.ratingBenefits > 0 &&
                    maxValues.ratingBenefits != null &&
                    c.ratingBenefits === maxValues.ratingBenefits;

                  const highlightClass =
                    "bg-emerald-100 text-emerald-900 font-medium px-2 py-0.5 rounded-lg inline-block border border-emerald-300";

                  return (
                    <tr
                      key={c.id}
                      onClick={() => onSelectCompany(c)}
                      className="group hover:bg-surface-container-low transition cursor-pointer"
                    >
                      {/* 企業名 */}
                      <td className="px-4 py-3.5 sticky left-0 bg-surface-container-lowest group-hover:bg-surface-container-low transition z-10 border-r border-outline-variant">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary-container text-on-secondary-container font-medium shrink-0">
                            {c.name.slice(0, 1)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-on-surface block hover:text-primary transition max-w-[140px] sm:max-w-none whitespace-normal break-words">
                                {c.name}
                              </span>
                              {c.isEarlySelection && (
                                <span className="inline-flex items-center gap-1 rounded-lg bg-tertiary-container text-on-tertiary-container px-2 h-6 text-[11px] font-medium shrink-0">
                                  <Zap className="h-3 w-3" />
                                  早期選考
                                </span>
                              )}
                            </div>
                            {c.industry && (
                              <span className="text-xs text-on-surface-variant hidden sm:block">
                                {c.industry}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* ステータス */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusChipClass(c.status)}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* 初任給 */}
                      <td className="px-4 py-3.5">
                        {c.startingSalary != null ? (
                          <span className={isMaxStartingSalary ? highlightClass : "text-on-surface font-medium"}>
                            ¥{c.startingSalary.toLocaleString("ja-JP")}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant">-</span>
                        )}
                      </td>

                      {/* 賞与 (回数・月数) */}
                      <td className="px-4 py-3.5">
                        {c.bonusTimes != null || c.bonusMonths != null ? (
                          <span className={isMaxBonusMonths ? highlightClass : "text-on-surface font-medium"}>
                            {c.bonusTimes != null && `年${c.bonusTimes}回`}
                            {c.bonusTimes != null && c.bonusMonths != null && " / "}
                            {c.bonusMonths != null && `${c.bonusMonths}ヶ月`}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant">-</span>
                        )}
                      </td>

                      {/* 賞与額目安 */}
                      <td className="px-4 py-3.5">
                        {bonusAmount != null ? (
                          <span className={isMaxBonusAmount ? highlightClass : "text-on-surface font-medium"}>
                            約¥{bonusAmount.toLocaleString("ja-JP")}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant">-</span>
                        )}
                      </td>

                      {/* 想定年収 */}
                      <td className="px-4 py-3.5">
                        {c.annualIncome != null ? (
                          <span className={isMaxAnnualIncome ? highlightClass : "text-on-surface font-medium"}>
                            {c.annualIncome}万円
                          </span>
                        ) : effectiveAnnual != null ? (
                          <span
                            className={
                              isMaxAnnualIncome
                                ? highlightClass
                                : "text-on-surface-variant font-medium"
                            }
                          >
                            約{effectiveAnnual.value}万円
                            <span className="text-xs text-on-surface-variant ml-1 font-normal">
                              (目安)
                            </span>
                          </span>
                        ) : (
                          <span className="text-on-surface-variant">-</span>
                        )}
                      </td>

                      {/* 年間休日 */}
                      <td className="px-4 py-3.5">
                        {c.annualHolidays != null ? (
                          <span className={isMaxAnnualHolidays ? highlightClass : "text-on-surface font-medium"}>
                            {c.annualHolidays}日
                          </span>
                        ) : (
                          <span className="text-on-surface-variant">-</span>
                        )}
                      </td>

                      {/* みなし残業 */}
                      <td className="px-4 py-3.5 max-w-xs truncate text-on-surface">
                        {c.fixedOvertime || <span className="text-on-surface-variant">-</span>}
                      </td>

                      {/* 住宅手当 */}
                      <td className="px-4 py-3.5 max-w-xs truncate text-on-surface">
                        {c.housingAllowance || <span className="text-on-surface-variant">-</span>}
                      </td>

                      {/* リモート */}
                      <td className="px-4 py-3.5 max-w-xs truncate text-on-surface">
                        {c.remoteWork || <span className="text-on-surface-variant">-</span>}
                      </td>

                      {/* 給与評価★ */}
                      <td className="px-4 py-3.5">
                        {c.ratingSalary > 0 ? (
                          <span className={isMaxRatingSalary ? highlightClass : "text-amber-400 font-medium"}>
                            {"★".repeat(c.ratingSalary)}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant">-</span>
                        )}
                      </td>

                      {/* 福利厚生評価★ */}
                      <td className="px-4 py-3.5">
                        {c.ratingBenefits > 0 ? (
                          <span className={isMaxRatingBenefits ? highlightClass : "text-amber-400 font-medium"}>
                            {"★".repeat(c.ratingBenefits)}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant">-</span>
                        )}
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
