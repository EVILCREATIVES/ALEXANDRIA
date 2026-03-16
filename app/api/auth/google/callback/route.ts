import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

/**
 * Google OAuth callback — exchanges the authorization code for tokens
 * and stores them in a cookie so the export-to-gdocs route can use them.
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

  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;
  const redirectUri = `${baseUrl}/api/auth/google/callback`;

  const code = req.nextUrl.searchParams.get("code");
  const returnTo = req.nextUrl.searchParams.get("state") || "/extraction";

  if (!code) {
    return NextResponse.redirect(`${baseUrl}${returnTo}?error=no_code`);
  }

  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    // Store tokens in an httpOnly cookie (encrypted in production via HTTPS)
    const tokenData = JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });

    // Return a self-closing page instead of redirecting — the main page polls for auth status
    const html = `<!DOCTYPE html><html><body><script>window.close();</script><p>Authenticated! You can close this tab.</p></body></html>`;
    const response = new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });

    response.cookies.set("google_tokens", tokenData, {
      httpOnly: true,
      secure: !host.startsWith("localhost"),
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    const html = `<!DOCTYPE html><html><body><p>Authentication failed. You can close this tab and try again.</p></body></html>`;
    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }
}
