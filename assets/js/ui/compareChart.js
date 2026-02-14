import { $ } from "../core/dom.js";
import { state } from "../core/state.js";
import { escapeHtml, fmtValue, lower, norm, toNumber } from "../core/utils.js";
import { currentMetric } from "./metrics.js";
import { filterBaseRows, isBaseRow } from "../data/model.js";
import { updatePieFromLastCompare } from "./pie.js";

export function renderCompareChart(){
  const box = $("compareChart");
  const tag = $("compareTag");
  const region = document.querySelector(".compareRegion");

  const sh = state.selectedSheet;
  const shouldShow = !!(state.mapCompact && state.rightMode !== "map" && sh && sh.hasMultiMunicipios);

  if(region) region.style.display = shouldShow ? "flex" : "none";

  if(!shouldShow){
    if(tag) tag.textContent = "";
    if(box) box.innerHTML = "";
    state.lastCompare = null;
    updatePieFromLastCompare();
    return;
  }

  const metric = currentMetric();
  if(!metric){
    if(tag) tag.textContent="Selecione um indicador";
    if(box) box.innerHTML = `<div class="empty">Selecione um indicador.</div>`;
    state.lastCompare = null;
    updatePieFromLastCompare();
    return;
  }

  const year = state.selectedYear;
  if(!year){
    if(tag) tag.textContent="Selecione um ano";
    if(box) box.innerHTML = `<div class="empty">Selecione um ano na timeline.</div>`;
    state.lastCompare = null;
    updatePieFromLastCompare();
    return;
  }

  const muniCol = sh.munNameField || sh.columns.find(c => lower(c).includes("municip"));
  const codeCol = sh.munCodeField;

  if(!muniCol && !codeCol){
    if(tag) tag.textContent="Sem coluna Município";
    if(box) box.innerHTML = `<div class="empty">Para comparativo, a aba precisa ter coluna de Município ou Code_Mun.</div>`;
    state.lastCompare = null;
    updatePieFromLastCompare();
    return;
  }

  let rows;
  if(sh.yearField){
    rows = sh.rows.filter(r => String(r[sh.yearField]).trim() === String(year).trim());
    if(sh.groupField && metric.type === "group" && metric.groupKey){
      rows = rows.filter(r => norm(r[sh.groupField]) === norm(metric.groupKey));
    }
  }else{
    rows = sh.rows.slice();
  }

  if(!rows.length){
    if(tag) tag.textContent="Sem dados no ano";
    if(box) box.innerHTML = `<div class="empty">Sem dados para este ano.</div>`;
    state.lastCompare = null;
    updatePieFromLastCompare();
    return;
  }

  let baseValue = null;
  if(sh.yearField){
    const baseRows = filterBaseRows(sh, rows);
    if(baseRows.length){
      const nums = baseRows.map(r => toNumber(r[metric.measure])).filter(v => v !== null);
      baseValue = nums.length ? (nums.length === 1 ? nums[0] : nums.reduce((a,b)=>a+b,0)) : null;
    }
  }else{
    const baseRows = filterBaseRows(sh, sh.rows);
    const row = baseRows[metric.rowIndex] || baseRows[0];
    baseValue = toNumber(row?.[String(year)]);
  }

  const map = new Map();
  for(const r of rows){
    const muni = muniCol ? (norm(r[muniCol]) || "—") : "—";
    const code = codeCol ? String(r[codeCol] ?? "").trim() : "";

    const isBase = isBaseRow(sh, r);
    if(isBase) continue;

    let v = null;
    if(sh.yearField){
      v = toNumber(r[metric.measure]);
    }else{
      v = toNumber(r[String(year)]);
    }
    if(v === null) continue;

    const key = muniCol ? muni : (code || "—");
    map.set(key, (map.get(key) || 0) + v);
  }

  const items = Array.from(map.entries()).map(([k,v]) => ({ label:k, value:v }));
  items.sort((a,b)=>b.value - a.value);

  const top5 = items.slice(0,5);

  if(!top5.length){
    if(tag) tag.textContent = `${(metric.type === "group" ? (metric.groupKey || "Geral") : (metric.label || metric.measure))} • ${year}`;
    state.lastCompare = null;
    updatePieFromLastCompare();
    if(box) box.innerHTML = `<div class="empty">Ainda não há dados de <b>outros municípios</b> para este indicador/ano nesta aba.</div>`;
    return;
  }

  const series = [];
  if(baseValue !== null && baseValue !== undefined){
    series.push({ label: state.baseName || "Município base", value: baseValue, color:"blue" });
  }
  top5.forEach(p => series.push({ label:p.label, value:p.value, color:"orange" }));

  if(tag) tag.textContent = `${(metric.type === "group" ? (metric.groupKey || "Geral") : (metric.label || metric.measure))} • ${year}`;

  state.lastCompare = { series, sub: tag ? tag.textContent : "" };
  updatePieFromLastCompare();

  const max = Math.max(...series.map(p => p.value));
  const safeMax = (Number.isFinite(max) && max !== 0) ? max : 1;
  if(!box) return;
  const htmlBars = series.map((p) => {
    const h = Math.max(6, Math.round((p.value / safeMax) * 100));
    const cls = (p.color === "blue") ? "blue" : "orange";
    const isPA = cls === "blue";
    return `
      <div class="barWrap ${isPA ? "isPA" : ""}" data-tip-title="${escapeHtml(p.label)}" data-tip-value="${escapeHtml(fmtValue(p.value))}">
        <div class="barCol">
          <div class="bar ${cls}" style="height:${h}%;">
            <div class="barInVal">${escapeHtml(fmtValue(p.value))}</div>
          </div>
        </div>
        <div class="barLabel">${escapeHtml(p.label)}</div>
      </div>
    `;
  }).join("");

  box.innerHTML = `
    <div class="bars">
      <div class="paRefLine" aria-hidden="true"></div>
      ${htmlBars}
    </div>
  `;

  // Ajusta a linha de referência para ficar alinhada ao topo da barra de Paulo Afonso
  const refreshRefLine = () => {
    const bars = box.querySelector(".bars");
    const line = box.querySelector(".paRefLine");
    const paBar = box.querySelector(".barWrap.isPA .bar");
    if(!bars || !line || !paBar) return;

    const br = bars.getBoundingClientRect();
    const pr = paBar.getBoundingClientRect();
    const topPx = Math.max(0, Math.round(pr.top - br.top));
    line.style.top = `${topPx}px`;
    line.style.display = "block";
  };

  requestAnimationFrame(refreshRefLine);

  // Mantém alinhado no resize sem duplicar listeners
  if(!box._paLineResizeHandler){
    box._paLineResizeHandler = () => {
      try { box._paLineRefresh && box._paLineRefresh(); } catch(_) {}
    };
    window.addEventListener("resize", box._paLineResizeHandler, { passive:true });
  }
  box._paLineRefresh = refreshRefLine;
}
