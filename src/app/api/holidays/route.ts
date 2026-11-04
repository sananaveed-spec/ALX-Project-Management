import { NextResponse } from "next/server";
import { readHolidays, writeHolidays } from "@/lib/data-store";
import { normalizeHoliday, type Holiday } from "@/lib/holidays";

export const runtime = "nodejs";

export async function GET() {
  try {
    const holidays = await readHolidays();
    return NextResponse.json({ holidays });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load holidays.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { holidays?: unknown };
    if (!Array.isArray(body.holidays)) {
      return NextResponse.json(
        { error: "Expected { holidays: Holiday[] }." },
        { status: 400 },
      );
    }

    const holidays = body.holidays
      .filter(
        (item): item is Partial<Holiday> & { id: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { id?: unknown }).id === "string",
      )
      .map(normalizeHoliday);

    const saved = await writeHolidays(holidays);
    return NextResponse.json({ ok: true, holidays: saved });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save holidays.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
