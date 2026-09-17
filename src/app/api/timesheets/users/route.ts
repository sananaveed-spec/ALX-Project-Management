import { NextResponse } from "next/server";
import {
  isTimesheetsConfigured,
  listActiveTimesheetsUsers,
} from "@/lib/timesheets";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (!isTimesheetsConfigured()) {
      return NextResponse.json(
        {
          error:
            "ATS / Timesheets is not configured. Set TIMESHEETS_API_TOKEN and TIMESHEETS_ORGANIZATION_ID.",
          users: [],
        },
        { status: 503 },
      );
    }

    const users = await listActiveTimesheetsUsers();
    return NextResponse.json({ users });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load ATS users.";
    return NextResponse.json({ error: message, users: [] }, { status: 500 });
  }
}
