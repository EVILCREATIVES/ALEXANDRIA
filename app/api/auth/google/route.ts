import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

/**
 * Initiate Google OAuth flow — redirects user to Google's consent screen.
 * After consent, Google redirects back to /api/auth/google/callback
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured" },
      { status: 500 }
    );
  }

  // Determine base URL for callback
  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const scopes = [
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
  ];

  // Pass through any state (e.g. the page to return to after auth)
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/extraction";

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    state: returnTo,
  });

  return NextResponse.redirect(authUrl);
}
