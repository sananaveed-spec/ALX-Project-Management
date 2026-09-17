import { NextResponse } from "next/server";
import { createBasecampProject } from "@/lib/basecamp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      description?: string;
    };

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json(
        { error: "Project name is required for Basecamp." },
        { status: 400 },
      );
    }

    const project = await createBasecampProject({
      name,
      description: body.description?.trim() || undefined,
    });

    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create Basecamp project.";
    const status = message.toLowerCase().includes("not connected") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
