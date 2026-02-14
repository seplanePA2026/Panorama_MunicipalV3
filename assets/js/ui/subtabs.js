import { $ } from "../core/dom.js";
import { state } from "../core/state.js";
import { norm, uniq } from "../core/utils.js";
import { filterBaseRows } from "../data/model.js";

export function getGroups(sh){
  if(!sh?.groupField) return ["Geral"];
  const gf = sh.groupField;
  const baseRows = filterBaseRows(sh, sh.rows);
  const src = (baseRows && baseRows.length) ? baseRows : sh.rows;
  const groups = uniq(src.map(r => norm(r[gf]))).filter(g => g !== "");
  return ["Geral", ...groups];
}

export function renderSubtabs(){
  const el = $("subTabs");
  if(!el) return;
  el.innerHTML = "";

  if(state.rightMode === "map"){
    el.style.display = "none";
    return;
  }
  el.style.display = "flex";

  if(!state.selectedSheet){
    el.innerHTML = `<span class="pill">Selecione uma aba</span>`;
    return;
  }

  const sh = state.selectedSheet;
  const groups = getGroups(sh);

  if(!state.selectedSubtab || !groups.includes(state.selectedSubtab)){
    state.selectedSubtab = (groups.length > 1) ? groups[1] : "Geral";
  }

  groups.forEach(g => {
    const b = document.createElement("button");
    b.className = "subtab" + (state.selectedSubtab === g ? " active" : "");
    b.textContent = g;
    b.onclick = () => {
      state.selectedSubtab = g;
      state.selectedRowKey = null;
      state.selectedYear = null;
      window.__gpRenderAll?.();
    };
    el.appendChild(b);
  });
}
