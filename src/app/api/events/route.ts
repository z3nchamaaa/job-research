import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eventInput, EventInputError } from "@/lib/event-input";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await prisma.scheduleEvent.findMany({
      include: {
        company: {
          select: { id: true, name: true, status: true },
        },
      },
      orderBy: { startAt: "asc" },
    });
    return NextResponse.json({ success: true, events });
  } catch (error: any) {
    console.error("GET events error:", error);
    return NextResponse.json({ error: "イベント一覧の取得に失敗しました。" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = eventInput(body);
    const { companyId, stepId } = body;
    for (const value of [companyId, stepId]) if (value != null && typeof value !== "string") throw new EventInputError("関連する企業・選考を確認してください。");
    if (companyId && !await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } })) throw new EventInputError("関連する企業が見つかりません。");
    if (stepId) {
      const step = await prisma.selectionStep.findUnique({ where: { id: stepId }, select: { companyId: true } });
      if (!step || step.companyId !== companyId) throw new EventInputError("選考と企業の組み合わせを確認してください。");
    }

    const event = await prisma.scheduleEvent.create({
      data: {
        companyId: companyId || null,
        stepId: stepId || null,
        ...data,
        title: data.title!,
        startAt: data.startAt!,
      },
      include: {
        company: { select: { id: true, name: true, status: true } },
      },
    });

    return NextResponse.json({ success: true, event }, { status: 201 });
  } catch (error: any) {
    if (error instanceof EventInputError || error instanceof SyntaxError) return NextResponse.json({ error: error instanceof SyntaxError ? "入力内容を確認してください。" : error.message }, { status: 400 });
    console.error("POST event error:", error);
    return NextResponse.json({ error: "イベントの作成に失敗しました。" }, { status: 500 });
  }
}
