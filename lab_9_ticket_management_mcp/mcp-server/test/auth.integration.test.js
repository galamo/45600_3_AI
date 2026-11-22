/**
 * Integration tests for authentication on the Ticket MCP server.
 * Spawns the real server (index.js) on a free port with test credentials,
 * then exercises POST /auth and the JWT gate on POST /mcp over HTTP.
 *
 * Run: npm test
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { signToken, verifyToken } from "../lib/auth.js";

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TEST_ENV = {
  JWT_SECRET: "integration-test-secret",
  JWT_EXPIRES_IN: "5m",
  GALAMO_PASSWORD: "test-galamo-pw",
  ROMANB_PASSWORD: "test-romanb-pw",
};

let serverProcess;
let baseUrl;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["index.js"], {
      cwd: SERVER_DIR,
      env: { ...process.env, ...TEST_ENV, MCP_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start within 10s. Output:\n${output}`));
    }, 10_000);
    const onData = (chunk) => {
      output += chunk;
      if (output.includes(`localhost:${port}`)) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited early with code ${code}. Output:\n${output}`));
    });
  });
}

async function login(username, password) {
  const res = await fetch(`${baseUrl}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return { status: res.status, body: await res.json() };
}

/** Reads a JSON-RPC response that may arrive as plain JSON or as an SSE stream. */
async function readRpc(res) {
  const text = await res.text();
  if ((res.headers.get("content-type") || "").includes("text/event-stream")) {
    const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
    return JSON.parse(dataLine.slice("data:".length));
  }
  return JSON.parse(text);
}

async function mcpPost(body, { authorization, sessionId } = {}) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (authorization) headers.Authorization = authorization;
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await fetch(`${baseUrl}/mcp`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, sessionId: res.headers.get("mcp-session-id"), body: await readRpc(res) };
}

const initializeRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "auth-integration-test", version: "1.0.0" },
  },
};

/** Opens an MCP session with the given Authorization header and returns the tool names exposed to it. */
async function listToolNames(authorization) {
  const init = await mcpPost(initializeRequest, { authorization });
  assert.equal(init.status, 200, `initialize failed: ${JSON.stringify(init.body)}`);
  assert.ok(init.sessionId, "initialize should return an mcp-session-id header");

  await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "mcp-session-id": init.sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });

  const list = await mcpPost({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { sessionId: init.sessionId });
  assert.equal(list.status, 200);
  return list.body.result.tools.map((t) => t.name).sort();
}

before(async () => {
  const port = await freePort();
  baseUrl = `http://localhost:${port}`;
  serverProcess = await startServer(port);
});

after(() => {
  serverProcess?.removeAllListeners("exit");
  serverProcess?.kill();
});

describe("POST /auth", () => {
  test("admin user gets a signed JWT with role admin", async () => {
    const { status, body } = await login("galamo", TEST_ENV.GALAMO_PASSWORD);
    assert.equal(status, 200);
    assert.equal(body.role, "admin");

    const payload = jwt.verify(body.token, TEST_ENV.JWT_SECRET, { algorithms: ["HS256"] });
    assert.equal(payload.sub, "galamo");
    assert.equal(payload.role, "admin");
    assert.ok(payload.exp > payload.iat, "token should have an expiry");
  });

  test("viewer user gets a signed JWT with role viewer", async () => {
    const { status, body } = await login("romanb", TEST_ENV.ROMANB_PASSWORD);
    assert.equal(status, 200);
    assert.equal(body.role, "viewer");

    const payload = jwt.verify(body.token, TEST_ENV.JWT_SECRET, { algorithms: ["HS256"] });
    assert.equal(payload.sub, "romanb");
    assert.equal(payload.role, "viewer");
  });

  test("wrong password is rejected with 401", async () => {
    const { status, body } = await login("galamo", "wrong-password");
    assert.equal(status, 401);
    assert.deepEqual(body, { error: "Access denied" });
  });

  test("unknown user is rejected with 401", async () => {
    const { status } = await login("nobody", "whatever");
    assert.equal(status, 401);
  });

  test("another user's password does not work", async () => {
    const { status } = await login("galamo", TEST_ENV.ROMANB_PASSWORD);
    assert.equal(status, 401);
  });

  test("missing credentials are rejected with 401", async () => {
    const res = await fetch(`${baseUrl}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(res.status, 401);
  });

  test("non-string password is rejected with 401", async () => {
    const res = await fetch(`${baseUrl}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "galamo", password: 12345 }),
    });
    assert.equal(res.status, 401);
  });
});

describe("POST /mcp authorization", () => {
  test("request without Authorization header is rejected with 401", async () => {
    const { status, body } = await mcpPost(initializeRequest);
    assert.equal(status, 401);
    assert.equal(body.error.code, -32001);
  });

  test("malformed Authorization header is rejected with 401", async () => {
    const { status } = await mcpPost(initializeRequest, { authorization: "Basic Z2FsYW1vOnB3" });
    assert.equal(status, 401);
  });

  test("truncated token (bad signature) is rejected with 401", async () => {
    const { body } = await login("galamo", TEST_ENV.GALAMO_PASSWORD);
    const truncated = body.token.slice(0, -19);
    const { status } = await mcpPost(initializeRequest, { authorization: `Bearer ${truncated}` });
    assert.equal(status, 401);
  });

  test("token signed with a different secret is rejected with 401", async () => {
    const forged = jwt.sign({ role: "admin" }, "not-the-server-secret", { subject: "galamo", algorithm: "HS256" });
    const { status } = await mcpPost(initializeRequest, { authorization: `Bearer ${forged}` });
    assert.equal(status, 401);
  });

  test("expired token is rejected with 401", async () => {
    const expired = jwt.sign({ role: "admin", exp: Math.floor(Date.now() / 1000) - 60 }, TEST_ENV.JWT_SECRET, {
      subject: "galamo",
      algorithm: "HS256",
    });
    const { status } = await mcpPost(initializeRequest, { authorization: `Bearer ${expired}` });
    assert.equal(status, 401);
  });

  test("unsigned token (alg none) is rejected with 401", async () => {
    const unsigned = jwt.sign({ role: "admin" }, null, { subject: "galamo", algorithm: "none" });
    const { status } = await mcpPost(initializeRequest, { authorization: `Bearer ${unsigned}` });
    assert.equal(status, 401);
  });

  test("validly signed token with an unknown role is rejected with 401", async () => {
    const token = jwt.sign({ role: "superuser" }, TEST_ENV.JWT_SECRET, { subject: "galamo", algorithm: "HS256" });
    const { status } = await mcpPost(initializeRequest, { authorization: `Bearer ${token}` });
    assert.equal(status, 401);
  });

  test("admin token via 'Bearer' header exposes read and write tools", async () => {
    const { body } = await login("galamo", TEST_ENV.GALAMO_PASSWORD);
    const tools = await listToolNames(`Bearer ${body.token}`);
    assert.deepEqual(tools, [
      "change_ticket_status",
      "close_ticket",
      "create_ticket",
      "delete_ticket",
      "get_ticket",
      "get_users",
    ]);
  });

  test("admin token via 'token:' header is also accepted", async () => {
    const { body } = await login("galamo", TEST_ENV.GALAMO_PASSWORD);
    const tools = await listToolNames(`token:${body.token}`);
    assert.ok(tools.includes("create_ticket"));
  });

  test("viewer token exposes only read tools", async () => {
    const { body } = await login("romanb", TEST_ENV.ROMANB_PASSWORD);
    const tools = await listToolNames(`Bearer ${body.token}`);
    assert.deepEqual(tools, ["get_ticket", "get_users"]);
  });
});

describe("dev token", () => {
  before(() => {
    const devEnv = dotenv.parse(readFileSync(path.join(SERVER_DIR, ".env")));
    process.env.JWT_SECRET = devEnv.JWT_SECRET;
    process.env.JWT_EXPIRES_IN = "1h";
  });

  for (const user of [
    { username: "galamo", role: "admin" },
    { username: "romanb", role: "viewer" },
  ]) {
    test(`prints a 1-hour ${user.role} JWT signed with the .env secret`, (t) => {
      const token = signToken(user);
      assert.deepEqual(verifyToken(token), user);

      const { exp } = jwt.decode(token);
      t.diagnostic(`${user.role} (${user.username}) valid until ${new Date(exp * 1000).toISOString()}`);
      t.diagnostic(`Authorization: Bearer ${token}`);
    });
  }
});
