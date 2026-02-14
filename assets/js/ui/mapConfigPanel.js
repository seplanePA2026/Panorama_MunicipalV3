import { $ } from "../core/dom.js";
import { state } from "../core/state.js";
import { escapeHtml } from "../core/utils.js";
import { readMapCategories } from "../core/mapCats.js";
import { buildMapOptions, getMapApi, flattenMapLayers, findOsmBasemap, isBasemapCandidate } from "./mapLayers.js";

const HIDE_STYLE_ID = "__gp_hide_layer_switcher";
const LS_BASEMAP = "gp_basemap_enabled_v1";

const TODOS_ID = "__todos__";

let activeCategoryId = TODOS_ID;

function readBasemapPref(){
  try{
    const raw = localStorage.getItem(LS_BASEMAP);
    if(raw === null) return true;
    return raw === "1" || raw === "true";
  }catch{ return true; }
}

function writeBasemapPref(enabled){
  try{ localStorage.setItem(LS_BASEMAP, enabled ? "1" : "0"); }catch{}
}

function ensureLayerSwitcherHidden(){
  try{
    const api = getMapApi();
    if(!api?.iframe?.contentDocument) return;
    const doc = api.iframe.contentDocument;
    if(doc.getElementById(HIDE_STYLE_ID)) return;
    const st = doc.createElement("style");
    st.id = HIDE_STYLE_ID;
    st.textContent = `.layer-switcher{ display:none !important; }`;
    doc.head.appendChild(st);
  }catch{}
}

function normalizeInitialLayerVisibility(api){
  // Regra: abrir com nada marcado (exceto OSM Standard conforme preferência)
  const win = api?.win;
  if(win && win.__gpNormalizedMapKey === state.mapKey) return;
  if(win) win.__gpNormalizedMapKey = state.mapKey;

  const all = flattenMapLayers(api.map);
  const base = findOsmBasemap(api);
  const baseEnabled = readBasemapPref();

  for(const layer of all){
    try{
      if(layer === base){
        layer.setVisible?.(!!baseEnabled);
        continue;
      }
      if(isBasemapCandidate(layer)){
        layer.setVisible?.(false);
        continue;
      }
      layer.setVisible?.(false);
    }catch{}
  }

  const t = $("toggleBaseMap");
  if(t) t.checked = !!baseEnabled;

  setBasemapEnabled(!!baseEnabled, api);
}

function setBasemapEnabled(enabled, apiOverride){
  const api = apiOverride || getMapApi();
  if(!api) return;
  const base = findOsmBasemap(api);
  if(base){
    try{ base.setVisible?.(!!enabled); }catch{}
  }
  try{
    const doc = api.win.document;
    const mapEl = doc.getElementById("map") || doc.body;
    if(mapEl) mapEl.style.background = enabled ? "" : "#fff";
    doc.documentElement.style.background = enabled ? "" : "#fff";
    doc.body.style.background = enabled ? "" : "#fff";
    if(api.iframe) api.iframe.style.background = enabled ? "" : "#fff";
  }catch{}
  writeBasemapPref(!!enabled);
}

function cssEscape(val){
  const s = String(val || "");
  if(typeof window !== "undefined" && window.CSS && typeof window.CSS.escape === "function"){
    return window.CSS.escape(s);
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function getCategoriesForUi(){
  const custom = readMapCategories(state.mapKey)
    .slice()
    .sort((a,b)=>a.label.localeCompare(b.label, "pt-BR"));

  const todos = {
    id: TODOS_ID,
    label: "Todos",
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>`,
    optionKeys: []
  };

  return [todos, ...custom];
}

function ensureActiveCategory(categories){
  if(categories.some(c => c.id === activeCategoryId)) return;
  activeCategoryId = TODOS_ID;
}

function getVisibleOptions(options){
  return options.filter(it => {
    try{ return !!it.layer.getVisible?.(); }catch{ return false; }
  });
}

function renderActiveChips(options){
  const wrap = $("mapActiveChips");
  const empty = $("mapActiveEmpty");
  if(!wrap) return;

  const visible = getVisibleOptions(options);
  if(!visible.length){
    wrap.innerHTML = "";
    if(empty) empty.style.display = "block";
    return;
  }
  if(empty) empty.style.display = "none";

  wrap.innerHTML = visible.map(it => {
    return `
      <button class="chip" type="button" data-key="${escapeHtml(it.key)}" title="Clique para localizar / Remover">
        <span class="chipTxt">${escapeHtml(it.titleText)}</span>
        <span class="chipX" aria-label="Remover">✕</span>
      </button>
    `;
  }).join("");
}

function renderCategoryGrid(categories){
  const grid = $("mapCatGrid");
  if(!grid) return;

  grid.innerHTML = categories.map(c => {
    const active = c.id === activeCategoryId;
    const ico = c.icon
      ? (c.icon.trim().startsWith("<") ? c.icon : `<img alt="" src="${c.icon}">`)
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>`;
    return `
      <button class="catBtn ${active ? "active" : ""}" type="button" data-cat-id="${escapeHtml(c.id)}" aria-pressed="${active ? "true" : "false"}">
        <span class="catIco" aria-hidden="true">${ico}</span>
        <span class="catLbl">${escapeHtml(c.label)}</span>
      </button>
    `;
  }).join("");
}

function subsetForCategory(options, category){
  if(!category) return [];
  if(category.id === TODOS_ID) return options;
  const set = new Set(category.optionKeys || []);
  return options.filter(o => set.has(o.key));
}

function renderOptions(options, categories){
  const title = $("mapOptTitle");
  const meta = $("mapOptMeta");
  const list = $("mapOptList");
  if(!list) return;

  const cat = categories.find(c => c.id === activeCategoryId) || categories[0];
  const subset = subsetForCategory(options, cat);

  if(title) title.textContent = cat?.label || "Camadas";
  if(meta) meta.textContent = `${subset.length} opções`;

  if(!subset.length){
    list.innerHTML = `<div class="empty">Nenhuma opção nesta categoria.</div>`;
    return;
  }

  list.innerHTML = subset.map(it => {
    const on = !!it.layer.getVisible?.();
    const legend = (it.legendHtml && on) ? `<div class="optLegend">${it.legendHtml}</div>` : "";
    return `
      <div class="optItem" data-key="${escapeHtml(it.key)}">
        <label class="optRow">
          <input type="checkbox" data-key="${escapeHtml(it.key)}" ${on ? "checked" : ""} />
          <div class="optTxt">
            <div class="optName">${it.titleHtml}</div>
            <div class="optSub">${on ? "Visível" : "Oculta"}</div>
          </div>
        </label>
        ${legend}
      </div>
    `;
  }).join("");
}

function focusItemInList(key){
  const list = $("mapOptList");
  if(!list) return;
  const el = list.querySelector(`.optItem[data-key="${cssEscape(key)}"]`);
  if(!el) return;
  try{ el.scrollIntoView({ behavior: "smooth", block: "center" }); }catch{ el.scrollIntoView(); }
  el.classList.add("flash");
  window.setTimeout(() => el.classList.remove("flash"), 900);
}

function attachHandlers(options, categories){
  const grid = $("mapCatGrid");
  const chips = $("mapActiveChips");
  const list = $("mapOptList");

  grid?.addEventListener("click", (e) => {
    const btn = e.target.closest?.(".catBtn");
    if(!btn) return;
    const id = btn.getAttribute("data-cat-id") || "";
    if(!id) return;
    activeCategoryId = id;
    renderCategoryGrid(categories);
    renderOptions(options, categories);
  });

  chips?.addEventListener("click", (e) => {
    const chip = e.target.closest?.(".chip");
    if(!chip) return;
    const key = chip.getAttribute("data-key") || "";
    const item = options.find(o => o.key === key);
    if(!item) return;

    if(e.target.closest?.(".chipX")){
      try{ item.layer.setVisible?.(false); }catch{}
      renderActiveChips(options);
      renderOptions(options, categories);
      return;
    }

    // Abrir em "Todos" para garantir que o item exista na lista.
    activeCategoryId = TODOS_ID;
    renderCategoryGrid(categories);
    renderOptions(options, categories);
    window.requestAnimationFrame(() => focusItemInList(key));
  });

  list?.addEventListener("change", (e) => {
    const cb = e.target.closest?.("input[type=checkbox]");
    if(!cb) return;
    const key = cb.getAttribute("data-key") || "";
    const item = options.find(o => o.key === key);
    if(!item) return;
    try{ item.layer.setVisible?.(!!cb.checked); }catch{}
    renderActiveChips(options);
    renderOptions(options, categories);
    if(cb.checked){
      window.requestAnimationFrame(() => focusItemInList(key));
    }
  });
}

function renderNewMapPanel(api){
  const panel = $("mapConfigPanel");
  if(!panel) return;

  normalizeInitialLayerVisibility(api);

  // Callback global para o toggle no Settings
  window.__gpToggleBaseMap = (enabled) => setBasemapEnabled(enabled);

  const options = buildMapOptions(api);
  const categories = getCategoriesForUi();
  ensureActiveCategory(categories);

  panel.innerHTML = `
    <div class="mapCfg">
      <div class="mapActive">
        <div class="mapActiveHead">
          <b>Seleções ativas</b>
          <span class="muted">camadas visíveis no mapa</span>
        </div>
        <div class="mapActiveChips" id="mapActiveChips"></div>
        <div class="mapActiveEmpty muted" id="mapActiveEmpty">Nenhuma seleção ativa.</div>
      </div>

      <div class="mapCats">
        <div class="section-title" style="margin:0 0 8px;">Categorias</div>
        <div class="mapCatGrid" id="mapCatGrid"></div>
      </div>

      <div class="mapOptions">
        <div class="mapOptHead">
          <b id="mapOptTitle">—</b>
          <span class="pill" id="mapOptMeta">—</span>
        </div>
        <div class="mapOptList" id="mapOptList"></div>
      </div>
    </div>
  `;

  renderActiveChips(options);
  renderCategoryGrid(categories);
  renderOptions(options, categories);
  attachHandlers(options, categories);
}

export function renderMapConfigPanel(){
  const dataWrap = $("rightDataMode");
  const mapWrap = $("rightMapMode");

  if(state.rightMode === "map"){
    if(dataWrap) dataWrap.style.display = "none";
    if(mapWrap) mapWrap.style.display = "flex";

    const rt = $("rightTitle");
    const rm = $("rightMeta");
    if(rt) rt.textContent = "Mapa";
    if(rm) rm.textContent = "Camadas";

    const meta = $("mapCfgMeta");
    if(meta) meta.textContent = "Seleções por categoria";

    const api = getMapApi();
    if(!api){
      const panel = $("mapConfigPanel");
      if(panel) panel.innerHTML = `<div class="empty">Carregando mapa…</div>`;
      return;
    }

    ensureLayerSwitcherHidden();
    renderNewMapPanel(api);
  }else{
    if(mapWrap) mapWrap.style.display = "none";
    if(dataWrap) dataWrap.style.display = "flex";
  }
}

export function bindMapConfig(){
  const iframe = $("mapFrame");
  if(!iframe) return;

  iframe.addEventListener("load", () => {
    ensureLayerSwitcherHidden();

    const api = getMapApi();
    if(api){
      // força normalização a cada reload real do iframe
      try{ api.win.__gpNormalizedMapKey = ""; }catch{}
      normalizeInitialLayerVisibility(api);
    }

    if(state.rightMode === "map"){
      renderMapConfigPanel();
    }
  });
}
