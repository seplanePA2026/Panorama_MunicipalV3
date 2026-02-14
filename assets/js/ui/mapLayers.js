import { $ } from "../core/dom.js";
import { state, MAP_SOURCES } from "../core/state.js";
import { escapeHtml, lower, stripAccents } from "../core/utils.js";

// Utilitários compartilhados para ler as camadas do mapa (iframe) e montar a lista "Todos".

function getMeta(){
  const meta = MAP_SOURCES[state.mapKey] || Object.values(MAP_SOURCES)[0];
  return meta || null;
}

export function getBasePath(){
  return getMeta()?.basePath || "";
}

export function getMapApi(){
  const iframe = $("mapFrame");
  const win = iframe?.contentWindow;
  if(!win) return null;
  const map = win.map;
  if(!map || typeof map.getLayers !== "function") return null;
  return { iframe, win, map };
}

export function fixLegendPaths(html){
  if(!html) return "";
  const base = getBasePath();
  return String(html)
    .replaceAll('src="styles/', `src="${base}styles/`)
    .replaceAll("src='styles/", `src='${base}styles/`)
    .replaceAll('src="resources/', `src="${base}resources/`)
    .replaceAll("src='resources/", `src='${base}resources/`);
}

function splitTitle(raw){
  const s = String(raw || "");
  const brIdx = s.search(/<br\s*\/?\s*>/i);
  if(brIdx === -1) return { nameHtml: s, legendHtml: "" };
  const nameHtml = s.slice(0, brIdx);
  let legendHtml = s.slice(brIdx);
  legendHtml = legendHtml.replace(/<br\s*\/?\s*>/i, "");
  return { nameHtml, legendHtml };
}

function humanize(text){
  return String(text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function flattenMapLayers(map){
  const out = [];
  const stack = [];
  try{ stack.push(...(map.getLayers()?.getArray?.() || [])); }catch{}
  while(stack.length){
    const layer = stack.shift();
    if(!layer) continue;
    const hasChildren = typeof layer.getLayers === "function" && layer.getLayers?.getArray;
    if(hasChildren){
      try{ stack.unshift(...(layer.getLayers().getArray() || [])); }catch{}
      continue;
    }
    out.push(layer);
  }
  return out;
}

function layerTitle(layer){
  try{
    return String(layer?.get?.("title") ?? layer?.get?.("name") ?? layer?.get?.("popuplayertitle") ?? "");
  }catch{ return ""; }
}

export function isBasemapCandidate(layer){
  const t = lower(humanize(layerTitle(layer)));
  let type = "";
  try{ type = String(layer?.get?.("type") || ""); }catch{}
  if(type === "base") return true;
  if(t.includes("osm") || t.includes("openstreetmap")) return true;
  if(t.includes("mapa base") || t.includes("basemap")) return true;
  return false;
}

export function findOsmBasemap(api){
  const all = flattenMapLayers(api.map);
  const candidates = all.filter(isBasemapCandidate);
  if(!candidates.length) return null;
  const osmStd = candidates.find(l => lower(humanize(layerTitle(l))).includes("osm standard"));
  return osmStd || candidates[0];
}

function safeOptionKey(titleText){
  const base = stripAccents(String(titleText || ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "opcao";
}

// Retorna as opções do mapa (exceto mapa base), com key estável por título.
// A key é deduplicada de forma determinística (base, base__2, base__3...).
export function buildMapOptions(api){
  if(!api) return [];
  const all = flattenMapLayers(api.map);
  const base = findOsmBasemap(api);

  const temp = [];
  for(let i=0;i<all.length;i++){
    const layer = all[i];
    if(!layer) continue;
    if(layer === base || isBasemapCandidate(layer)) continue;

    const rawTitle = layerTitle(layer);
    const fixedTitle = fixLegendPaths(rawTitle);
    const { nameHtml, legendHtml } = splitTitle(fixedTitle);
    const titleText = humanize(nameHtml || fixedTitle);
    if(!titleText) continue;

    temp.push({
      layer,
      titleText,
      titleHtml: escapeHtml(titleText),
      legendHtml: legendHtml || "",
      _order: i
    });
  }

  // Dedup de keys
  const counts = new Map();
  return temp.map(it => {
    const baseKey = safeOptionKey(it.titleText);
    const n = (counts.get(baseKey) || 0) + 1;
    counts.set(baseKey, n);
    const key = n === 1 ? baseKey : `${baseKey}__${n}`;
    return { ...it, key };
  });
}
