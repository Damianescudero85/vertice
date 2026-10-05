// Lee el catálogo de Zafiro Calzados en vivo y devuelve precios (+ recargo), talles con stock, fotos y guías.
// Netlify guarda la respuesta en caché 15 minutos, así Zafiro recibe pocas consultas.
const BASE = "https://www.zafirocalzados.com.ar";
const MARKUP = 10000; // recargo sobre el precio de lista de Zafiro (sin ofertas)
const GROUPS = {
  zap: [3394840, 3867991, 3867993, 3394842, 3394841],
  inf: [3394848, 4032461, 4036026, 4074893, 4077394],
  oj: [4022452],
};
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const BR = [["New Balance","NEW BALANCE"],["Adidas","ADIDAS"],["Nike","NIKE"],["Vans","VANS"],["Puma","PUMA"],["LaCoste","LACOSTE"],["Lacoste","LACOSTE"],
  ["Asics","ASICS"],["DC","DC"],["Lynd","LYND"],["Fila","FILA"],["Salomon","SALOMON"],["TH","TOMMY"],["On","ON"]];
const SUB = { Arenera: "ARENERAS", Babuche: "BABUCHES", Sandalias: "SANDALIAS", Zapatillas: "ZAPATILLAS" };

async function session() {
  const r = await fetch(BASE + "/zapatillas", { headers: { "User-Agent": UA, Accept: "text/html" } });
  const html = await r.text();
  const csrf = (html.match(/name="csrf-token"\s+content="([^"]+)"/) || html.match(/csrf_token\s*=\s*['"]([^'"]+)/) || [])[1] || "";
  const set = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""];
  const cookie = set.filter(Boolean).map((c) => c.split(";")[0]).join("; ");
  const cats = {};
  const m = html.match(/categorias_flatten\s*=\s*(\[.*?\]);/s);
  if (m) { try { JSON.parse(m[1]).forEach((c) => (cats[c.idCategorias] = c.c_nombre_full)); } catch (e) {} }
  return { csrf, cookie, cats };
}
async function page(s, ids, p) {
  const q = new URLSearchParams({ filter_page: String(p), filter_order: "0" });
  ids.forEach((i) => q.append("filter_categories[]", String(i)));
  const r = await fetch(BASE + "/v4/product/category?" + q, {
    headers: { "User-Agent": UA, Accept: "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest",
      "X-CSRF-TOKEN": s.csrf, Cookie: s.cookie, Referer: BASE + "/zapatillas" },
  });
  if (!r.ok) throw new Error("zafiro " + r.status);
  const j = await r.json();
  return j.data || [];
}
async function group(s, ids) {
  const out = []; let p = 0;
  while (p < 60) {
    const batch = await Promise.all([0, 1, 2, 3, 4].map((k) => page(s, ids, p + k)));
    let done = false;
    for (const d of batch) { out.push(...d); if (d.length < 12) { done = true; break; } }
    if (done) break; p += 5;
  }
  return out;
}
function text(h) {
  return (h || "").replace(/<\/p>/g, "\n").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ")
    .replace(/&aacute;/g,"á").replace(/&eacute;/g,"é").replace(/&iacute;/g,"í").replace(/&oacute;/g,"ó").replace(/&uacute;/g,"ú").replace(/&ntilde;/g,"ñ")
    .replace(/\n{2,}/g, "\n").trim();
}
function brandOf(n, g, cat) {
  if (g === "oj") return [/Havaiana/.test(n) ? "HAVAIANAS" : /Schutz/.test(n) ? "SCHUTZ" : "OJOTAS", n.replace(/^Ojotas?\s+/, "")];
  for (const [pre, b] of BR) if (n.startsWith(pre + " ")) return [b, n.slice(pre.length + 1).trim()];
  if (g === "inf") { const sub = (cat || "").split(">").pop().trim(); return [SUB[sub] || "NIÑOS", n]; }
  return ["OTRAS", n];
}
function lineOf(g, cat) {
  if (g === "oj") return "temporada";
  if (g === "inf") return /(Arenera|Babuche|Sandalias)$/.test(cat || "") ? "temporada" : "ninos";
  return /Urbana$/.test(cat || "") ? "urbana" : "deportiva";
}
function descOf(d) { return d.split(/INFORMACI[OÓ]N IMPORTE|📏|Gu[ií]a de [Tt]alles|🛡|IMPORTANTE|Talles expresados|✨/)[0].replace(/\n+/g, "\n").trim(); }
function guideOf(d) {
  const re = /(?:Talle\s*)?(\d{2}(?:\s*\/\s*\d{2})?)\s*[:=\-–]\s*(?:largo\s*)?(\d{1,2}(?:[.,]\d{1,2})?)\s*cm/gi;
  const seen = new Set(), out = []; let m;
  while ((m = re.exec(d))) { const t = m[1].replace(/\s/g, ""); if (!seen.has(t)) { seen.add(t); out.push([t, m[2].replace(",", ".")]); } }
  return out;
}
function build(x, g, cats) {
  const cat = cats[x.Categorias_idCategorias] || "";
  const d = text(x.p_descripcion);
  const [brand, name] = brandOf(x.p_nombre, g, cat);
  const web = x.p_precio; // precio de lista, sin ofertas ni descuentos
  const sizes = (x.stock || []).filter((s) => s.s_ilimitado || s.s_cantidad > 0)
    .map((s) => ((s.valoratributo || [])[0] || {}).valor?.vat_valor || "").filter(Boolean);
  // Fotos: nunca la portada .png (tiene marca de agua). Las fotos de ojotas tienen marca de agua: no se usan.
  const img = g === "oj" ? [] : (x.imagenes || []).map((i) => i.i_link).filter((l) => !/\.png$/i.test(l)).slice(0, 3).map((l) => "/api/img/" + l);
  return { id: "z" + x.idProductos, src: x.idProductos, line: lineOf(g, cat), brand, name, price: web + MARKUP,
    old: 0, sizes: sizes.join(", "), out: "", img, hidden: !img.length, desc: descOf(d), gt: guideOf(d) };
}

export default async () => {
  try {
    const s = await session();
    const res = await Promise.all(Object.entries(GROUPS).map(async ([g, ids]) => (await group(s, ids)).map((x) => [g, x])));
    const seen = new Set(), products = [];
    for (const [g, x] of res.flat()) {
      if (seen.has(x.idProductos)) continue; seen.add(x.idProductos);
      if (x.p_desactivado) continue;
      const p = build(x, g, s.cats);
      if (p.sizes) products.push(p);
    }
    if (products.length < 30) throw new Error("respuesta incompleta (" + products.length + ")");
    return new Response(JSON.stringify({ updated: new Date().toISOString(), products }), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60",
        "Netlify-CDN-Cache-Control": "public, durable, s-maxage=900, stale-while-revalidate=86400" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 502, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }
};
export const config = { path: "/api/catalogo" };
