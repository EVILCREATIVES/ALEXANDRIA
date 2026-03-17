import { NextResponse } from "next/server";
import { put, list } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VisitLog = {
  ip: string;
  country: string;
  city: string;
  region: string;
  path: string;
  userAgent: string;
  timestamp: string;
};

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as VisitLog;

    // Read existing logs
    let logs: VisitLog[] = [];
    try {
      const { blobs } = await list({ prefix: "visitor-logs/" });
      const logBlob = blobs.find(b => b.pathname === "visitor-logs/visits.json");
      if (logBlob) {
        const res = await fetch(logBlob.url);
        if (res.ok) {
          logs = (await res.json()) as VisitLog[];
        }
      }
    } catch {
      // Start fresh if can't read
    }

    // Add new log entry (keep last 1000 entries)
    logs.push(body);
    if (logs.length > 1000) {
      logs = logs.slice(-1000);
    }

    // Save back
    await put("visitor-logs/visits.json", JSON.stringify(logs, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    // Silently fail - don't break the app for logging
    console.error("Log visit error:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// GET endpoint to view logs (simple admin access)
export async function GET(req: Request): Promise<Response> {
  try {
    // Simple secret check via query param
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    
    // Use environment variable or default for dev
    const expectedSecret = process.env.ADMIN_SECRET || "alexandria-admin-2024";
    
    if (secret !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Read logs
    const { blobs } = await list({ prefix: "visitor-logs/" });
    const logBlob = blobs.find(b => b.pathname === "visitor-logs/visits.json");
    
    if (!logBlob) {
      return NextResponse.json({ logs: [], message: "No logs yet" });
    }

    const res = await fetch(logBlob.url);
    if (!res.ok) {
      return NextResponse.json({ logs: [], message: "Could not read logs" });
    }

    const logs = (await res.json()) as VisitLog[];

    // Return with summary
    const uniqueIPs = new Set(logs.map(l => l.ip));
    const byCountry: Record<string, number> = {};
    logs.forEach(l => {
      byCountry[l.country] = (byCountry[l.country] || 0) + 1;
    });

    return NextResponse.json({
      totalVisits: logs.length,
      uniqueVisitors: uniqueIPs.size,
      byCountry,
      recentLogs: logs.slice(-50).reverse() // Last 50, newest first
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
