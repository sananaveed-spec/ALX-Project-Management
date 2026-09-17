import { NextResponse } from "next/server";
import { exchangeBasecampCode } from "@/lib/basecamp";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/?basecamp=error&message=${encodeURIComponent(error)}`, url.origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/?basecamp=error&message=missing_code", url.origin),
    );
  }

  try {
    await exchangeBasecampCode(code);
    return NextResponse.redirect(new URL("/?basecamp=connected", url.origin));
  } catch (exchangeError) {
    const message =
      exchangeError instanceof Error
        ? exchangeError.message
        : "token_exchange_failed";
    return NextResponse.redirect(
      new URL(
        `/?basecamp=error&message=${encodeURIComponent(message)}`,
        url.origin,
      ),
    );
  }
}
