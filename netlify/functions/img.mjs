// Sirve las fotos de los productos desde tu dominio (con caché larga en Netlify).
const CDN = "https://d22fxaf9t8d39k.cloudfront.net/";
export default async (req) => {
  const file = new URL(req.url).pathname.split("/").pop();
  if (!/^[a-f0-9]{20,}\.(jpe?g|webp)$/i.test(file)) return new Response("no", { status: 400 });
  const r = await fetch(CDN + file);
  if (!r.ok) return new Response("no", { status: 404 });
  return new Response(r.body, { headers: { "Content-Type": r.headers.get("content-type") || "image/jpeg",
    "Cache-Control": "public, max-age=604800", "Netlify-CDN-Cache-Control": "public, durable, s-maxage=31536000, immutable" } });
};
export const config = { path: "/api/img/*" };
