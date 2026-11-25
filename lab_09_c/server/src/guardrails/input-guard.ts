/**
 * Input guardrail — runs BEFORE any LLM sees the message (cheap, deterministic, testable).
 *
 * It is intentionally conservative and pattern based: it catches the obvious attacks and
 * out-of-policy requests early. It is NOT the only defense — tools enforce their own rules
 * (sql-guard, DB grants), because prompt-level filters can always be paraphrased around.
 */
import type { GuardVerdict } from "../types.js";

const INJECTION: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|earlier|all|your|system)\b.{0,20}\b(instructions?|rules?|prompts?|guidelines?)/i,
  /\b(reveal|show|print|repeat|output|leak|dump)\b.{0,40}\b(system|hidden|initial|developer)\s*(prompt|message|instructions?)/i,
  /\byou are (now|no longer)\b/i,
  /\b(jailbreak|DAN mode|developer mode)\b/i,
  /<\/?(system|assistant|tool)>/i,
];

const DATA_MODIFICATION =
  // ("create" is deliberately absent: "create a diagram of users" is a legit request)
  /\b(drop|delete|truncate|update|insert|alter|grant|revoke|remove|deactivate)\b.{0,40}\b(tables?|users?|rows?|records?|database|db|permissions?|bookings?|schema|roles?)\b/i;

const SENSITIVE =
  /\b(password[\s_-]?hash(es)?|passwords?|api[\s_-]?keys?|secrets?|credentials?|ip[\s_-]?address(es)?|user[\s_-]?agents?)\b/i;

/** Normalise: Unicode NFKC (defeats look-alike chars), strip control/zero-width chars. */
export function normalizeInput(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏⁠﻿]/g, "")
    .trim();
}

export function checkInput(text: string, maxChars: number): GuardVerdict {
  if (!text) return { allowed: false, category: "empty", reason: "Please type a question." };
  if (text.length > maxChars) {
    return { allowed: false, category: "too_long", reason: `Questions are limited to ${maxChars} characters.` };
  }
  if (INJECTION.some((re) => re.test(text))) {
    return {
      allowed: false,
      category: "prompt_injection",
      reason: "That looks like an attempt to change my instructions. I can only answer questions about the SSO docs, the data, or draw diagrams.",
    };
  }
  if (DATA_MODIFICATION.test(text)) {
    return {
      allowed: false,
      category: "data_modification",
      reason: "I have read-only access. I can look data up, but I can't create, change or delete anything.",
    };
  }
  if (SENSITIVE.test(text) && !/\bhow (does|do)\b|\bwhat is\b/i.test(text)) {
    return {
      allowed: false,
      category: "sensitive_data",
      reason: "Credentials and network identifiers (passwords, hashes, IPs, user agents, keys) are restricted and never shared.",
    };
  }
  return { allowed: true };
}
