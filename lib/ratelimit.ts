// shortcut: in-memory, per server process; resets on restart. Enough to stop one script flooding a demo.
const hits = new Map<string, number[]>();

// All-or-nothing: a request counts against every bucket only if every bucket has room.
export function allow(buckets: [key: string, max: number][], windowMs: number): boolean {
  const now = Date.now();
  const recent = buckets.map(([key]) => (hits.get(key) ?? []).filter((t) => now - t < windowMs));
  if (recent.some((r, i) => r.length >= buckets[i][1])) return false;
  buckets.forEach(([key], i) => hits.set(key, [...recent[i], now]));
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}

export const tries = (key: string, windowMs: number) => (hits.get(key) ?? []).filter((t) => Date.now() - t < windowMs).length;

// The client can write anything into X-Forwarded-For; the proxy in front of us appends the real address last.
export function clientIp(req: Request): string {
  const h = req.headers;
  return h.get("cf-connecting-ip") || h.get("true-client-ip") || h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";
}
