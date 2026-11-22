/**
 * Local JSON store for API-key metadata (Lab 9).
 * Persists to backend/data/api-keys.json — never stores the raw JWT after mint.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { signToken, TOKEN_TYPES } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const KEYS_FILE = path.join(DATA_DIR, "api-keys.json");

export class ValidationError extends Error {}
export class NotFoundError extends Error {}

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
    return Array.isArray(data.keys) ? data : { keys: [] };
  } catch {
    return { keys: [] };
  }
}

function persist(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
}

let store = load();

/** Whether an api_key jti is still registered (not revoked / never minted). */
export function isApiKeyActive(jti) {
  if (!jti) return false;
  return store.keys.some((k) => k.id === jti);
}

/**
 * Mint an API-key JWT and append metadata only (no raw token on disk).
 * Returns { token, id, label, username, role, createdAt, expiresAt }.
 */
export function createApiKey({ username, role, label }) {
  if (typeof username !== "string" || !username.trim()) {
    throw new ValidationError('"username" is required');
  }
  if (typeof role !== "string" || !role.trim()) {
    throw new ValidationError('"role" is required');
  }

  const id = randomUUID();
  const token = signToken({
    username: username.trim(),
    role: role.trim(),
    typ: TOKEN_TYPES.API_KEY,
    jti: id,
  });

  const decoded = jwt.decode(token);
  const createdAt = new Date().toISOString();
  const expiresAt =
    decoded?.exp != null
      ? new Date(decoded.exp * 1000).toISOString()
      : null;

  const meta = {
    id,
    label: typeof label === "string" && label.trim() ? label.trim() : "API key",
    username: username.trim(),
    role: role.trim(),
    createdAt,
    expiresAt,
  };

  store.keys.push(meta);
  persist(store);

  return { token, ...meta };
}

/** List API-key metadata for a username (no raw JWTs). */
export function listApiKeys(username) {
  if (typeof username !== "string" || !username.trim()) {
    throw new ValidationError('"username" is required');
  }
  return store.keys.filter((k) => k.username === username.trim());
}

/**
 * Revoke an API key by dropping its metadata from the file.
 * Only the owning username may revoke.
 */
export function revokeApiKey(jti, username) {
  if (typeof jti !== "string" || !jti.trim()) {
    throw new ValidationError('"jti" is required');
  }
  if (typeof username !== "string" || !username.trim()) {
    throw new ValidationError('"username" is required');
  }

  const idx = store.keys.findIndex(
    (k) => k.id === jti.trim() && k.username === username.trim()
  );
  if (idx === -1) {
    throw new NotFoundError(`API key ${jti} not found`);
  }

  const [removed] = store.keys.splice(idx, 1);
  persist(store);
  return removed;
}
