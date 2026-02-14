import { $ } from "../core/dom.js";
import { escapeHtml } from "../core/utils.js";
import { state } from "../core/state.js";
import { buildCategoryKeyFromLabel, readCustomCategories, writeCustomCategories } from "./tabs.js";
import { deleteMapCategory, readMapCategories, upsertMapCategory } from "../core/mapCats.js";
import { buildMapOptions, getMapApi } from "./mapLayers.js";

const LS_BASEMAP = "gp_basemap_enabled_v1";

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

function showSettings(open){
  const ov = $("settingsOverlay");
  if(!ov) return;
  ov.style.display = open ? "flex" : "none";
  ov.setAttribute("aria-hidden", open ? "false" : "true");
  document.body.style.overflow = open ? "hidden" : "";
  if(!open) hideForm();
  if(!open) hideMapCatForm();
  if(open) renderCategoryList();
  if(open) {
    refreshMapOptionsCache();
    renderMapCategoryList();
  }
}

function hideForm(){
  $("catForm")?.style && ( $("catForm").style.display = "none" );
  const name = $("catName");
  if(name) name.value = "";
  const file = $("catIconFile");
  if(file) file.value = "";
  const nm = $("catIconName");
  if(nm) nm.textContent = "Nenhuma imagem";
  const prev = $("catIconPreview");
  if(prev){ prev.style.display = "none"; prev.innerHTML = ""; }
  delete window.__gpNewCatIcon;
}

// ===== Categorias do MAPA (somente Configurações) =====

let mapOptionsCache = [];
let mapOptionsCacheForKey = "";
let mapEditId = "";
let mapPickSelection = new Set();

function refreshMapOptionsCache(){
  const api = getMapApi();
  if(!api){
    mapOptionsCache = [];
    mapOptionsCacheForKey = state.mapKey;
    return;
  }
  mapOptionsCache = buildMapOptions(api);
  mapOptionsCacheForKey = state.mapKey;
}

function hideMapCatForm(){
  const form = $("mapCatForm");
  if(form) form.style.display = "none";
  const name = $("mapCatName");
  if(name) name.value = "";
  const file = $("mapCatIconFile");
  if(file) file.value = "";
  const nm = $("mapCatIconName");
  if(nm) nm.textContent = "Nenhuma imagem";
  const prev = $("mapCatIconPreview");
  if(prev){ prev.style.display = "none"; prev.innerHTML = ""; }
  const search = $("mapOptSearch");
  if(search) search.value = "";
  mapEditId = "";
  mapPickSelection = new Set();
  delete window.__gpNewMapCatIcon;
}

function showMapCatForm(){
  const form = $("mapCatForm");
  if(!form) return;
  form.style.display = "flex";
  renderMapOptPickList();
  $("mapCatName")?.focus();
}

function readSelectedMapCatIcon(){
  return typeof window.__gpNewMapCatIcon === "string" ? window.__gpNewMapCatIcon : "";
}

function pickMapCatIcon(){
  const f = $("mapCatIconFile");
  if(!f) return;
  f.value = "";
  f.click();
}

function onMapCatIconChosen(file){
  if(!file) return;
  const name = $("mapCatIconName");
  if(name) name.textContent = file.name || "imagem";
  const reader = new FileReader();
  reader.onload = () => {
    const url = String(reader.result || "");
    window.__gpNewMapCatIcon = url;
    const prev = $("mapCatIconPreview");
    if(prev){
      prev.style.display = "flex";
      prev.innerHTML = `<img alt="" src="${url}"><span class="muted">Pré-visualização</span>`;
    }
  };
  reader.readAsDataURL(file);
}

function renderMapOptPickList(){
  const box = $("mapOptPickList");
  if(!box) return;

  // Se o mapa mudou, refaz cache
  if(mapOptionsCacheForKey !== state.mapKey){
    refreshMapOptionsCache();
  }

  const q = String($("mapOptSearch")?.value || "").trim().toLowerCase();
  const options = mapOptionsCache.slice();
  const filtered = q ? options.filter(o => o.titleText.toLowerCase().includes(q)) : options;

  if(!options.length){
    box.innerHTML = `<div class="muted" style="font-weight:850;">Carregando opções do mapa…</div>`;
    return;
  }

  box.innerHTML = filtered.map(o => {
    const on = mapPickSelection.has(o.key);
    return `
      <label class="mapPickItem">
        <input type="checkbox" data-key="${escapeHtml(o.key)}" ${on ? "checked" : ""} />
        <span class="mapPickTxt" title="${escapeHtml(o.titleText)}">${escapeHtml(o.titleText)}</span>
      </label>
    `;
  }).join("");
}

function saveMapCategory(){
  const nm = String($("mapCatName")?.value || "").trim();
  if(!nm){
    $("mapCatName")?.focus();
    return;
  }

  const icon = readSelectedMapCatIcon();
  const optionKeys = Array.from(mapPickSelection);

  upsertMapCategory(state.mapKey, {
    id: mapEditId || "",
    label: nm,
    icon,
    optionKeys
  });

  hideMapCatForm();
  renderMapCategoryList();
  window.__gpRenderAll?.();
}

function editMapCategory(id){
  refreshMapOptionsCache();
  const cats = readMapCategories(state.mapKey);
  const c = cats.find(x => x.id === id);
  if(!c) return;

  mapEditId = c.id;
  mapPickSelection = new Set((c.optionKeys || []).filter(Boolean));
  const name = $("mapCatName");
  if(name) name.value = c.label;
  if(c.icon){
    window.__gpNewMapCatIcon = c.icon;
    const nm = $("mapCatIconName");
    if(nm) nm.textContent = "imagem";
    const prev = $("mapCatIconPreview");
    if(prev){
      prev.style.display = "flex";
      prev.innerHTML = `<img alt="" src="${c.icon}"><span class="muted">Pré-visualização</span>`;
    }
  }else{
    delete window.__gpNewMapCatIcon;
  }

  showMapCatForm();
  renderMapOptPickList();
}

function deleteMapCategoryUi(id, label){
  const name = String(label || "").trim() || "(sem nome)";
  const ok = confirm(`Tem certeza que deseja excluir a categoria do mapa "${name}"?\n\nIsso NÃO apaga dados do mapa — apenas a organização.`);
  if(!ok) return;
  deleteMapCategory(state.mapKey, id);
  renderMapCategoryList();
  window.__gpRenderAll?.();
}

function renderMapCategoryList(){
  const box = $("mapCatList");
  if(!box) return;

  const cats = readMapCategories(state.mapKey)
    .slice()
    .sort((a,b)=>a.label.localeCompare(b.label, "pt-BR"));

  if(!cats.length){
    box.innerHTML = `<div class="muted" style="font-weight:850;">Nenhuma categoria do mapa criada. A visualização usará apenas <b>Todos</b>.</div>`;
    return;
  }

  box.innerHTML = cats.map(c => {
    const img = c.icon
      ? `<img alt="" src="${c.icon}">`
      : `<div class="navBtn" style="width:28px;height:28px;border-radius:12px;opacity:.95;cursor:default;"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg></div>`;
    const count = Array.isArray(c.optionKeys) ? c.optionKeys.length : 0;
    return `
      <div class="catItem">
        <div class="meta">
          ${img}
          <div>
            <b>${escapeHtml(c.label)}</b>
            <span>${count} opções</span>
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="toolBtn sm btnEditMapCat" type="button" title="Editar" data-edit-map-cat="${escapeHtml(c.id)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/></svg>
          </button>
          <button class="toolBtn sm danger btnDelMapCat" type="button" title="Excluir" data-del-map-cat="${escapeHtml(c.id)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 16h10l1-16"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function showForm(){
  const form = $("catForm");
  if(!form) return;
  form.style.display = "flex";
  $("catName")?.focus();
}

function readSelectedIcon(){
  return typeof window.__gpNewCatIcon === "string" ? window.__gpNewCatIcon : "";
}

function pickIcon(){
  const f = $("catIconFile");
  if(!f) return;
  f.value = "";
  f.click();
}

function onIconChosen(file){
  if(!file) return;
  const name = $("catIconName");
  if(name) name.textContent = file.name || "imagem";
  const reader = new FileReader();
  reader.onload = () => {
    const url = String(reader.result || "");
    window.__gpNewCatIcon = url;
    const prev = $("catIconPreview");
    if(prev){
      prev.style.display = "flex";
      prev.innerHTML = `<img alt="" src="${url}"><span class="muted">Pré-visualização</span>`;
    }
  };
  reader.readAsDataURL(file);
}

function saveCategory(){
  const nm = String($("catName")?.value || "").trim();
  if(!nm){
    $("catName")?.focus();
    return;
  }

  const key = buildCategoryKeyFromLabel(nm);
  if(!key){
    $("catName")?.focus();
    return;
  }

  const existing = readCustomCategories();
  const icon = readSelectedIcon();
  const next = existing.filter(c => c.key !== key);
  next.push({ key, label: nm, icon });
  writeCustomCategories(next);

  window.__gpRefreshSideNav?.();
  hideForm();
  renderCategoryList();
}


function deleteCategory(key, label){
  const k = String(key || "").trim();
  if(!k) return;

  const name = String(label || k).trim();
  const ok = confirm(`Tem certeza que deseja excluir a categoria "${name}"?\n\nIsso removerá o botão do menu lateral. Os dados na planilha não serão apagados.`);
  if(!ok) return;

  const cats = readCustomCategories().filter(c => c.key !== k);
  writeCustomCategories(cats);

  window.__gpOnCustomCategoryDeleted?.(k);
  renderCategoryList();
}
function renderCategoryList(){
  const box = $("catList");
  if(!box) return;
  const cats = readCustomCategories();
  if(!cats.length){
    box.innerHTML = `<div class="muted" style="font-weight:850;">Nenhuma categoria personalizada criada.</div>`;
    return;
  }
  box.innerHTML = cats
    .slice()
    .sort((a,b)=>a.label.localeCompare(b.label, "pt-BR"))
    .map(c => {
      const img = c.icon ? `<img alt="" src="${c.icon}">` : `<div class="navBtn" style="width:28px;height:28px;border-radius:12px;opacity:.95;cursor:default;"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18"/><path d="M6 3h12"/><path d="M5 7v14h14V7"/></svg></div>`;
      return `
        <div class="catItem">
          <div class="meta">
            ${img}
            <div>
              <b>${escapeHtml(c.label)}</b>
              <span>Chave: ${escapeHtml(c.key)}</span>
            </div>
          </div>
          <button class="toolBtn sm danger btnDelCat" type="button" title="Excluir categoria" data-del="${escapeHtml(c.key)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 16h10l1-16"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        </div>
      `;
    })
    .join("");
}

export function bindSettings(){
  $("btnSettings")?.addEventListener("click", () => showSettings(true));
  $("btnCloseSettings")?.addEventListener("click", () => showSettings(false));

  // Toggle do mapa base (OSM)
  const baseToggle = $("toggleBaseMap");
  if(baseToggle){
    baseToggle.checked = readBasemapPref();
    baseToggle.addEventListener("change", () => {
      const enabled = !!baseToggle.checked;
      writeBasemapPref(enabled);
      try{ window.__gpToggleBaseMap?.(enabled); }catch(_e){}
    });
  }

  $("settingsOverlay")?.addEventListener("click", (e) => {
    if(e.target?.id === "settingsOverlay") showSettings(false);
  });

  $("btnAddCategory")?.addEventListener("click", showForm);
  $("btnCancelCategory")?.addEventListener("click", hideForm);
  $("btnSaveCategory")?.addEventListener("click", saveCategory);
  $("btnPickCatIcon")?.addEventListener("click", pickIcon);
  $("catIconFile")?.addEventListener("change", (e) => onIconChosen(e.target.files?.[0]));
  $("catList")?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".btnDelCat");
    if(!btn) return;
    const key = btn.getAttribute("data-del") || "";
    const cats = readCustomCategories();
    const cat = cats.find(c => c.key === key);
    deleteCategory(key, cat?.label);
  });

  // ===== Categorias do MAPA =====
  $("btnAddMapCategory")?.addEventListener("click", () => {
    refreshMapOptionsCache();
    mapEditId = "";
    mapPickSelection = new Set();
    delete window.__gpNewMapCatIcon;
    // Limpa campos
    const nm = $("mapCatName");
    if(nm) nm.value = "";
    const iconName = $("mapCatIconName");
    if(iconName) iconName.textContent = "Nenhuma imagem";
    const prev = $("mapCatIconPreview");
    if(prev){ prev.style.display = "none"; prev.innerHTML = ""; }
    showMapCatForm();
  });

  $("btnCancelMapCategory")?.addEventListener("click", hideMapCatForm);
  $("btnSaveMapCategory")?.addEventListener("click", saveMapCategory);
  $("btnPickMapCatIcon")?.addEventListener("click", pickMapCatIcon);
  $("mapCatIconFile")?.addEventListener("change", (e) => onMapCatIconChosen(e.target.files?.[0]));

  $("mapOptSearch")?.addEventListener("input", () => renderMapOptPickList());
  $("mapOptPickList")?.addEventListener("change", (e) => {
    const cb = e.target?.closest?.("input[type=checkbox][data-key]");
    if(!cb) return;
    const key = cb.getAttribute("data-key") || "";
    if(!key) return;
    if(cb.checked) mapPickSelection.add(key);
    else mapPickSelection.delete(key);
  });

  $("mapCatList")?.addEventListener("click", (e) => {
    const edit = e.target?.closest?.(".btnEditMapCat");
    if(edit){
      const id = edit.getAttribute("data-edit-map-cat") || "";
      if(id) editMapCategory(id);
      return;
    }
    const del = e.target?.closest?.(".btnDelMapCat");
    if(del){
      const id = del.getAttribute("data-del-map-cat") || "";
      if(!id) return;
      const cats = readMapCategories(state.mapKey);
      const c = cats.find(x => x.id === id);
      deleteMapCategoryUi(id, c?.label);
    }
  });

  // Quando o mapa carregar, atualiza a lista "Todos" (Configurações)
  $("mapFrame")?.addEventListener("load", () => {
    refreshMapOptionsCache();
    const ov = $("settingsOverlay");
    if(ov && ov.style.display !== "none"){
      renderMapCategoryList();
      if($("mapCatForm")?.style?.display !== "none"){
        renderMapOptPickList();
      }
    }
  });


  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape"){
      const ov = $("settingsOverlay");
      if(ov && ov.style.display !== "none") showSettings(false);
    }
  });
}
