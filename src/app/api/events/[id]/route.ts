import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eventInput, EventInputError } from "@/lib/event-input";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const current = await prisma.scheduleEvent.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "予定が見つかりません。" }, { status: 404 });
    const data = eventInput(body, current);

    const updated = await prisma.scheduleEvent.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, event: updated });
  } catch (error: any) {
    if (error instanceof EventInputError || error instanceof SyntaxError) return NextResponse.json({ error: error instanceof SyntaxError ? "入力内容を確認してください。" : error.message }, { status: 400 });
    console.error("PATCH event error:", error);
    return NextResponse.json(
      { error: "予定の更新に失敗しました。" },
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
    await prisma.scheduleEvent.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "予定を削除しました。" });
  } catch (error: any) {
    console.error("DELETE event error:", error);
    if (error?.code === "P2025") return NextResponse.json({ error: "予定が見つかりません。" }, { status: 404 });
    return NextResponse.json(
      { error: "予定の削除に失敗しました。" },
      { status: 500 }
    );
  }
}
