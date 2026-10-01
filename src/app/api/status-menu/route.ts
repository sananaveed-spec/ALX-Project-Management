import { NextResponse } from "next/server";
import { readStatusMenu, writeStatusMenu } from "@/lib/data-store";
import {
  normalizeStatusMenu,
  type StatusMenuEntry,
} from "@/lib/project-status-menu";

export const runtime = "nodejs";

export async function GET() {
  try {
    const statusMenu = await readStatusMenu();
    return NextResponse.json({ statusMenu });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load status menu.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { statusMenu?: unknown };
    if (!Array.isArray(body.statusMenu)) {
      return NextResponse.json(
        { error: "Expected { statusMenu: StatusMenuEntry[] }." },
        { status: 400 },
      );
    }

    const statusMenu = normalizeStatusMenu(body.statusMenu as StatusMenuEntry[]);
    await writeStatusMenu(statusMenu);
    return NextResponse.json({ ok: true, statusMenu });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save status menu.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
