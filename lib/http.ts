import crypto from "node:crypto";
import { allow, clientIp, tries } from "./ratelimit.ts";

class HttpError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Turns thrown errors into a 400 (or the error's own status) with the message, so the UI can show it next to the control.
export async function handle(fn: () => unknown) {
  try {
    return Response.json(await fn());
  } catch (e) {
    console.error(e);
    return Response.json({ error: (e as Error).message }, { status: e instanceof HttpError ? e.status : 400 });
  }
}

export const str = (v: unknown, name: string, max = 4000) => {
  if (typeof v !== "string" || !v.trim()) throw new Error(`${name} is required`);
  if (v.length > max) throw new Error(`${name} is too long`);
  return v.trim();
};

const HOUR = 3_600_000;
const digest = (s: string) => crypto.createHash("sha256").update(s).digest();

// Hosted demo: with STUDIO_PASSCODE set, anything that moves money, changes the rules or runs the agent needs it.
// Testers' form and the read-only state stay open. With no passcode set (local use) everything is open.
export function studio(req: Request) {
  const want = process.env.STUDIO_PASSCODE;
  if (!want) return;
  const key = `pass:${clientIp(req)}`;
  if (tries(key, HOUR) >= 10) throw new HttpError("Too many wrong passcodes. Try again in an hour.", 429);
  if (!crypto.timingSafeEqual(digest(req.headers.get("x-studio-passcode") ?? ""), digest(want))) {
    allow([[key, 10]], HOUR); // only wrong tries count
    throw new HttpError("This needs the studio passcode.", 401);
  }
}
