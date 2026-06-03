import type { Request, Response } from "express";
import { env } from "../../config/index.js";
import { findOrCreateOAuthUser } from "./auth.service.js";

// ─── GOOGLE ─────────────────────────────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export function googleRedirect(_req: Request, res: Response): void {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
  });

  res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
}

export async function googleCallback(req: Request, res: Response): Promise<void> {
  const code = req.query["code"] as string | undefined;

  if (!code) {
    res.redirect(`${env.CLIENT_URL}/auth/error?message=missing_code`);
    return;
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokens = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
    };

    if (!tokens.access_token) {
      res.redirect(`${env.CLIENT_URL}/auth/error?message=token_exchange_failed`);
      return;
    }

    // Get user info from Google
    const userRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const googleUser = (await userRes.json()) as {
      id: string;
      email: string;
      name: string;
      picture?: string;
    };

    // Find or create user in our DB
    const { token } = await findOrCreateOAuthUser({
      email: googleUser.email,
      fullName: googleUser.name,
      avatarUrl: googleUser.picture,
      provider: "GOOGLE",
      providerId: googleUser.id,
    });

    // Redirect to client with token
    res.redirect(`${env.CLIENT_URL}/auth/callback?token=${token}`);
  } catch {
    res.redirect(`${env.CLIENT_URL}/auth/error?message=oauth_failed`);
  }
}
