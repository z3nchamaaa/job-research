import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const data: Record<string, any> = {};

    if ("stepName" in body) data.stepName = body.stepName;
    if ("stepOrder" in body) data.stepOrder = Number(body.stepOrder);
    if ("status" in body) data.status = body.status;
    if ("location" in body) data.location = body.location;
    if ("memo" in body) data.memo = body.memo;

    if ("dueDate" in body) {
      if (body.dueDate === null || body.dueDate === "") {
        data.dueDate = null;
      } else {
        data.dueDate = new Date(body.dueDate);
      }
    }

    const updated = await prisma.selectionStep.update({
      where: { id },
      data,
    });

    return NextResponse.json({ success: true, step: updated });
  } catch (error: any) {
    console.error("PATCH step error:", error);
    return NextResponse.json(
      { error: "ステップの更新に失敗しました。" },
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
    await prisma.selectionStep.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "ステップを削除しました。" });
  } catch (error: any) {
    console.error("DELETE step error:", error);
    return NextResponse.json(
      { error: "ステップの削除に失敗しました。" },
      { status: 500 }
    );
  }
}
