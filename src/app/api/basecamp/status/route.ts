import { NextResponse } from "next/server";
import { isBasecampConnected } from "@/lib/basecamp";

export const runtime = "nodejs";

export async function GET() {
  try {
    const connected = await isBasecampConnected();
    return NextResponse.json({ connected });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check Basecamp status.";
    return NextResponse.json({ connected: false, error: message }, { status: 500 });
  }
}
