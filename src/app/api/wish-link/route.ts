import { createClient } from "@supabase/supabase-js";
import { isPrivateEmail } from "@/lib/private-auth";
const shops = new Set([
  "www.etsy.com",
  "www.amazon.com",
  "www.ebay.com",
  "shopee.ph",
  "www.lazada.com.ph",
  "www.ikea.com",
]);
export async function POST(req: Request) {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    return Response.json({ error: "Sign in first." }, { status: 401 });
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: authorization } },
    },
  );
  const { data, error } = await db.auth.getUser(authorization.slice(7));
  if (error || !isPrivateEmail(data.user?.email))
    return Response.json(
      { error: "Private account required." },
      { status: 403 },
    );
  try {
    const body = await req.text();
    if (body.length > 3000) throw new Error();
    const target = new URL(JSON.parse(body).url);
    if (
      target.protocol !== "https:" ||
      target.port ||
      target.username ||
      target.password ||
      !shops.has(target.hostname)
    )
      return Response.json({ title: null, price: null });
    // An explicit public-shop allowlist and no redirects prevent arbitrary/private-network requests.
    const response = await fetch(target, {
      redirect: "manual",
      signal: AbortSignal.timeout(4000),
      headers: { "User-Agent": "OurLittleArcade/1.0" },
      cache: "no-store",
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("text/html")
    )
      return Response.json({ title: null, price: null });
    const reader = response.body!.getReader();
    let bytes = 0,
      html = "";
    const decoder = new TextDecoder();
    while (bytes < 256000) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      html += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    const title =
      html.match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)/i,
      )?.[1] || html.match(/<title[^>]*>([^<]*)/i)?.[1];
    const price = html.match(
      /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([\d.]+)/i,
    )?.[1];
    return Response.json({
      title: title?.replace(/&amp;/g, "&").slice(0, 160) || null,
      price: price ? Number(price) : null,
    });
  } catch {
    return Response.json({ title: null, price: null });
  }
}
