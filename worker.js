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
      if (origin !== ALLOWED_ORIGIN) return new Response(null,{status:403});
      return new Response(null,{status:204,headers:corsHeaders});
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed",{status:405,headers:corsHeaders});
    }
    if (origin && origin !== ALLOWED_ORIGIN) {
      return new Response("Forbidden",{status:403,headers:corsHeaders});
    }

    const url = new URL(request.url);

    // ---------------------------------------------------
    // London live journey routing (TfL Unified API)
    // ---------------------------------------------------
    if (url.pathname === "/journey") {
      const fromLat = Number(url.searchParams.get("fromLat"));
      const fromLon = Number(url.searchParams.get("fromLon"));
      const toLat = Number(url.searchParams.get("toLat"));
      const toLon = Number(url.searchParams.get("toLon"));
      const mode = (url.searchParams.get("mode") || "").trim();

      if (![fromLat,fromLon,toLat,toLon].every(Number.isFinite)) {
        return Response.json({journeys:[]},{status:400,headers:corsHeaders});
      }

      const allowedModes = new Set([
        "tube","bus","tram","national-rail","overground","elizabeth-line","dlr"
      ]);
      const safeModes = mode.split(",").map(x=>x.trim()).filter(x=>allowedModes.has(x)).join(",");

      const tfl = new URL(
        `https://api.tfl.gov.uk/Journey/JourneyResults/${fromLat},${fromLon}/to/${toLat},${toLon}`
      );
      if (safeModes) tfl.searchParams.set("mode",safeModes);
      tfl.searchParams.set("journeyPreference","LeastTime");

      const resp = await fetch(tfl.toString(),{
        headers:{"Accept":"application/json"}
      });

      if (!resp.ok) {
        return Response.json({journeys:[]},{status:resp.status,headers:corsHeaders});
      }

      const text = await resp.text();
      const headers = new Headers(corsHeaders);
      headers.set("Content-Type","application/json; charset=utf-8");
      headers.set("Cache-Control","public, max-age=60");
      return new Response(text,{status:200,headers});
    }

    // ---------------------------------------------------
    // Worldwide autocomplete (Geoapify)
    // ---------------------------------------------------
    if (!env.GEOAPIFY_API_KEY) {
      return Response.json(
        { error: "Server configuration missing" },
        { status: 500, headers: corsHeaders }
      );
    }

    const text = (url.searchParams.get("text") || "").trim();
    const city = (url.searchParams.get("city") || "").trim();
    const lat = url.searchParams.get("lat");
    const lon = url.searchParams.get("lon");
    const lang = (url.searchParams.get("lang") || "it").slice(0,5);

    if (text.length < 2 || text.length > 120) {
      return Response.json(
        { type:"FeatureCollection",features:[] },
        { status:200,headers:corsHeaders }
      );
    }

    async function geoSearch(query) {
      const params = new URLSearchParams({
        text: query,
        format: "geojson",
        lang,
        limit: "10",
        apiKey: env.GEOAPIFY_API_KEY
      });

      // Destination coordinates are a preference only, never a hard geographic filter.
      if (
        lat && lon &&
        Number.isFinite(Number(lat)) &&
        Number.isFinite(Number(lon))
      ) {
        params.set("bias",`proximity:${Number(lon)},${Number(lat)}`);
      }

      const apiUrl =
        `https://api.geoapify.com/v1/geocode/autocomplete?${params.toString()}`;

      const response = await fetch(apiUrl,{
        headers:{"Accept":"application/json"}
      });
      if (!response.ok) return null;
      return await response.json();
    }

    // Search exactly what the traveller types first.
    let data = await geoSearch(text);

    // Only if no results exist, use the trip city as extra context.
    if (
      (!data || !Array.isArray(data.features) || data.features.length===0) &&
      city &&
      !text.toLowerCase().includes(city.toLowerCase())
    ) {
      data = await geoSearch(`${text}, ${city}`);
    }

    const headers = new Headers(corsHeaders);
    headers.set("Content-Type","application/json; charset=utf-8");
    headers.set("Cache-Control","public, max-age=300");

    return new Response(
      JSON.stringify(data || {type:"FeatureCollection",features:[]}),
      {status:200,headers}
    );
  }
};
