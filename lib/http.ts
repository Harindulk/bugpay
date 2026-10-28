import { NextResponse } from "next/server";

// Turns thrown errors into a 400 with the message, so the UI can show it next to the control.
export async function handle(fn: () => unknown) {
  try {
    return NextResponse.json(await fn());
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export const str = (v: unknown, name: string, max = 4000) => {
  if (typeof v !== "string" || !v.trim()) throw new Error(`${name} is required`);
  if (v.length > max) throw new Error(`${name} is too long`);
  return v.trim();
};
