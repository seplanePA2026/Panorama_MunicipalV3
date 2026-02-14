// Categorias do MAPA (camadas/opções)
// Persistência via localStorage, para manter após recarregar/fechar/abrir.

import { stripAccents } from "./utils.js";

const LS_MAP_CATS = "gp_map_categories_v1";

function safeParse(json){
  try{ return JSON.parse(String(json || "")); }catch{ return null; }
}

function readRoot(){
  try{
    const raw = localStorage.getItem(LS_MAP_CATS);
    const obj = safeParse(raw);
    if(!obj || typeof obj !== "object") return { v: 1, maps: {} };
    if(!obj.maps || typeof obj.maps !== "object") obj.maps = {};
    obj.v = 1;
    return obj;
  }catch{
    return { v: 1, maps: {} };
  }
}

function writeRoot(root){
  try{ localStorage.setItem(LS_MAP_CATS, JSON.stringify(root)); }catch{}
}

function genId(){
  try{
    if(typeof crypto !== "undefined" && crypto?.randomUUID) return crypto.randomUUID();
  }catch{}
  return `cat_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function safeKeyFromLabel(label){
  const s = String(label || "").trim();
  if(!s) return "";
  const base = stripAccents(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "cat";
}

export function readMapCategories(mapKey){
  const key = String(mapKey || "").trim() || "unificado";
  const root = readRoot();
  const node = root.maps?.[key];
  const arr = Array.isArray(node?.categories) ? node.categories : [];
  return arr
    .map(c => ({
      id: String(c?.id || "").trim() || genId(),
      label: String(c?.label || "").trim(),
      icon: typeof c?.icon === "string" ? c.icon : "",
      optionKeys: Array.isArray(c?.optionKeys) ? c.optionKeys.map(x => String(x || "").trim()).filter(Boolean) : []
    }))
    .filter(c => c.label);
}

export function writeMapCategories(mapKey, categories){
  const key = String(mapKey || "").trim() || "unificado";
  const root = readRoot();
  if(!root.maps) root.maps = {};

  const safe = Array.isArray(categories) ? categories : [];
  root.maps[key] = {
    categories: safe.map(c => ({
      id: String(c?.id || "").trim() || genId(),
      label: String(c?.label || "").trim(),
      icon: typeof c?.icon === "string" ? c.icon : "",
      optionKeys: Array.isArray(c?.optionKeys) ? c.optionKeys.map(x => String(x || "").trim()).filter(Boolean) : []
    })).filter(c => c.label)
  };

  writeRoot(root);
}

export function upsertMapCategory(mapKey, payload){
  const cats = readMapCategories(mapKey);
  const id = String(payload?.id || "").trim();
  const label = String(payload?.label || "").trim();
  if(!label) return null;

  const icon = typeof payload?.icon === "string" ? payload.icon : "";
  const optionKeys = Array.isArray(payload?.optionKeys) ? payload.optionKeys.map(x => String(x || "").trim()).filter(Boolean) : [];

  let next;
  if(id){
    next = cats.map(c => (c.id === id ? { ...c, label, icon, optionKeys } : c));
  }else{
    next = cats.slice();
    next.push({ id: genId(), label, icon, optionKeys });
  }
  writeMapCategories(mapKey, next);
  return next;
}

export function deleteMapCategory(mapKey, id){
  const cid = String(id || "").trim();
  if(!cid) return;
  const cats = readMapCategories(mapKey).filter(c => c.id !== cid);
  writeMapCategories(mapKey, cats);
}
