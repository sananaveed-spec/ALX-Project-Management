import { NextResponse } from "next/server";
import { createTimesheetsProject } from "@/lib/timesheets";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
    };

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json(
        { error: "Project name is required for ATS." },
        { status: 400 },
      );
    }

    const project = await createTimesheetsProject({ name });
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create ATS project.";
    const status = message.toLowerCase().includes("not configured")
      ? 503
      : message.toLowerCase().includes("already exists")
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
