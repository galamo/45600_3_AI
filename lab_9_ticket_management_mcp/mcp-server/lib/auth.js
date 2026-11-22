/**
 * User auth for the Ticket MCP server.
 * Users and roles are hardcoded; passwords and the JWT secret come from .env.
 */
import jwt from "jsonwebtoken";
import { createHash, timingSafeEqual } from "node:crypto";

export const ROLES = { ADMIN: "admin", VIEWER: "viewer" };

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

export function signToken({ username, role }) {
  return jwt.sign({ role }, jwtSecret(), {
    subject: username,
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
    algorithm: "HS256",
  });
}

/** Returns { username, role } for a valid token, otherwise null. */
export function verifyToken(token) {
  console.log("token", token);
  console.log("verify token!±!!!!!!")
  console.log("verify token!±!!!!!!")
  console.log("verify token!±!!!!!!")
  console.log("verify token!±!!!!!!")
  if (!token) return null;
  try {
    const payload = jwt.verify(token, jwtSecret(), { algorithms: ["HS256"] });
    console.log("payload", payload);
    if (!Object.values(ROLES).includes(payload.role)) return null;
    console.log("payload.sub", payload.sub);
    console.log("payload.role", payload.role);
    return { username: payload.sub, role: payload.role };
  } catch(ex) {
    console.log("error", ex);
    return null;
  }
}
