import { NextResponse } from "next/server";
import { exchangeBasecampCode } from "@/lib/basecamp";

export const runtime = "nodejs";

/** Prefer public URL — request.url is often http://0.0.0.0:3000 inside Docker. */
function getAppOrigin(request: Request): string {
  const redirectUri = process.env.BASECAMP_REDIRECT_URI?.trim();
  if (redirectUri) {
    try {
      return new URL(redirectUri).origin;
    } catch {
      // fall through
    }
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = (
    request.headers.get("x-forwarded-proto") ?? "https"
  )
    .split(",")[0]
    ?.trim();
  if (forwardedHost) {
    const host = forwardedHost.split(",")[0]?.trim();
    if (host) {
      return `${forwardedProto}://${host}`;
    }
  }

  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getAppOrigin(request);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/?basecamp=error&message=${encodeURIComponent(error)}`, origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/?basecamp=error&message=missing_code", origin),
    );
  }

  try {
    await exchangeBasecampCode(code);
    return NextResponse.redirect(new URL("/?basecamp=connected", origin));
  } catch (exchangeError) {
    const message =
      exchangeError instanceof Error
        ? exchangeError.message
        : "token_exchange_failed";
    return NextResponse.redirect(
      new URL(
        `/?basecamp=error&message=${encodeURIComponent(message)}`,
        origin,
      ),
    );
  }
}
