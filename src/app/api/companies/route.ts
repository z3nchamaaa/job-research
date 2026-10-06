import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const companies = await prisma.company.findMany({
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
        },
        interviews: {
          orderBy: { createdAt: "desc" },
        },
        events: {
          orderBy: { startAt: "asc" },
        },
      },
      orderBy: [
        { priority: "desc" },
        { updatedAt: "desc" },
      ],
    });

    return NextResponse.json({ success: true, companies });
  } catch (error: any) {
    console.error("GET companies error:", error);
    return NextResponse.json(
      { error: "企業一覧の取得に失敗しました。" },
      { status: 500 }
    );
  }
}

function parseNumeric(val: any, isFloat = false): number | null {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  if (Number.isNaN(num)) return null;
  return isFloat ? num : Math.round(num);
}

function parseString(val: any): string | null {
  if (val === null || val === undefined || val === "") return null;
  return String(val);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      name,
      industry,
      jobType,
      priority = 3,
      status = "APPLIED",
      isEarlySelection,
      websiteUrl,
      myPageUrl,
      myPageId,
      myPagePassword,
      description,
      features,
      location,
      salary,
      benefits,
      ratingSalary = 0,
      ratingBenefits = 0,
      startingSalary,
      bonusTimes,
      bonusMonths,
      annualIncome,
      annualHolidays,
      fixedOvertime,
      housingAllowance,
      remoteWork,
      memo,
      aiExtractedJson,
      steps = [],
    } = body;

    if (!name || name.trim() === "") {
      return NextResponse.json(
        { error: "企業名は必須です。" },
        { status: 400 }
      );
    }

    const company = await prisma.company.create({
      data: {
        name,
        industry,
        jobType,
        priority: Number(priority) || 3,
        status,
        isEarlySelection: Boolean(isEarlySelection),
        websiteUrl,
        myPageUrl,
        myPageId,
        myPagePassword,
        description,
        features,
        location,
        salary,
        benefits,
        ratingSalary: Number(ratingSalary) || 0,
        ratingBenefits: Number(ratingBenefits) || 0,
        startingSalary: parseNumeric(startingSalary),
        bonusTimes: parseNumeric(bonusTimes),
        bonusMonths: parseNumeric(bonusMonths, true),
        annualIncome: parseNumeric(annualIncome),
        annualHolidays: parseNumeric(annualHolidays),
        fixedOvertime: parseString(fixedOvertime),
        housingAllowance: parseString(housingAllowance),
        remoteWork: parseString(remoteWork),
        memo,
        aiExtractedJson: aiExtractedJson
          ? typeof aiExtractedJson === "string"
            ? aiExtractedJson
            : JSON.stringify(aiExtractedJson)
          : null,
        steps: {
          create: steps.map((s: any, idx: number) => ({
            stepName: s.stepName,
            stepOrder: s.stepOrder ?? idx + 1,
            status: s.status || "PENDING",
            dueDate: s.dueDate ? new Date(s.dueDate) : null,
            location: s.location || null,
            memo: s.memo || null,
          })),
        },
      },
      include: {
        steps: true,
      },
    });

    return NextResponse.json({ success: true, company }, { status: 201 });
  } catch (error: any) {
    console.error("POST company error:", error);
    return NextResponse.json(
      { error: error?.message || "企業の作成に失敗しました。" },
      { status: 500 }
    );
  }
}
