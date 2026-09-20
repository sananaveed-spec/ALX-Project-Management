import { NextResponse } from "next/server";
import { readCustomers, writeCustomers } from "@/lib/data-store";
import { normalizeCustomer, type CustomerEntry } from "@/lib/customers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const customers = await readCustomers();
    return NextResponse.json({ customers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load customers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { customers?: unknown };
    if (!Array.isArray(body.customers)) {
      return NextResponse.json(
        { error: "Expected { customers: CustomerEntry[] }." },
        { status: 400 },
      );
    }

    const customers = body.customers
      .filter(
        (item): item is Partial<CustomerEntry> & { id: string } =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { id?: unknown }).id === "string",
      )
      .map(normalizeCustomer);

    await writeCustomers(customers);
    return NextResponse.json({ ok: true, customers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save customers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
