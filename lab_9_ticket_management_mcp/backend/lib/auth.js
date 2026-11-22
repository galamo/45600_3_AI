/**
 * Backend-owned JWT auth (Lab 9).
 * Users/roles are hardcoded; passwords and JWT settings come from .env.
 */
import jwt from "jsonwebtoken";
import { createHash, timingSafeEqual } from "node:crypto";
import { isApiKeyActive } from "./api-keys.js";

export const ROLES = { ADMIN: "admin", VIEWER: "viewer" };

export const TOKEN_TYPES = { SESSION: "session", API_KEY: "api_key" };

const USERS = [
  { username: "galamo", role: ROLES.ADMIN, passwordEnv: "GALAMO_PASSWORD" },
  { username: "romanb", role: ROLES.VIEWER, passwordEnv: "ROMANB_PASSWORD" },
];

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set in .env");
  return secret;
}

function safeEqual(a, b) {
  const hash = (s) => createHash("sha256").update(String(s)).digest();
  return timingSafeEqual(hash(a), hash(b));
}

/** Returns the user ({ username, role }) when the credentials match, otherwise null. */
export function authenticate(username, password) {
  const user = USERS.find((u) => u.username === username);
  const expected = user && process.env[user.passwordEnv];
  if (!expected || typeof password !== "string" || !safeEqual(password, expected)) return null;
  return { username: user.username, role: user.role };
}

/**
 * Sign a JWT.
 * - session (default): short-lived, claims { role, typ: "session" }
 * - api_key: long-lived, claims { role, typ: "api_key", jti } (jti required)
 */
export function signToken({ username, role, typ = TOKEN_TYPES.SESSION, jti }) {
  if (typ === TOKEN_TYPES.API_KEY && !jti) {
    throw new Error("jti is required for api_key tokens");
  }

  const expiresIn =
    typ === TOKEN_TYPES.API_KEY
      ? process.env.API_KEY_EXPIRES_IN || "30d"
      : process.env.JWT_EXPIRES_IN || "1h";

  const payload = { role, typ };
  if (typ === TOKEN_TYPES.API_KEY) payload.jti = jti;

  return jwt.sign(payload, jwtSecret(), {
    subject: username,
    expiresIn,
    algorithm: "HS256",
  });
}

/**
 * Returns { username, role, typ, jti? } for a valid token, otherwise null.
 * Rejects api_key tokens whose jti is missing from api-keys.json (revoked / unknown).
 */
export function verifyToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, jwtSecret(), { algorithms: ["HS256"] });
    if (!Object.values(ROLES).includes(payload.role)) return null;

    const typ = payload.typ;
    if (typ !== TOKEN_TYPES.SESSION && typ !== TOKEN_TYPES.API_KEY) return null;
    if (typ === TOKEN_TYPES.API_KEY) {
      if (!payload.jti || !isApiKeyActive(payload.jti)) return null;
    }

    return {
      username: payload.sub,
      role: payload.role,
      typ,
      ...(payload.jti ? { jti: payload.jti } : {}),
    };
  } catch {
    return null;
  }
}

