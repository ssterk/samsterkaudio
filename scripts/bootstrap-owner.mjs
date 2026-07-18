#!/usr/bin/env node
// Creates the owner account directly in D1, bypassing the API entirely.
// There's no public sign-up endpoint (emailAndPassword.disableSignUp: true
// in worker/src/auth.ts) — listeners only ever arrive via invite links, and
// the owner is meant to be a single, deliberately-created account. This is
// the one-time way to create that first login.
//
// Usage:
//   node scripts/bootstrap-owner.mjs <email> <password> [name] [--remote]
//
// Defaults to the local D1 (matches `wrangler dev`); pass --remote to write
// to the live database instead.

import { hashPassword } from "better-auth/crypto";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const [, , email, password, maybeName, ...rest] = process.argv;
const remote = rest.includes("--remote") || maybeName === "--remote";
const name = maybeName && maybeName !== "--remote" ? maybeName : email?.split("@")[0];

if (!email || !password) {
  console.error("Usage: node scripts/bootstrap-owner.mjs <email> <password> [name] [--remote]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const hash = await hashPassword(password);
const userId = randomUUID();
const accountId = randomUUID();
const now = Date.now();

const sql = `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role)
VALUES ('${userId}', '${name.replace(/'/g, "''")}', '${email.replace(/'/g, "''")}', 1, ${now}, ${now}, 'owner');

INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
VALUES ('${accountId}', '${userId}', 'credential', '${userId}', '${hash}', ${now}, ${now});
`.trim();

const args = [
  "wrangler",
  "d1",
  "execute",
  "pressing",
  remote ? "--remote" : "--local",
  "--command",
  sql,
];

console.log(`Creating owner account for ${email} (${remote ? "remote" : "local"})...`);
execFileSync("npx", args, { stdio: "inherit" });
