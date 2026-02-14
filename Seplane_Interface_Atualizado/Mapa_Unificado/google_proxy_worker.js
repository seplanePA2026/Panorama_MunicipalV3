/**
 * Cloudflare Worker — Google Places Proxy (JSON + photo proxy)
 *
 * Endpoints:
 *  - GET /lookup?lat=-9.39&lon=-38.23
 *      -> { name, address, photoUrl, placeUrl }
 *  - GET /photo?ref=<photo_reference>&maxwidth=800
 *      -> returns image bytes (key hidden)
 *
 * Environment:
 *  - GOOGLE_PLACES_KEY (required)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const key = env.GOOGLE_PLACES_KEY;
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing GOOGLE_PLACES_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path === "/photo") {
      const ref = url.searchParams.get("ref");
      const maxwidth = url.searchParams.get("maxwidth") || "800";
      if (!ref) {
        return new Response(JSON.stringify({ error: "Missing ref" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const gUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
      gUrl.searchParams.set("maxwidth", maxwidth);
      gUrl.searchParams.set("photo_reference", ref);
      gUrl.searchParams.set("key", key);

      const resp = await fetch(gUrl.toString(), { redirect: "follow" });
      // forward content-type
      const headers = new Headers(resp.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      // cache a bit
      headers.set("Cache-Control", "public, max-age=86400");
      return new Response(resp.body, { status: resp.status, headers });
    }

    if (path === "/lookup") {
      const lat = url.searchParams.get("lat");
      const lon = url.searchParams.get("lon") || url.searchParams.get("lng");
      if (!lat || !lon) {
        return new Response(JSON.stringify({ error: "Missing lat/lon" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 1) Nearby search ranked by distance for schools
      const nearby = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
      nearby.searchParams.set("location", `${lat},${lon}`);
      nearby.searchParams.set("rankby", "distance");
      nearby.searchParams.set("type", "school");
      nearby.searchParams.set("language", "pt-BR");
      nearby.searchParams.set("key", key);

      const nResp = await fetch(nearby.toString());
      const nJson = await nResp.json();
      const first = nJson && nJson.results && nJson.results[0];
      if (!first || !first.place_id) {
        return new Response(JSON.stringify({ ok: true, result: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 2) Details for photo + url
      const details = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      details.searchParams.set("place_id", first.place_id);
      details.searchParams.set("fields", "name,formatted_address,url,photos,types");
      details.searchParams.set("language", "pt-BR");
      details.searchParams.set("key", key);

      const dResp = await fetch(details.toString());
      const dJson = await dResp.json();
      const r = dJson && dJson.result;
      if (!r) {
        return new Response(JSON.stringify({ ok: true, result: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let photoUrl = null;
      if (r.photos && r.photos.length && r.photos[0].photo_reference) {
        const pr = r.photos[0].photo_reference;
        photoUrl = `${url.origin}/photo?ref=${encodeURIComponent(pr)}&maxwidth=800`;
      }

      const out = {
        name: r.name || first.name || null,
        address: r.formatted_address || null,
        placeUrl: r.url || null,
        photoUrl,
      };

      return new Response(JSON.stringify({ ok: true, result: out }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};
