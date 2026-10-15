import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const GUEST_COOKIE = "iai_guest";

/**
 * Resolves the current user. Until a real auth provider is plugged in, every browser gets a
 * durable guest identity bound to an httpOnly cookie. Only callable from server actions / route
 * handlers when `create` is true (cookies can only be set there).
 */
export async function currentUser(opts: { create: true; name?: string; targetLevel?: string }): Promise<{ id: string; name: string | null }>;
export async function currentUser(opts?: { create?: false }): Promise<{ id: string; name: string | null } | null>;
export async function currentUser(opts: { create?: boolean; name?: string; targetLevel?: string } = {}) {
  const jar = cookies();
  const token = jar.get(GUEST_COOKIE)?.value;
  if (token) {
    const user = await prisma.user.findUnique({ where: { guestToken: token }, select: { id: true, name: true } });
    if (user) {
      if (opts.create && (opts.name || opts.targetLevel)) {
        return prisma.user.update({
          where: { id: user.id },
          data: { name: opts.name || user.name, targetLevel: opts.targetLevel },
          select: { id: true, name: true },
        });
      }
      return user;
    }
  }
  if (!opts.create) return null;
  const guestToken = randomBytes(24).toString("base64url");
  const user = await prisma.user.create({
    data: { guestToken, name: opts.name || null, targetLevel: opts.targetLevel ?? "SDE-2" },
    select: { id: true, name: true },
  });
  jar.set(GUEST_COOKIE, guestToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return user;
}
