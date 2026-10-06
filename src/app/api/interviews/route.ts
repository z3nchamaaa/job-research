import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { companyId, stepName, interviewDate, interviewer, questions, answers, feedback, nextAction } = body;

    if (!companyId || !stepName) {
      return NextResponse.json({ error: "企業IDと面接フェーズ名は必須です。" }, { status: 400 });
    }

    const note = await prisma.interviewNote.create({
      data: {
        companyId,
        stepName,
        interviewDate: interviewDate ? new Date(interviewDate) : new Date(),
        interviewer,
        questions,
        answers,
        feedback,
        nextAction,
      },
    });

    return NextResponse.json({ success: true, note }, { status: 201 });
  } catch (error: any) {
    console.error("POST interview note error:", error);
    return NextResponse.json(
      { error: "面接記録の作成に失敗しました。" },
      { status: 500 }
    );
  }
}
