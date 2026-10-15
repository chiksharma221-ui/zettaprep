import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Short-lived, HMAC-signed tickets that authorize a browser to open a gateway WebSocket for one
 * specific interview session. Issued by the Next.js server (which knows the user's cookie) and
 * verified by the standalone gateway (which shares GATEWAY_SECRET).
 */
export interface TicketPayload {
  sid: string; // InterviewSession.id
  uid: string; // User.id
  exp: number; // epoch ms
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function sign(data: string, secret: string) {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function issueTicket(sid: string, uid: string, secret: string, ttlMs = 10 * 60_000): string {
  const payload = b64url(JSON.stringify({ sid, uid, exp: Date.now() + ttlMs } satisfies TicketPayload));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyTicket(ticket: string, secret: string): TicketPayload | null {
  const [payload, sig] = ticket.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TicketPayload;
    if (typeof p.sid !== "string" || typeof p.uid !== "string" || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}
