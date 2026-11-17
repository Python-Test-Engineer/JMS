import crypto from "node:crypto";
import { config } from "../config.js";

export const GOOGLE_STATE_COOKIE = "jms_google_state";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export function googleConfigured() {
  return Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET);
}

export function createGoogleState() {
  return crypto.randomBytes(32).toString("base64url");
}

export function googleStateMatches(expected, received) {
  if (typeof expected !== "string" || typeof received !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function googleCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.COOKIE_SECURE,
    path: "/auth/google",
    maxAge: 10 * 60 * 1000,
  };
}

export function clearGoogleCookieOptions() {
  return { httpOnly: true, sameSite: "lax", secure: config.COOKIE_SECURE, path: "/auth/google" };
}

export function googleAuthorizationUrl(state) {
  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: config.googleRedirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    access_type: "online",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function googleRequest(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: { Accept: "application/json", ...(options?.headers || {}) },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Google request failed with HTTP ${response.status}`);
  return response.json();
}

export async function exchangeGoogleCode(code) {
  return googleRequest(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      redirect_uri: config.googleRedirectUri,
      grant_type: "authorization_code",
    }),
  });
}

export async function fetchGoogleProfile(accessToken) {
  return googleRequest(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function isGoogleAdminEmail(email) {
  return config.googleAdminEmails.includes(String(email || "").toLowerCase());
}
