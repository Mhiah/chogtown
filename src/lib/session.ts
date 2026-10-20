import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export interface Session {
  /** wallet address, checksummed. Absent for guests. */
  address?: string;
  /** the Chog this visitor is playing as */
  tokenId?: number;
  /** guests explore with a resident Chog; nothing they do changes it */
  guest?: boolean;
  /** stable id for votes and reactions */
  vid: string;
  /** organizers' judge pass: may play any Chog, like a holder, without owning one */
  judge?: boolean;
}

const COOKIE = "chogtown";
const secret = () => {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(s || "chogtown-dev-secret-change-me");
};

export async function getSession(): Promise<Session | null> {
  const c = cookies().get(COOKIE)?.value;
  if (!c) return null;
  try {
    const { payload } = await jwtVerify(c, secret());
    return payload.s as Session;
  } catch {
    return null;
  }
}

export async function setSession(s: Session) {
  const jwt = await new SignJWT({ s }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret());
  cookies().set(COOKIE, jwt, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export function clearSession() {
  cookies().delete(COOKIE);
}

export const newVid = () => crypto.randomUUID();
