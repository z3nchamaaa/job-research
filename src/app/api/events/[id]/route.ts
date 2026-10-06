import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const allowedFields = [
      "isDone",
      "title",
      "eventType",
      "startAt",
      "endAt",
      "location",
      "memo",
    ];

    const data: Record<string, any> = {};

    for (const field of allowedFields) {
      if (field in body) {
        if (field === "isDone") {
          data[field] = Boolean(body[field]);
        } else if (field === "startAt") {
          data[field] = new Date(body[field]);
        } else if (field === "endAt") {
          data[field] = body[field] ? new Date(body[field]) : null;
        } else {
          data[field] = body[field];
        }
      }
    }

    const updated = await prisma.scheduleEvent.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, event: updated });
  } catch (error: any) {
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
    return NextResponse.json(
      { error: "予定の削除に失敗しました。" },
      { status: 500 }
    );
  }
}
