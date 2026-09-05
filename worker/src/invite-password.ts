// Password-gating for shared invite links. This protects a share link, not a
// login — the invite token itself is already the real capability, and the
// password is just a second factor so a forwarded/leaked link doesn't play
// on its own. A single salted SHA-256 round (not PBKDF2/bcrypt) is
// proportionate to that threat model and cheap enough to run on every
// unlock attempt within a Worker's CPU budget.

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function sha256Hex(input: Uint8Array): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", input));
}

export async function hashInvitePassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = toHex(salt.buffer);
  const hash = await sha256Hex(new Uint8Array([...salt, ...new TextEncoder().encode(password)]));
  return `${saltHex}:${hash}`;
}

export async function verifyInvitePassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, expectedHash] = stored.split(":");
  if (!saltHex || !expectedHash) return false;
  const salt = fromHex(saltHex);
  const hash = await sha256Hex(new Uint8Array([...salt, ...new TextEncoder().encode(password)]));
  return hash === expectedHash;
}

// The "unlock" cookie proves a visitor already passed the password check for
// this specific token, without storing any server-side session for it.
// HMAC'd with the app secret so a visitor can't forge one for a different
// (or re-protected) token.
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function signInviteUnlock(secret: string, token: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return toHex(sig);
}

export async function verifyInviteUnlock(secret: string, token: string, cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await signInviteUnlock(secret, token);
  return expected === cookieValue;
}
