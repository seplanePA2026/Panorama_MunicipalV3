/**
 * q2w enrichment (client-side) for QGIS2Web OpenLayers exports
 * Layer: ESTAB_DE_ENSINO_PA
 *
 * Goal:
 * - When clicking a point, fetch the nearest EDUCATION POI (school/college/university/kindergarten)
 *   around the point (very small radius first) and show: name, address, sector (public/private when possible), photo.
 *
 * Photo strategy (no keys):
 * 1) OSM tags: image
 * 2) OSM tags: wikipedia -> Wikipedia pageimages
 * 3) OSM tags: wikidata -> Wikidata P18
 * 4) Wikidata Nearby (SPARQL) -> P18
 * 5) Wikimedia Commons geosearch (File namespace) near point
 *
 * NOTE: Open data does not guarantee photos for every location.
 * For 100% photo coverage, you typically need Google Places Photos (requires an API key + backend proxy).
 */

(function () {
  "use strict";

  // --- Config ---
  // Primary precision radius requested by user.
  var PRIMARY_RADIUS_M = 5;
  // If nothing exists exactly on the point in OSM, widen progressively.
  // (We still ALWAYS pick the closest POI and show distance + allow manual selection.)
  var FALLBACK_RADII_M = [5, 15, 30, 60, 120, 250];
  // How many nearby candidates to show (when more than one is found)
  var MAX_CANDIDATES = 5;

  // Optional (advanced): set a backend proxy for Google Places Photos.
  // Example:
  //   window.Q2W_ENRICH_CONFIG = { googleProxyUrl: "https://<your-worker>/places" };
  // The proxy should return JSON: { name, address, photoUrl, sector }
  var CFG = (window.Q2W_ENRICH_CONFIG || {});
  var GOOGLE_PROXY_URL = CFG.googleProxyUrl || null;

  // --- Cache ---
  var cache = {};        // key -> result
  var inflight = {};     // key -> promise

  function keyOf(lat, lon) {
    return lat.toFixed(6) + "," + lon.toFixed(6);
  }

  function selKey(lat, lon) {
    return "q2w_sel_ensino_" + keyOf(lat, lon);
  }

  function loadSelection(lat, lon) {
    try {
      var raw = localStorage.getItem(selKey(lat, lon));
      if (!raw) return null;
      var j = JSON.parse(raw);
      if (j && j.osmType && (typeof j.osmId === "number" || typeof j.osmId === "string")) return j;
      return null;
    } catch (e) {
      return null;
    }
  }

  function saveSelection(lat, lon, osmType, osmId) {
    try {
      localStorage.setItem(selKey(lat, lon), JSON.stringify({ osmType: osmType, osmId: osmId }));
    } catch (e) {}
  }

  function clearPointCache(lat, lon) {
    var base = keyOf(lat, lon);
    for (var k in cache) {
      if (k.indexOf(base) === 0) delete cache[k];
    }
    for (var i in inflight) {
      if (i.indexOf(base) === 0) delete inflight[i];
    }
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function haversineMeters(lat1, lon1, lat2, lon2) {
    var R = 6371000;
    var toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad;
    var dLon = (lon2 - lon1) * toRad;
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function amenityLabel(amenity) {
    if (!amenity) return "Educação";
    var a = String(amenity);
    if (a === "school") return "Escola";
    if (a === "kindergarten") return "Creche / Pré-escola";
    if (a === "college") return "Faculdade / Colégio";
    if (a === "university") return "Universidade";
    return "Educação";
  }

  function buildAddressFromOsmTags(tags) {
    if (!tags) return "";
    var parts = [];
    if (tags["addr:street"]) parts.push(tags["addr:street"]);
    if (tags["addr:housenumber"]) parts.push(tags["addr:housenumber"]);
    var line1 = parts.join(", ");

    var line2Parts = [];
    if (tags["addr:suburb"]) line2Parts.push(tags["addr:suburb"]);
    if (tags["addr:city"]) line2Parts.push(tags["addr:city"]);
    if (tags["addr:state"]) line2Parts.push(tags["addr:state"]);
    var line2 = line2Parts.join(" • ");

    var out = [];
    if (line1) out.push(line1);
    if (line2) out.push(line2);
    return out.join(" — ");
  }

  function shortenName(name) {
    var s = String(name || "").trim();
    if (s.length <= 45) return s;
    return s.slice(0, 42) + "…";
  }

  function inferSector(tags, name) {
    var n = (name || "").toLowerCase();
    var op = (tags && tags.operator ? String(tags.operator).toLowerCase() : "");
    var ot = (tags && (tags["operator:type"] || tags["ownership"] || tags["operator:sector"])
      ? String(tags["operator:type"] || tags["ownership"] || tags["operator:sector"]).toLowerCase()
      : "");

    function hasAny(s, arr) {
      for (var i = 0; i < arr.length; i++) if (s.indexOf(arr[i]) !== -1) return true;
      return false;
    }

    if (ot) {
      if (hasAny(ot, ["government", "public", "municipal", "state", "federal", "publico", "pública", "publica"]))
        return { label: "Pública", how: "tags" };
      if (hasAny(ot, ["private", "privado", "privada", "particular"]))
        return { label: "Privada", how: "tags" };
    }

    var pubKeys = [
      "escola municipal", "municipal", "prefeitura", "secretaria",
      "estadual", "colégio estadual", "colegio estadual", "governo",
      "instituto federal", "universidade federal", "federal", "uf",
      "rede estadual", "rede municipal"
    ];
    var privKeys = [
      "particular", "privada", "colégio", "colegio", "instituto", "faculdade", "universidade",
      "adventista", "sesi", "senai", "senac", "objetivo", "pitagoras", "pítagoras", "anglo", "coc", "maple bear"
    ];

    var hay = (n + " " + op);
    if (hasAny(hay, pubKeys)) return { label: "Pública (provável)", how: "heurística" };
    if (hasAny(hay, privKeys)) return { label: "Privada (provável)", how: "heurística" };
    return { label: "Não informado", how: "nenhum" };
  }

  // --- Overpass ---
  async function overpassPost(query) {
    var endpoints = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter"
    ];
    var lastErr = null;
    for (var i = 0; i < endpoints.length; i++) {
      try {
        var body = "data=" + encodeURIComponent(query);
        var resp = await fetch(endpoints[i], {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
          body: body
        });
        if (!resp.ok) throw new Error("Overpass HTTP " + resp.status);
        return await resp.json();
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Falha Overpass");
  }

  function educationOverpassQueryAround(lat, lon, radius) {
    return (
      '[out:json][timeout:25];(' +
      'node(around:' + radius + ',' + lat + ',' + lon + ')["amenity"~"school|college|university|kindergarten"];' +
      'way(around:' + radius + ',' + lat + ',' + lon + ')["amenity"~"school|college|university|kindergarten"];' +
      'relation(around:' + radius + ',' + lat + ',' + lon + ')["amenity"~"school|college|university|kindergarten"];' +
      'node(around:' + radius + ',' + lat + ',' + lon + ')["building"="school"];' +
      'way(around:' + radius + ',' + lat + ',' + lon + ')["building"="school"];' +
      ');out center tags;'
    );
  }

  function educationOverpassQueryById(osmType, osmId) {
    var t = (osmType === "way" ? "way" : (osmType === "relation" ? "relation" : "node"));
    return '[out:json][timeout:25];' + t + '(' + osmId + ');out center tags;';
  }

  function osmTypeUrl(type, id) {
    var t = (type === "way" ? "way" : (type === "relation" ? "relation" : "node"));
    return "https://www.openstreetmap.org/" + t + "/" + id;
  }

  function getElLatLon(el) {
    var elLat = el.lat || (el.center && el.center.lat);
    var elLon = el.lon || (el.center && el.center.lon);
    if (typeof elLat !== "number" || typeof elLon !== "number") return null;
    return { lat: elLat, lon: elLon };
  }

  function osmDisplayName(tags) {
    if (!tags) return null;
    return tags.name || tags["name:pt"] || tags["official_name"] || tags["short_name"] || tags.operator || null;
  }

  function normalizeOsmCandidate(el, baseLat, baseLon) {
    var ll = getElLatLon(el);
    if (!ll) return null;
    var tags = el.tags || {};
    var name = osmDisplayName(tags);
    var kind = amenityLabel(tags.amenity || (tags.building === "school" ? "school" : null));
    var dist = haversineMeters(baseLat, baseLon, ll.lat, ll.lon);
    return {
      osmType: el.type || "node",
      osmId: el.id,
      lat: ll.lat,
      lon: ll.lon,
      name: name,
      kind: kind,
      distMeters: dist,
      tags: tags
    };
  }

  function scoreCandidate(c) {
    // Strongly prefer closest, but penalize unnamed results.
    var hasName = !!(c.name && c.name.trim());
    return c.distMeters + (hasName ? 0 : 75);
  }

  function pickBestCandidate(cands) {
    var best = null;
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      var s = scoreCandidate(c);
      if (!best || s < best._score) {
        best = c;
        best._score = s;
      }
    }
    return best;
  }

  async function overpassCandidatesAround(lat, lon, radius) {
    var q = educationOverpassQueryAround(lat, lon, radius);
    var data = await overpassPost(q);
    var out = [];
    if (!data || !data.elements) return out;
    for (var i = 0; i < data.elements.length; i++) {
      var n = normalizeOsmCandidate(data.elements[i], lat, lon);
      if (n) out.push(n);
    }
    // Sort by score (closest + named)
    out.sort(function (a, b) { return scoreCandidate(a) - scoreCandidate(b); });
    return out;
  }

  async function overpassById(osmType, osmId, baseLat, baseLon) {
    var q = educationOverpassQueryById(osmType, osmId);
    var data = await overpassPost(q);
    if (!data || !data.elements || !data.elements.length) return null;
    var n = normalizeOsmCandidate(data.elements[0], baseLat, baseLon);
    return n;
  }

  // --- Nominatim ---
  async function nominatimReverse(lat, lon) {
    var url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" +
      encodeURIComponent(lat) + "&lon=" + encodeURIComponent(lon) +
      "&zoom=18&addressdetails=1&accept-language=pt-BR";
    var resp = await fetch(url, { method: "GET" });
    if (!resp.ok) throw new Error("Nominatim HTTP " + resp.status);
    return await resp.json();
  }

  async function nominatimSearchBounded(lat, lon, query, radiusMeters) {
    var dLat = (radiusMeters / 111320.0);
    var dLon = (radiusMeters / (111320.0 * Math.cos(lat * Math.PI / 180)));
    var left = lon - dLon, right = lon + dLon, top = lat + dLat, bottom = lat - dLat;
    var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&addressdetails=1&accept-language=pt-BR" +
      "&q=" + encodeURIComponent(query) +
      "&bounded=1&viewbox=" + [left, top, right, bottom].map(function (x) { return String(x); }).join(",");
    var resp = await fetch(url, { method: "GET" });
    if (!resp.ok) throw new Error("Nominatim search HTTP " + resp.status);
    return await resp.json();
  }

  function looksLikeRoadOrArea(name) {
    var s = (name || "").toLowerCase();
    return (
      s.indexOf("rua") === 0 ||
      s.indexOf("avenida") === 0 ||
      s.indexOf("travessa") === 0 ||
      s.indexOf("praça") === 0 ||
      s.indexOf("praca") === 0 ||
      s.indexOf("bairro") !== -1
    );
  }

  // --- Wikipedia/Wikidata/Commons photos ---
  async function wikipediaToThumbUrl(wikipediaTag) {
    if (!wikipediaTag) return null;
    var parts = String(wikipediaTag).split(":");
    var lang = "pt";
    var title = wikipediaTag;
    if (parts.length >= 2 && parts[0].length <= 3) {
      lang = parts[0];
      title = parts.slice(1).join(":");
    }
    var api = "https://" + lang + ".wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&origin=*&pithumbsize=640&titles=" + encodeURIComponent(title);
    var resp = await fetch(api, { method: "GET" });
    if (!resp.ok) return null;
    var data = await resp.json();
    var pages = data && data.query && data.query.pages;
    if (!pages) return null;
    var firstKey = Object.keys(pages)[0];
    var page = pages[firstKey];
    if (page && page.thumbnail && page.thumbnail.source) return page.thumbnail.source;
    return null;
  }

  async function wikidataToThumbUrl(wikidataId) {
    var entityUrl = "https://www.wikidata.org/wiki/Special:EntityData/" + encodeURIComponent(wikidataId) + ".json";
    var resp = await fetch(entityUrl, { method: "GET" });
    if (!resp.ok) return null;
    var data = await resp.json();
    var ent = data && data.entities && data.entities[wikidataId];
    if (!ent || !ent.claims || !ent.claims.P18 || !ent.claims.P18.length) return null;
    var mainsnak = ent.claims.P18[0].mainsnak;
    var fileName = mainsnak && mainsnak.datavalue && mainsnak.datavalue.value;
    if (!fileName) return null;
    var commonsUrl =
      "https://commons.wikimedia.org/w/api.php?action=query&titles=File:" + encodeURIComponent(fileName) +
      "&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json&origin=*";
    var resp2 = await fetch(commonsUrl, { method: "GET" });
    if (!resp2.ok) return null;
    var j = await resp2.json();
    var pages = j && j.query && j.query.pages;
    if (!pages) return null;
    var firstKey = Object.keys(pages)[0];
    var page = pages[firstKey];
    if (!page || !page.imageinfo || !page.imageinfo.length) return null;
    return page.imageinfo[0].thumburl || page.imageinfo[0].url || null;
  }

  function parseWktPoint(wkt) {
    // "Point(lon lat)"
    if (!wkt) return null;
    var m = /Point\(([-0-9.]+)\s+([-0-9.]+)\)/i.exec(String(wkt));
    if (!m) return null;
    var lon = parseFloat(m[1]);
    var lat = parseFloat(m[2]);
    if (isNaN(lat) || isNaN(lon)) return null;
    return { lat: lat, lon: lon };
  }

  async function wikidataNearbyEducation(lat, lon, radiusKm, requireImage) {
    // Query nearest education items; optionally require P18.
    var rad = (typeof radiusKm === "number" ? radiusKm : 0.25);
    var values = "wd:Q3914 wd:Q2385804 wd:Q875538 wd:Q9842"; // school, educational institution, etc

    var imgClause = requireImage ? "?item wdt:P18 ?img ." : "";
    var query =
      "SELECT ?item ?itemLabel ?coord WHERE { " +
      "SERVICE wikibase:around { " +
      "  ?item wdt:P625 ?coord . " +
      "  bd:serviceParam wikibase:center \"Point(" + lon + " " + lat + ")\"^^geo:wktLiteral . " +
      "  bd:serviceParam wikibase:radius \"" + rad + "\" . " +
      "} " +
      "?item wdt:P31/wdt:P279* ?class . " +
      "VALUES ?class { " + values + " } . " +
      imgClause +
      "SERVICE wikibase:label { bd:serviceParam wikibase:language \"pt-BR,pt,en\". } " +
      "} LIMIT 10";

    var url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query);
    var resp = await fetch(url, { method: "GET", headers: { "Accept": "application/sparql-results+json" } });
    if (!resp.ok) return [];
    var data = await resp.json();
    var bindings = data && data.results && data.results.bindings;
    if (!bindings) return [];

    var out = [];
    for (var i = 0; i < bindings.length; i++) {
      var b = bindings[i];
      var item = b.item && b.item.value;
      var label = b.itemLabel && b.itemLabel.value;
      var coord = b.coord && b.coord.value;
      if (!item) continue;
      var qid = item.split("/").pop();
      var ll = parseWktPoint(coord);
      var dist = ll ? haversineMeters(lat, lon, ll.lat, ll.lon) : null;
      out.push({ qid: qid, label: label || qid, distMeters: dist });
    }
    // nearest first
    out.sort(function (a, b) {
      var da = (a.distMeters === null ? 1e9 : a.distMeters);
      var db = (b.distMeters === null ? 1e9 : b.distMeters);
      return da - db;
    });
    return out;
  }

  async function commonsNearbyImage(lat, lon, radiusMeters) {
    var r = (typeof radiusMeters === "number" ? radiusMeters : 60);
    var url = "https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gscoord=" +
      encodeURIComponent(lat + "|" + lon) +
      "&gsradius=" + encodeURIComponent(r) +
      "&gslimit=6&gsnamespace=6&format=json&origin=*";
    var resp = await fetch(url, { method: "GET" });
    if (!resp.ok) return null;
    var data = await resp.json();
    var gs = data && data.query && data.query.geosearch;
    if (!gs || !gs.length) return null;

    var pageids = gs.map(function (x) { return x.pageid; }).join("|");
    var url2 = "https://commons.wikimedia.org/w/api.php?action=query&pageids=" +
      encodeURIComponent(pageids) +
      "&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json&origin=*";
    var resp2 = await fetch(url2, { method: "GET" });
    if (!resp2.ok) return null;
    var j = await resp2.json();
    var pages = j && j.query && j.query.pages;
    if (!pages) return null;

    // pick the first file with thumb
    var keys = Object.keys(pages);
    for (var i = 0; i < keys.length; i++) {
      var p = pages[keys[i]];
      if (p && p.imageinfo && p.imageinfo.length) {
        return p.imageinfo[0].thumburl || p.imageinfo[0].url || null;
      }
    }
    return null;
  }

  // --- Optional: Google proxy (if user configures) ---
  async function googleProxyLookup(lat, lon) {
    if (!GOOGLE_PROXY_URL) return null;
    var url = GOOGLE_PROXY_URL + "?lat=" + encodeURIComponent(lat) + "&lon=" + encodeURIComponent(lon) + "&type=school";
    var resp = await fetch(url, { method: "GET" });
    if (!resp.ok) return null;
    var j = await resp.json();
    // expected: { name, address, photoUrl, sector, placeUrl }
    return j;
  }

  // --- Main lookup ---
  async function lookupEducation(lat, lon) {
    var sel = loadSelection(lat, lon);
    var ck = keyOf(lat, lon) + (sel ? ("|sel=" + sel.osmType + ":" + sel.osmId) : "|sel=none");
    if (cache[ck]) return cache[ck];
    if (inflight[ck]) return inflight[ck];

    inflight[ck] = (async function () {
      var result = {
        lat: lat,
        lon: lon,
        name: null,
        kind: "Educação",
        address: null,
        source: null,
        osmUrl: null,
        wikidata: null,
        wikipedia: null,
        imageUrl: null,
        sector: null,
        sectorHow: null,
        distMeters: null,
        foundRadius: null,
        candidates: []
      };

      // 0) Optional Google proxy (if configured). This is the only path that can reliably return photos.
      // We only use it as a LAST step for photos, unless nothing is found in OSM.

      // 1) Overpass lookup (precise first)
      var best = null;
      var candidates = [];

      try {
        if (sel && sel.osmType && sel.osmId) {
          var forced = await overpassById(sel.osmType, sel.osmId, lat, lon);
          if (forced) {
            candidates = [forced];
            best = forced;
            result.foundRadius = null;
          }
        }

        if (!best) {
          for (var i = 0; i < FALLBACK_RADII_M.length; i++) {
            var r = FALLBACK_RADII_M[i];
            var c = await overpassCandidatesAround(lat, lon, r);
            if (c && c.length) {
              candidates = c;
              best = pickBestCandidate(c);
              result.foundRadius = r;
              break;
            }
          }
        }

        if (best) {
          result.source = "OSM (Overpass)";
          result.name = best.name;
          result.kind = best.kind;
          result.distMeters = best.distMeters;
          result.osmUrl = osmTypeUrl(best.osmType, best.osmId);

          var tags = best.tags || {};
          result.wikidata = tags.wikidata || null;
          result.wikipedia = tags.wikipedia || null;
          result.address = buildAddressFromOsmTags(tags) || null;

          // Sector
          var sec = inferSector(tags, result.name);
          result.sector = sec.label;
          result.sectorHow = sec.how;

          // Photo from OSM tags
          if (tags.image) result.imageUrl = tags.image;
          if (!result.imageUrl && tags.wikipedia) {
            try {
              var w = await wikipediaToThumbUrl(tags.wikipedia);
              if (w) result.imageUrl = w;
            } catch (e1) {}
          }
          if (!result.imageUrl && tags.wikidata) {
            try {
              var wd = await wikidataToThumbUrl(tags.wikidata);
              if (wd) result.imageUrl = wd;
            } catch (e2) {}
          }

          // Candidates list for UI
          var shortList = candidates.slice(0, MAX_CANDIDATES).map(function (x) {
            return {
              osmType: x.osmType,
              osmId: x.osmId,
              name: x.name || "(sem nome no OSM)",
              distMeters: x.distMeters
            };
          });
          result.candidates = shortList;
        }
      } catch (eOver) {
        // Keep going with Nominatim
      }

      // 2) If we still have no OSM POI name, try Nominatim search bounded for education keywords.
      if (!result.name || looksLikeRoadOrArea(result.name)) {
        try {
          // Local search in a small box (start at 30m, then 120m)
          var q = ["escola", "colégio", "creche", "universidade", "faculdade"];
          var bestNom = null;
          var radii = [30, 120, 250];
          for (var ri = 0; ri < radii.length && !bestNom; ri++) {
            for (var qi = 0; qi < q.length; qi++) {
              var arr = await nominatimSearchBounded(lat, lon, q[qi], radii[ri]);
              if (!arr || !arr.length) continue;
              for (var ai = 0; ai < arr.length; ai++) {
                var it = arr[ai];
                var itLat = parseFloat(it.lat), itLon = parseFloat(it.lon);
                if (isNaN(itLat) || isNaN(itLon)) continue;
                var d = haversineMeters(lat, lon, itLat, itLon);
                var cls = ((it.category || "") + ":" + (it.type || "")).toLowerCase();
                var poi = (cls.indexOf("amenity") !== -1 || cls.indexOf("building") !== -1 || cls.indexOf("education") !== -1);
                var nm = it.name || (it.display_name ? String(it.display_name).split(",")[0] : "");
                if (looksLikeRoadOrArea(nm)) continue;
                var score = d + (poi ? 0 : 200);
                if (!bestNom || score < bestNom._score) {
                  bestNom = { it: it, dist: d, _score: score };
                }
              }
            }
          }

          if (bestNom) {
            var it2 = bestNom.it;
            result.source = "Nominatim (busca local)";
            result.name = it2.name || (it2.display_name ? String(it2.display_name).split(",")[0] : null);
            result.address = it2.display_name || result.address;
            result.distMeters = bestNom.dist;
            result.kind = "Escola";
          }
        } catch (eNom) {}
      }

      // 3) Address fallback: reverse geocoding (only for address, not for name)
      if (!result.address) {
        try {
          var rev = await nominatimReverse(lat, lon);
          if (rev && rev.display_name) result.address = rev.display_name;
          if (!result.source) result.source = "Nominatim (endereço)";
        } catch (eRev) {}
      }

      // 4) If no photo yet, try Wikidata Nearby (sometimes has P18 even if OSM lacks wikidata tag)
      if (!result.imageUrl) {
        try {
          // First try within 0.08km (~80m) requiring image, then 0.25km
          var near = await wikidataNearbyEducation(lat, lon, 0.08, true);
          if (!near.length) near = await wikidataNearbyEducation(lat, lon, 0.25, true);
          if (near.length) {
            var qid = near[0].qid;
            var thumb2 = await wikidataToThumbUrl(qid);
            if (thumb2) {
              result.imageUrl = thumb2;
              // If we still have a generic name, use the WD label
              if (!result.name || result.name.indexOf("não identificado") !== -1) {
                result.name = near[0].label || result.name;
                result.source = (result.source || "") + " + Wikidata";
              }
            }
          }
        } catch (eWDN) {}
      }

      // 5) If still no photo, try Wikimedia Commons geosearch (file near point)
      if (!result.imageUrl) {
        try {
          var cimg = await commonsNearbyImage(lat, lon, 80);
          if (cimg) {
            result.imageUrl = cimg;
            result.source = (result.source || "") + " + Wikimedia";
          }
        } catch (eC) {}
      }

      // 6) Optional last resort: Google proxy (if user configured) for photo/name
      if (GOOGLE_PROXY_URL) {
        try {
          // Use proxy if we have no photo, or if we never identified a POI.
          if (!result.imageUrl || !result.name || result.name.indexOf("não identificado") !== -1) {
            var g = await googleProxyLookup(lat, lon);
            if (g) {
              if (g.name) result.name = g.name;
              if (g.address) result.address = g.address;
              if (g.photoUrl) result.imageUrl = g.photoUrl;
              if (g.sector) result.sector = g.sector;
              if (g.placeUrl) {
                // replace google maps link in UI later (kept in result)
                result.googlePlaceUrl = g.placeUrl;
              }
              result.source = "Google (proxy)";
            }
          }
        } catch (eG) {}
      }

      // Normalize text
      if (!result.name) result.name = "Estabelecimento de ensino (não identificado)";
      if (!result.address) result.address = "Endereço não encontrado automaticamente";
      if (!result.sector) result.sector = "Não informado";

      cache[ck] = result;
      delete inflight[ck];
      return result;
    })();

    return inflight[ck];
  }

  // --- UI ---
  function cardHtml(lat, lon, index) {
    var id = "q2w-enrich-" + index;
    return (
      '<div class="q2w-enrich-card" id="' + id + '" data-lat="' + lat + '" data-lon="' + lon + '">' +
        '<div class="q2w-enrich-top">' +
          '<div class="q2w-enrich-title">Estabelecimento de ensino</div>' +
          '<div class="q2w-enrich-sub">Buscando por instituição (raio ' + PRIMARY_RADIUS_M + 'm)…</div>' +
        '</div>' +
        '<div class="q2w-enrich-mid">' +
          '<div class="q2w-enrich-photo q2w-skeleton"></div>' +
          '<div class="q2w-enrich-meta">' +
            '<div class="q2w-enrich-line q2w-skeleton" style="width: 90%"></div>' +
            '<div class="q2w-enrich-line q2w-skeleton" style="width: 75%"></div>' +
            '<div class="q2w-enrich-line q2w-skeleton" style="width: 60%"></div>' +
          '</div>' +
        '</div>' +
        '<div class="q2w-enrich-bottom">' +
          '<a class="q2w-enrich-link" target="_blank" rel="noopener" href="https://www.google.com/maps?q=' + lat + ',' + lon + '">Abrir no Google Maps</a>' +
          '<span class="q2w-enrich-foot">•</span>' +
          '<span class="q2w-enrich-foot">coords: ' + lat.toFixed(6) + ', ' + lon.toFixed(6) + '</span>' +
        '</div>' +
      '</div>'
    );
  }

  // Exposed to qgis2web.js
  window.q2wBuildEnrichSection = function (points) {
    var html = '<div class="q2w-enrich-wrapper"><div class="q2w-enrich-section-title">Detalhes (automático)</div>';
    for (var j = 0; j < points.length; j++) {
      html += cardHtml(points[j].lat, points[j].lon, j);
    }
    html += '<div class="q2w-enrich-section-note">Procura um estabelecimento de ensino perto do ponto (começa em ' + PRIMARY_RADIUS_M + 'm e expande só se necessário). Se houver mais de um candidato, você pode escolher e o mapa lembra sua escolha neste navegador.</div>';
    if (!GOOGLE_PROXY_URL) {
      html += '<div class="q2w-enrich-section-note">Fotos: vêm de OSM/Wikidata/Wikimedia quando houver cadastro. Para fotos garantidas (como no Google Maps), é necessário configurar um proxy do Google Places.</div>';
    }
    html += '</div>';
    return html;
  };

  function fmtDist(d) {
    if (d === null || d === undefined) return "";
    if (d < 1) return "<1m";
    if (d < 1000) return Math.round(d) + "m";
    return (d / 1000).toFixed(2) + "km";
  }

  function attachCandidateHandlers(card, lat, lon) {
    var btns = card.querySelectorAll('.q2w-cand-btn');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.preventDefault();
          var t = btn.getAttribute('data-osmtype');
          var id = btn.getAttribute('data-osmid');
          if (!t || !id) return;
          saveSelection(lat, lon, t, id);
          clearPointCache(lat, lon);

          // show loading
          var subEl = card.querySelector('.q2w-enrich-sub');
          if (subEl) subEl.textContent = 'Aplicando seleção…';
          var photoEl = card.querySelector('.q2w-enrich-photo');
          if (photoEl) {
            photoEl.innerHTML = '';
            photoEl.classList.add('q2w-skeleton');
          }

          lookupEducation(lat, lon).then(function (info) {
            applyInfoToCard(card, info);
          });
        });
      })(btns[i]);
    }
  }

  function applyInfoToCard(card, info) {
    var titleEl = card.querySelector('.q2w-enrich-title');
    var subEl = card.querySelector('.q2w-enrich-sub');
    var photoEl = card.querySelector('.q2w-enrich-photo');
    var metaEl = card.querySelector('.q2w-enrich-meta');
    var gLink = card.querySelector('.q2w-enrich-link');

    if (titleEl) titleEl.textContent = info.name;

    var subParts = [];
    if (info.kind) subParts.push(info.kind);
    if (info.sector) subParts.push(info.sector);
    if (typeof info.distMeters === 'number') subParts.push('~' + fmtDist(info.distMeters));
    if (info.source) subParts.push(info.source);
    if (info.foundRadius) subParts.push('raio ' + info.foundRadius + 'm');
    if (subEl) subEl.textContent = subParts.join(' • ');

    if (gLink) {
      var url = (info.googlePlaceUrl ? info.googlePlaceUrl : ('https://www.google.com/maps?q=' + info.lat + ',' + info.lon));
      gLink.setAttribute('href', url);
    }

    // photo
    if (photoEl) {
      photoEl.classList.remove('q2w-skeleton');
      if (info.imageUrl) {
        photoEl.innerHTML = '<img alt="Foto" src="' + escapeHtml(info.imageUrl) + '" loading="lazy" />';
      } else {
        photoEl.innerHTML = '<div class="q2w-no-photo">Sem foto (fonte aberta)</div>';
      }
    }

    // meta
    if (metaEl) {
      var html = '';
      html += '<div class="q2w-meta-row"><span class="q2w-meta-label">Endereço:</span> ' + escapeHtml(info.address) + '</div>';

      if (info.osmUrl) {
        html += '<div class="q2w-meta-row"><span class="q2w-meta-label">OSM:</span> <a target="_blank" rel="noopener" href="' + escapeHtml(info.osmUrl) + '">ver no OpenStreetMap</a></div>';
      }
      if (info.wikidata) {
        html += '<div class="q2w-meta-row"><span class="q2w-meta-label">Wikidata:</span> <a target="_blank" rel="noopener" href="https://www.wikidata.org/wiki/' + escapeHtml(info.wikidata) + '">' + escapeHtml(info.wikidata) + '</a></div>';
      }

      // candidates (if multiple)
      if (info.candidates && info.candidates.length > 1) {
        html += '<div class="q2w-meta-row"><span class="q2w-meta-label">Próximas:</span>';
        html += '<div class="q2w-cands">';
        for (var i = 0; i < info.candidates.length; i++) {
          var c = info.candidates[i];
          var label = shortenName(c.name) + ' • ' + fmtDist(c.distMeters);
          html += '<button class="q2w-cand-btn" data-osmtype="' + escapeHtml(c.osmType) + '" data-osmid="' + escapeHtml(c.osmId) + '">' + escapeHtml(label) + '</button>';
        }
        html += '</div></div>';
        html += '<div class="q2w-meta-row q2w-meta-hint">Se a escola mostrada não for a correta, clique em uma opção acima. A escolha fica salva.</div>';
      }

      metaEl.innerHTML = html;
    }

    attachCandidateHandlers(card, info.lat, info.lon);
  }

  window.q2wEnrichAll = function () {
    var cards = document.querySelectorAll('.q2w-enrich-card');
    for (var i = 0; i < cards.length; i++) {
      (function (card) {
        var lat = parseFloat(card.getAttribute('data-lat'));
        var lon = parseFloat(card.getAttribute('data-lon'));
        if (isNaN(lat) || isNaN(lon)) return;

        lookupEducation(lat, lon).then(function (info) {
          applyInfoToCard(card, info);
        }).catch(function (err) {
          var subEl = card.querySelector('.q2w-enrich-sub');
          if (subEl) subEl.textContent = 'Falha ao buscar informações (veja o console).';
          // eslint-disable-next-line no-console
          console.error(err);
        });
      })(cards[i]);
    }
  };
})();
