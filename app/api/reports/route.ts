import { fileReport } from "../../../lib/actions.ts";
import { handle, str } from "../../../lib/http.ts";

export async function POST(req: Request) {
  return handle(async () => {
    const b = await req.json();
    const email = str(b.email, "PayPal email", 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That PayPal email doesn't look right");
    return fileReport({
      title: str(b.title, "Title", 140),
      body: str(b.body, "What happened", 4000),
      device: str(b.device, "Device", 80),
      build: typeof b.build === "string" ? b.build.slice(0, 40) : undefined,
      tester: { name: str(b.name, "Name", 80), email, country: typeof b.country === "string" ? b.country.slice(0, 2).toUpperCase() : "" },
    });
  });
}
