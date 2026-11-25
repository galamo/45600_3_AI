import assert from "node:assert/strict";
import fs from "node:fs";
import { chunkHtml, chunkSchema } from "../src/lib/chunking.js";
import { sanitizeMermaid } from "../src/agents/diagram.agent.js";

describe("chunking", () => {
  it("splits schema.sql per table and removes restricted columns", () => {
    const chunks = chunkSchema(fs.readFileSync(new URL("../../schema.sql", import.meta.url), "utf8"));
    assert.deepEqual(
      chunks.map((c) => c.metadata.table),
      ["users", "permissions", "users_permissions", "audit_login", "resource", "resource_booking"]
    );
    const all = chunks.map((c) => c.content).join("\n");
    assert.doesNotMatch(all, /password_hash|ip_address|user_agent/);
    assert.match(all, /users_permissions\.user_id → users\.id/);
  });

  it("splits HTML by <h2> section", () => {
    const html = "<html><head><title>FAQ</title></head><body><h1>x</h1><h2>What is SSO?</h2><p>Single sign-on lets users log in once.</p><h2>Login</h2><p>Users authenticate via the identity provider.</p></body></html>";
    const chunks = chunkHtml(html, "faq.html");
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0]!.metadata.heading, "What is SSO?");
  });
});

describe("diagram sanitizer", () => {
  it("removes init directives, click handlers and fences", () => {
    const out = sanitizeMermaid("```mermaid\n%%{init: {'securityLevel':'loose'}}%%\nflowchart TD\nA-->B\nclick A \"javascript:alert(1)\"\n```");
    assert.equal(out, "flowchart TD\nA-->B");
  });
});
