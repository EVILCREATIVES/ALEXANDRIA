import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Only log page visits, not API calls or static assets
  const pathname = request.nextUrl.pathname;
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".") // static files
  ) {
    return NextResponse.next();
  }

  // Get IP address
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip") || "unknown";

  // Get user agent
  const userAgent = request.headers.get("user-agent") || "unknown";

  // Get geo info from Vercel headers (available on Vercel deployment)
  const country = request.headers.get("x-vercel-ip-country") || "unknown";
  const city = request.headers.get("x-vercel-ip-city") || "unknown";
  const region = request.headers.get("x-vercel-ip-country-region") || "unknown";

  // Log to console (visible in Vercel logs)
  console.log(JSON.stringify({
    type: "VISIT",
    timestamp: new Date().toISOString(),
    ip,
    country,
    city,
    region,
    path: pathname,
    userAgent: userAgent.substring(0, 200) // truncate
  }));

  // Also try to save to our logging endpoint (fire and forget)
  try {
    const baseUrl = request.nextUrl.origin;
    fetch(`${baseUrl}/api/log-visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ip,
        country,
        city,
        region,
        path: pathname,
        userAgent: userAgent.substring(0, 200),
        timestamp: new Date().toISOString()
      })
    }).catch(() => {}); // ignore errors
  } catch {
    // ignore
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files and api
    "/((?!_next/static|_next/image|favicon.ico).*)"
  ]
};
