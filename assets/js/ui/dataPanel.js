import { $ } from "../core/dom.js";
import { state } from "../core/state.js";
import { escapeHtml, fmtValue, norm, uniq, toNumber } from "../core/utils.js";
import { filterBaseRows } from "../data/model.js";
import { renderTrendChart } from "./trendChart.js";
import { renderCompareChart } from "./compareChart.js";
import { updatePieFromLastCompare } from "./pie.js";
import { renderSubtabs, getGroups } from "./subtabs.js";
import { renderTimeline } from "./timeline.js";

function aggregateSum(rows, field){
  const nums = rows.map(r => toNumber(r[field])).filter(v => v !== null);
  if(nums.length) return nums.reduce((a,b)=>a+b,0);
  return null;
}

function buildIndicatorRowsForSelected(){
  const sh = state.selectedSheet;
  const y = state.selectedYear;
  if(!sh || !y) return [];

  if(!sh.yearField){
    const yearCol = (sh.measures || []).find(c => String(c).trim() === String(y).trim()) || String(y);
    const rows = filterBaseRows(sh, sh.rows);
    const indField = sh.wideIndicatorField;
    const out = [];
    for(let i=0; i<rows.length; i++){
      const r = rows[i];
      const label = indField ? norm(r[indField]) : `Linha ${i+1}`;
      const val = r[yearCol];
      if(String(val).trim() === "") continue;
      const key = `w::${i}`;
      out.push({ key, indicador: label || `Linha ${i+1}`, valor: val, active: state.selectedRowKey === key });
    }
    if(!state.selectedRowKey && out.length) state.selectedRowKey = out[0].key;
    return out;
  }

  const yf = sh.yearField;
  const gf = sh.groupField;
  const measures = sh.measures || [];
  if(!measures.length) return [];

  let rows = sh.rows.filter(r => String(r[yf]).trim() === String(y).trim());
  rows = filterBaseRows(sh, rows);

  if(!rows.length) return [];

  const out = [];

  if(!gf){
    const r0 = rows[0];
    for(const m of measures){
      const val = r0[m];
      if(String(val).trim() === "") continue;
      const key = `m::${m}`;
      out.push({ key, indicador: m, valor: val, active: (state.selectedRowKey ? state.selectedRowKey===key : m===state.selectedMeasure) });
    }
    if(!state.selectedRowKey && out.length){
      state.selectedRowKey = out[0].key;
      state.selectedMeasure = measures[0];
    }
    return out;
  }

  if(state.selectedSubtab === "Geral"){
    let measure = state.selectedMeasure;
    if(!measure || !measures.includes(measure)) measure = measures[0];
    state.selectedMeasure = measure;

    const groups = uniq(rows.map(r => norm(r[gf]))).filter(Boolean);
    for(const g of groups){
      const gr = rows.filter(r => norm(r[gf]) === g);
      const valNum = aggregateSum(gr, measure);
      const val = valNum !== null ? valNum : (gr[0]?.[measure] ?? "");
      const key = `g::${g}::${measure}`;
      out.push({ key, indicador: g, valor: (val === "" ? "—" : val), active: state.selectedRowKey === key });
    }
    out.sort((a,b)=> (toNumber(b.valor) ?? -1) - (toNumber(a.valor) ?? -1));
    if(!state.selectedRowKey && out.length) state.selectedRowKey = out[0].key;
    return out;
  }

  rows = rows.filter(r => norm(r[gf]) === norm(state.selectedSubtab));
  if(!rows.length) return [];

  if(measures.length === 1){
    const m = measures[0];
    const valNum = aggregateSum(rows, m);
    const val = valNum !== null ? valNum : (rows[0][m] ?? "—");
    out.push({ key:`g1::${state.selectedSubtab}::${m}`, indicador: state.selectedSubtab, valor: (val === "" ? "—" : val), active:true });
    state.selectedMeasure = m;
    state.selectedRowKey = out[0].key;
    return out;
  }

  const r0 = rows[0];
  let measure = state.selectedMeasure;
  if(!measure || !measures.includes(measure)) measure = measures[0];
  state.selectedMeasure = measure;

  for(const m of measures){
    const val = r0[m];
    if(String(val).trim() === "") continue;
    const key = `gm::${state.selectedSubtab}::${m}`;
    out.push({ key, indicador: m, valor: val, active: m === measure });
  }
  if(!state.selectedRowKey && out.length) state.selectedRowKey = out.find(r => r.active)?.key || out[0].key;
  return out;
}

export function renderDataPanel(){
  const panel = $("dataPanel");
  const hint = $("indicatorHint");

  if(!panel) return;

  if(state.rightMode === "map") return;

  if(!state.selectedSheet){
    panel.innerHTML = `<div class="empty">Selecione uma categoria.</div>`;
    $("rightTitle").textContent = "Dados";
    $("rightMeta").textContent = "—";
    if(hint) hint.textContent = "Clique em um indicador para atualizar o gráfico";
    return;
  }

  $("rightTitle").textContent = state.selectedSheet.name;
  const meta = [state.selectedSubtab || "Geral", state.selectedYear ? String(state.selectedYear) : null].filter(Boolean).join(" • ");
  $("rightMeta").textContent = meta || "—";

  const rows = buildIndicatorRowsForSelected();
  if(!rows.length){
    panel.innerHTML = `<div class="empty">Sem dados para o ano/aba selecionado.</div>`;
    if(hint) hint.textContent = "Sem indicadores disponíveis";
    return;
  }

  if(hint) hint.textContent = `${rows.length} itens • clique para atualizar o gráfico`;

  panel.innerHTML = `
    <table>
      <thead><tr><th>Indicador</th><th style="text-align:right">Valor</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr class="${r.active ? "active" : ""}" data-key="${escapeHtml(r.key)}">
            <td><div class="indCell"><span class="indTxt">${escapeHtml(r.indicador)}</span><span class="indChev">›</span></div></td>
            <td style="text-align:right">${escapeHtml(fmtValue(r.valor))}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  `;

  panel.querySelectorAll("tr[data-key]").forEach(tr => {
    tr.addEventListener("click", () => {
      const key = tr.getAttribute("data-key");
      state.selectedRowKey = key;

      if(key?.startsWith("g::")){
        const parts = key.split("::");
        const group = parts[1] || null;
        const measure = parts[2] || null;

        // Em "Geral" não deve sair do Geral ao clicar nos indicadores.
        // Apenas focamos/realçamos a série no gráfico inferior.
        state.highlightGroup = group;
        if(measure) state.selectedMeasure = measure;
      }
      if(key?.startsWith("m::")){
        state.selectedMeasure = key.slice(3);
      }
      if(key?.startsWith("gm::")){
        const parts = key.split("::");
        if(parts[2]) state.selectedMeasure = parts[2];
      }

      renderTrendChart();
      renderCompareChart();
      updatePieFromLastCompare();
      renderDataPanel();
      renderSubtabs();
      renderTimeline();
    });
  });
}
