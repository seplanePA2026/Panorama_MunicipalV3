import { $ } from "../core/dom.js";
import { state } from "../core/state.js";
import { norm, sortYears } from "../core/utils.js";
import { filterBaseRows } from "../data/model.js";

export function yearsForCurrentSelection(){
  const sh = state.selectedSheet;
  if(!sh) return [];

  if(!sh.yearField){
    return sh.years || [];
  }

  const yf = sh.yearField;
  let rows = sh.rows.slice();
  rows = filterBaseRows(sh, rows);

  if(sh.groupField && state.selectedSubtab && state.selectedSubtab !== "Geral"){
    rows = rows.filter(r => norm(r[sh.groupField]) === norm(state.selectedSubtab));
  }
  return sortYears(rows.map(r => r[yf]));
}

export function renderTimeline(){
  const timeline = document.querySelector(".timeline");
  if(timeline){
    timeline.style.display = (state.rightMode === "map") ? "none" : "block";
  }

  if(state.rightMode === "map") return;

  const strip = $("yearsStrip");
  if(!strip) return;
  strip.innerHTML = "";

  if(!state.selectedSheet){
    strip.innerHTML = `<span class="muted">—</span>`;
    return;
  }

  const years = yearsForCurrentSelection();
  if(!years.length){
    strip.innerHTML = `<span class="muted">Sem anos detectáveis.</span>`;
    return;
  }

  if(!state.selectedYear || !years.includes(String(state.selectedYear))){
    state.selectedYear = years[years.length - 1];
  }

  years.forEach(y => {
    const b = document.createElement("div");
    b.className = "year" + (String(state.selectedYear) === String(y) ? " active" : "");
    b.textContent = y;
    b.onclick = () => {
      state.selectedYear = y;
      state.selectedRowKey = null;
      window.__gpRenderAll?.();
    };
    strip.appendChild(b);
  });
}
