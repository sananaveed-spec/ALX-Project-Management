import { NextResponse } from "next/server";
import { isTimesheetsConfigured } from "@/lib/timesheets";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ configured: isTimesheetsConfigured() });
}
