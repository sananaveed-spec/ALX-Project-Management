import { NextResponse } from "next/server";
import { getBasecampAuthorizeUrl } from "@/lib/basecamp";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.redirect(getBasecampAuthorizeUrl());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Basecamp auth is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
