export default {
  async fetch(request, env) {
    const ALLOWED_ORIGIN = "https://valentinacatalano04-png.github.io";
    const origin = request.headers.get("Origin") || "";

    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    };

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders
      });
    }

    if (origin && origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden", {
        status: 403,
        headers: corsHeaders
      });
    }

    if (!env.GEOAPIFY_API_KEY) {
      return Response.json(
        { error: "Server configuration missing" },
        { status: 500, headers: corsHeaders }
      );
    }

    const url = new URL(request.url);
    const text = (url.searchParams.get("text") || "").trim();
    const city = (url.searchParams.get("city") || "").trim();
    const lat = url.searchParams.get("lat");
    const lon = url.searchParams.get("lon");
    const lang = (url.searchParams.get("lang") || "it").slice(0, 5);

    if (text.length < 2 || text.length > 120) {
      return Response.json(
        { features: [] },
        { status: 200, headers: corsHeaders }
      );
    }

    let query = text;
    if (city && !text.toLowerCase().includes(city.toLowerCase())) {
      query = `${text}, ${city}`;
    }

    const params = new URLSearchParams({
      text: query,
      format: "geojson",
      lang,
      limit: "10",
      apiKey: env.GEOAPIFY_API_KEY
    });

    if (
      lat &&
      lon &&
      Number.isFinite(Number(lat)) &&
      Number.isFinite(Number(lon))
    ) {
      params.set("bias", `proximity:${Number(lon)},${Number(lat)}`);
    }

    const apiUrl =
      `https://api.geoapify.com/v1/geocode/autocomplete?${params.toString()}`;

    const response = await fetch(apiUrl, {
      headers: { "Accept": "application/json" }
    });

    if (!response.ok) {
      return Response.json(
        { features: [] },
        { status: 502, headers: corsHeaders }
      );
    }

    const data = await response.text();
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=300");

    return new Response(data, { status: 200, headers });
  }
};
