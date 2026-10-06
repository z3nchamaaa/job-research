import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { stepOrder: "asc" },
        },
        interviews: {
          orderBy: { interviewDate: "desc" },
        },
        events: {
          orderBy: { startAt: "asc" },
        },
      },
    });

    if (!company) {
      return NextResponse.json({ error: "企業が見つかりません。" }, { status: 404 });
    }

    return NextResponse.json({ success: true, company });
  } catch (error: any) {
    console.error("GET company detail error:", error);
    return NextResponse.json(
      { error: "企業詳細の取得に失敗しました。" },
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const allowedFields = [
      "name",
      "industry",
      "jobType",
      "priority",
      "status",
      "isEarlySelection",
      "websiteUrl",
      "myPageUrl",
      "myPageId",
      "myPagePassword",
      "description",
      "features",
      "location",
      "salary",
      "benefits",
      "ratingSalary",
      "ratingBenefits",
      "memo",
      "startingSalary",
      "bonusTimes",
      "bonusMonths",
      "annualIncome",
      "annualHolidays",
      "fixedOvertime",
      "housingAllowance",
      "remoteWork",
    ];

    const data: Record<string, any> = {};

    for (const field of allowedFields) {
      if (field in body) {
        if (field === "isEarlySelection") {
          data[field] = Boolean(body[field]);
        } else if (field === "priority" || field === "ratingSalary" || field === "ratingBenefits") {
          data[field] = Number(body[field]);
        } else if (
          field === "startingSalary" ||
          field === "bonusTimes" ||
          field === "annualIncome" ||
          field === "annualHolidays"
        ) {
          data[field] = parseNumeric(body[field]);
        } else if (field === "bonusMonths") {
          data[field] = parseNumeric(body[field], true);
        } else if (
          field === "fixedOvertime" ||
          field === "housingAllowance" ||
          field === "remoteWork"
        ) {
          data[field] = parseString(body[field]);
        } else {
          data[field] = body[field];
        }
      }
    }

    const updated = await prisma.company.update({
      where: { id },
      data,
      include: {
        steps: true,
      },
    });

    return NextResponse.json({ success: true, company: updated });
  } catch (error: any) {
    console.error("PATCH company error:", error);
    return NextResponse.json(
      { error: error?.message || "企業の更新に失敗しました。" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.company.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "削除しました。" });
  } catch (error: any) {
    console.error("DELETE company error:", error);
    return NextResponse.json(
      { error: "企業の削除に失敗しました。" },
      { status: 500 }
    );
  }
}
