import { $ } from "../core/dom.js";
import { state, MAP_SOURCES } from "../core/state.js";
import { renderMapInfo } from "./map.js";

const DEFAULT_KEY = Object.keys(MAP_SOURCES)[0] || "unificado";

function getMeta(key){
  return MAP_SOURCES[key] || MAP_SOURCES[DEFAULT_KEY];
}

export function setActiveMap(key, opts = {}){
  const meta = getMeta(key);
  if(!meta) return;

  const nextKey = meta.key;
  const changed = state.mapKey !== nextKey;
  state.mapKey = nextKey;

  document.querySelectorAll("#mapKind .mapKindBtn").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-map") === nextKey);
  });

  renderMapKindToggle();

  const iframe = $("mapFrame");
  if(iframe){
    const desired = meta.src;
    const cur = iframe.getAttribute("src") || "";
    if(opts.forceReload || cur !== desired){
      iframe.setAttribute("src", desired);
    }
  }

  if(changed){
    state.mapSelection = null;
    renderMapInfo();

    const panel = $("mapConfigPanel");
    if(panel && state.rightMode === "map"){
      panel.innerHTML = `<div class="empty">Carregando camadas do mapa…</div>`;
    }
  }
}

export function renderMapKindToggle(){
  const wrap = $("mapKind");
  if(!wrap) return;
  // Com mapa único (unificado), escondemos o seletor.
  wrap.style.display = "none";
}

export function bindMapKind(){
  // Sempre garante que o iframe carregue o mapa atual.
  setActiveMap(state.mapKey || DEFAULT_KEY, { forceReload: false });

  const wrap = $("mapKind");
  if(!wrap) return;

  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".mapKindBtn");
    if(!btn) return;
    const key = btn.getAttribute("data-map");
    if(!key) return;
    setActiveMap(key);
  });

  renderMapKindToggle();
}
