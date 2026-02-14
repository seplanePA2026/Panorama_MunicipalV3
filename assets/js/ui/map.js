import { $ } from "../core/dom.js";
import { state } from "../core/state.js";
import { escapeHtml } from "../core/utils.js";

const ICON_EXPAND = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 3H3v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M3 3l7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M15 21h6v-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M21 21l-7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

const ICON_COMPACT = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 9H3V3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M3 3l7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M15 15h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M21 21l-7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

export function updateMapToggleIcon(){
  const b = $("btnToggleMap");
  if(!b) return;
  b.innerHTML = state.mapCompact ? ICON_EXPAND : ICON_COMPACT;
  b.setAttribute("title", state.mapCompact ? "Expandir mapa" : "Compactar mapa");
}

export function setMapCompact(compact){
  state.mapCompact = !!compact;
  const body = $("centerBody");
  if(body){
    if(state.mapCompact) body.classList.add("compact");
    else body.classList.remove("compact");
  }
  updateMapToggleIcon();
}

export function renderMapInfo(){
  const el = $("mapInfo");
  if(!el) return;
  const sel = state.mapSelection;
  if(!sel){
    el.innerHTML = `<b>Seleção no mapa</b><span>Clique em um setor/feição para ver detalhes.</span>`;
    return;
  }
  const setor = sel.CD_SETOR || sel.setor || sel.id || "";
  const pop = sel.v0001 || sel.pop || sel.POP || "";
  const dom = sel.v0007 || sel.dom || "";
  const area = sel.AREA_KM2 || sel.area_km2 || "";

  const parts = [];
  if(setor) parts.push(`Setor: ${setor}`);
  if(pop) parts.push(`População: ${pop}`);
  if(dom) parts.push(`Domicílios: ${dom}`);
  if(area) parts.push(`Área: ${area} km²`);
  el.innerHTML = `<b>Seleção no mapa</b><span>${escapeHtml(parts.join(" • ") || "Item selecionado.")}</span>`;
}

export function bindMapEvents(){
  window.addEventListener("message", (event) => {
    const data = event.data || {};
    if(!data || typeof data !== "object") return;

    if(data.type === "featureSelected" || data.type === "sectorSelected" || data.type === "bairroSelected"){
      state.mapSelection = data.payload || data;
      renderMapInfo();
    }
    if(data.type === "clearSelectionDone"){
      state.mapSelection = null;
      renderMapInfo();
    }
  });

  $("btnClearMap")?.addEventListener("click", () => {
    state.mapSelection = null;
    renderMapInfo();
    $("mapFrame")?.contentWindow?.postMessage({ type:"clearSelection" }, "*");
  });

  renderMapInfo();
  updateMapToggleIcon();
}
