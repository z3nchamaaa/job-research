"use client";

import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import MetricCards from "@/components/MetricCards";
import KanbanBoard from "@/components/KanbanBoard";
import TableView from "@/components/TableView";
import ScheduleView from "@/components/ScheduleView";
import CompensationView from "@/components/CompensationView";
import PromptAddCompanyModal from "@/components/PromptAddCompanyModal";
import ManualAddCompanyModal from "@/components/ManualAddCompanyModal";
import CompanyDetailModal from "@/components/CompanyDetailModal";
import CareerProfileModal from "@/components/CareerProfileModal";
import { useCareerProfile } from "@/components/useCareerProfile";
import { CompanyItem, ScheduleEventItem, SelectionStatus } from "@/types";
import { Sparkles, Loader2, Plus, AlertCircle } from "lucide-react";

export default function Home() {
  const [activeView, setActiveView] = useState<"kanban" | "table" | "schedule" | "compensation">("kanban");
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [events, setEvents] = useState<ScheduleEventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // モーダル管理
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const {
    profile: careerProfile,
    loading: profileLoading,
    error: profileError,
    saveProfile,
    retry: retryProfile,
  } = useCareerProfile();

  // 初回起動時の自動オープンを同期setStateではなくderiveで判定
  const firstRun = !profileLoading && !profileError && !careerProfile.completed;
  const isProfileModalActive = firstRun || isEditProfileOpen;

  const handleOpenAiModal = () => {
    if (isProfileModalActive) return;
    if (profileLoading) {
      alert("就活軸を読み込み中です。");
      return;
    }
    if (profileError) {
      alert("就活軸の読み込みに失敗しました。再読み込みをお試しください。");
      return;
    }
    setIsAiModalOpen(true);
  };

  const handleOpenManualModal = () => {
    if (isProfileModalActive) return;
    setIsManualModalOpen(true);
  };

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) || null;

  const fetchData = useCallback(async () => {
    try {
      const [compRes, evRes] = await Promise.all([
        fetch("/api/companies"),
        fetch("/api/events"),
      ]);

      if (compRes.ok) {
        const compJson = await compRes.json();
        setCompanies(compJson.companies || []);
      }
      if (evRes.ok) {
        const evJson = await evRes.json();
        setEvents(evJson.events || []);
      }
    } catch (err) {
      console.error("Fetch data error:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(fetchData);
  }, [fetchData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  const handleStatusChange = async (companyId: string, newStatus: SelectionStatus) => {
    // 楽観的更新
    setCompanies((prev) =>
      prev.map((c) => (c.id === companyId ? { ...c, status: newStatus } : c))
    );

    try {
      await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchData();
    } catch (err) {
      console.error("Status update error:", err);
      fetchData();
    }
  };

  const handleSelectCompany = (company: CompanyItem) => {
    setSelectedCompanyId(company.id);
  };

  // サンプルデータ登録
  const handleSeedDemoData = async () => {
    setIsLoading(true);
    try {
      const demoCompanies = [
        {
          name: "株式会社サイバーエージェント",
          industry: "IT・インターネット",
          jobType: "Webエンジニア",
          priority: 5,
          status: "INTERVIEWING",
          websiteUrl: "https://www.cyberagent.co.jp/",
          myPageUrl: "https://www.cyberagent.co.jp/careers/students/",
          description: "メディア事業、インターネット広告事業、ゲーム事業を展開する総合IT企業。",
          features: "挑戦を歓迎するカルチャー、内定者バイトや若手からの開発裁量権。",
          steps: [
            { stepName: "ES提出 & Webテスト", stepOrder: 1, status: "PASSED" },
            { stepName: "1次技術面接", stepOrder: 2, status: "PASSED" },
            { stepName: "2次面接", stepOrder: 3, status: "PENDING" },
            { stepName: "役員最終面接", stepOrder: 4, status: "PENDING" },
          ],
        },
        {
          name: "株式会社マネーフォワード",
          industry: "Fintech / SaaS",
          jobType: "バックエンドエンジニア",
          priority: 5,
          status: "APPLIED",
          websiteUrl: "https://corp.moneyforward.com/",
          description: "家計簿アプリや法人向けバックオフィスSaaSを提供するFintechの代表的企業。",
          features: "User Focusの徹底、英語公用語化とグローバル開発環境。",
          steps: [
            { stepName: "ES提出 & コーディングテスト", stepOrder: 1, status: "PENDING" },
            { stepName: "1次面接", stepOrder: 2, status: "PENDING" },
            { stepName: "最終面接", stepOrder: 3, status: "PENDING" },
          ],
        },
        {
          name: "トヨタ自動車株式会社",
          industry: "自動車・モビリティ",
          jobType: "ソフトウェアエンジニア",
          priority: 4,
          status: "ES_PASSED",
          websiteUrl: "https://global.toyota/jp/",
          description: "世界最大級の自動車メーカー。モビリティカンパニーへの変革を推進。",
          features: "強固な技術基盤、Arene OSをはじめとする次世代SDV開発。",
          steps: [
            { stepName: "エントリーシート選考", stepOrder: 1, status: "PASSED" },
            { stepName: "適性検査", stepOrder: 2, status: "PASSED" },
            { stepName: "1次面接 (技術統括)", stepOrder: 3, status: "PENDING" },
            { stepName: "最終面接", stepOrder: 4, status: "PENDING" },
          ],
        },
      ];

      for (const comp of demoCompanies) {
        await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(comp),
        });
      }

      await fetchData();
    } catch (e) {
      console.error("Seed error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col font-sans">
      <Header
        activeView={activeView}
        onViewChange={setActiveView}
        onOpenAiModal={handleOpenAiModal}
        onOpenManualModal={handleOpenManualModal}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onOpenProfileModal={() => setIsEditProfileOpen(true)}
        isProfileDisabled={profileLoading || !!profileError || isProfileModalActive}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {profileError && (
          <div className="rounded-xl bg-error-container p-4 text-on-error-container flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm">就活軸の読み込みに失敗しました。</p>
            </div>
            <button
              onClick={retryProfile}
              className="px-4 py-2 bg-on-error-container text-error-container text-sm font-medium rounded-full hover:brightness-110 transition shrink-0"
            >
              再試行
            </button>
          </div>
        )}

        {/* メトリクスサマリー */}
        <MetricCards companies={companies} events={events} />

        {/* コンテンツ本体 */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-on-surface-variant">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-xs font-medium">データを読み込み中...</span>
          </div>
        ) : (companies.length === 0 && (activeView === "kanban" || activeView === "table")) ? (
          /* 初回エンプティステート */
          <div className="rounded-[28px] border border-outline-variant bg-surface-container-lowest p-12 text-center max-w-2xl mx-auto space-y-5 my-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
              <Sparkles className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-on-surface">企業がまだ登録されていません</h3>
              <p className="text-sm text-on-surface-variant mt-1.5 leading-relaxed">
                企業名を入力すると、AIで登録案を作れます。内容を確認してから登録してください。
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={handleOpenManualModal}
                disabled={isProfileModalActive}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-full bg-secondary-container text-on-secondary-container px-6 h-10 text-sm font-medium hover:brightness-95 cursor-pointer transition disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                企業を登録する
              </button>
              <button
                onClick={handleOpenAiModal}
                disabled={isProfileModalActive || profileLoading || !!profileError}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-full bg-primary text-on-primary px-6 h-10 text-sm font-medium hover:shadow-sm hover:brightness-110 cursor-pointer transition disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                AIプロンプトで企業を登録する
              </button>
              <button
                onClick={handleSeedDemoData}
                disabled={isProfileModalActive}
                className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-full border border-outline text-primary px-6 h-10 text-sm font-medium hover:bg-primary/8 cursor-pointer transition disabled:opacity-50"
              >
                サンプルデータを入れて試す
              </button>
            </div>
          </div>
        ) : (
          <div>
            {activeView === "kanban" && (
              <KanbanBoard
                companies={companies}
                onSelectCompany={handleSelectCompany}
                onStatusChange={handleStatusChange}
              />
            )}
            {activeView === "table" && (
              <TableView
                companies={companies}
                onSelectCompany={handleSelectCompany}
                onStatusChange={handleStatusChange}
              />
            )}
            {activeView === "schedule" && (
              <ScheduleView
                events={events}
                companies={companies}
                onEventCreated={fetchData}
                onSelectCompany={handleSelectCompany}
              />
            )}
            {activeView === "compensation" && (
              <CompensationView
                companies={companies}
                onSelectCompany={handleSelectCompany}
              />
            )}
          </div>
        )}
      </main>

      {/* AI企業登録モーダル (プロンプト形式) */}
      <PromptAddCompanyModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        onSuccess={fetchData}
        careerProfile={careerProfile}
      />

      {/* 手動企業登録モーダル */}
      <ManualAddCompanyModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSuccess={fetchData}
      />

      {/* 企業詳細モーダル */}
      <CompanyDetailModal
        key={selectedCompanyId || "none"}
        company={selectedCompany}
        isOpen={!!selectedCompany}
        onClose={() => setSelectedCompanyId(null)}
        onUpdated={fetchData}
      />

      {/* 就活軸登録・編集モーダル */}
      {isProfileModalActive && (
        <CareerProfileModal
          isFirstRun={firstRun}
          onClose={() => setIsEditProfileOpen(false)}
          initialProfile={careerProfile}
          onSave={saveProfile}
        />
      )}
    </div>
  );
}
