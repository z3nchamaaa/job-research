import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
    const { companyId, stepId, title, eventType, startAt, endAt, location, memo } = body;

    if (!title || !startAt) {
      return NextResponse.json({ error: "タイトルと開始日時は必須です。" }, { status: 400 });
    }

    const event = await prisma.scheduleEvent.create({
      data: {
        companyId: companyId || null,
        stepId: stepId || null,
        title,
        eventType: eventType || "INTERVIEW",
        startAt: new Date(startAt),
        endAt: endAt ? new Date(endAt) : null,
        location,
        memo,
      },
      include: {
        company: true,
      },
    });

    return NextResponse.json({ success: true, event }, { status: 201 });
  } catch (error: any) {
    console.error("POST event error:", error);
    return NextResponse.json({ error: "イベントの作成に失敗しました。" }, { status: 500 });
  }
}
