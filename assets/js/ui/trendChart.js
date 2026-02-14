import { $ } from "../core/dom.js";
import { state } from "../core/state.js";
import { escapeHtml, fmtValue, lower, toNumber } from "../core/utils.js";
import { yearsForCurrentSelection } from "./timeline.js";
import { currentMetric, getValueFor } from "./metrics.js";
import { getGroups } from "./subtabs.js";

function seriesColor(i){
  if(i === 0) return "rgba(11,58,131,.92)"; // azul principal
  const k = i - 1;
  const hue = (28 + (k * 38)) % 360;
  return `hsla(${hue}, 92%, 52%, .92)`;
}

function sortYearLabels(arr){
  return arr.slice().sort((a,b)=>{
    const na = Number(a), nb = Number(b);
    if(Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

function makePoints(series, years, padL, padT, iw, ih, minV, range){
  return years.map((y, i) => {
    const raw = series[y];
    if(raw === null || raw === undefined) return null;
    const v = (typeof raw === "number") ? raw : (toNumber(raw) ?? null);
    if(v === null) return null;

    const x = padL + (iw * (years.length === 1 ? 0.5 : (i / (years.length - 1))));
    const yy = padT + ih * (1 - ((v - minV) / range));
    return { x, y: yy, label: String(y), value: raw };
  });
}

function pointsToPath(pts){
  let d = "";
  let started = false;
  for(const p of pts){
    if(!p){
      started = false;
      continue;
    }
    if(!started){
      d += `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
      started = true;
    }else{
      d += `L ${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
    }
  }
  return d.trim();
}

function renderLegendSingle(){
  const el = $("trendLegend");
  if(!el) return;
  const nm = state.baseName || "Paulo Afonso";
  el.innerHTML = `<span class="legendItem"><span class="dot" style="background: rgba(11,58,131,.55)"></span>${escapeHtml(nm)}</span>`;
}

function renderLegendMulti(names, colors){
  const el = $("trendLegend");
  if(!el) return;
  const nm = state.baseName || "Paulo Afonso";
  const items = names.map((n,i) => `
    <span class="legendItem"><span class="dot" style="background:${colors[i]}"></span>${escapeHtml(n)}</span>
  `).join("");
  el.innerHTML = `<span class="legendTitle">${escapeHtml(nm)}</span>${items}`;
}

export function renderTrendChart(){
  const box = $("trendChart");
  const tag = $("trendTag");
  const title = $("trendTitle");

  const sh = state.selectedSheet;
  if(!sh){
    if(box) box.innerHTML = `<div class="empty">Selecione uma categoria.</div>`;
    if(tag) tag.textContent = "—";
    renderLegendSingle();
    return;
  }

  const years = sortYearLabels(yearsForCurrentSelection());
  if(!years.length){
    if(box) box.innerHTML = `<div class="empty">Sem anos disponíveis.</div>`;
    if(tag) tag.textContent = "—";
    renderLegendSingle();
    return;
  }

  if(title) title.textContent = "Comparação por ano";

  const hasMulti = !!(sh.yearField && sh.groupField && state.selectedSubtab === "Geral" && (getGroups(sh).filter(g => g !== "Geral").length > 1));
  const measures = sh.measures || [];
  const measure = (state.selectedMeasure && measures.includes(state.selectedMeasure)) ? state.selectedMeasure : (measures[0] || null);
  if(measure && !state.selectedMeasure) state.selectedMeasure = measure;

  // === MODO GERAL: múltiplas linhas (parâmetros em cores diferentes) ===
  if(hasMulti){
    const groups = getGroups(sh).filter(g => g !== "Geral");
    const seriesNames = groups.slice(0, 10); // limite de sanidade (evita poluição)
    const colors = seriesNames.map((_,i) => seriesColor(i));

    const focusFromRow = (typeof state.selectedRowKey === 'string' && state.selectedRowKey.startsWith('g::')) ? (state.selectedRowKey.split('::')[1] || null) : null;
    const focusGroup = focusFromRow || state.highlightGroup || null;

    // Monta dados por série: {year -> value}
    const seriesMaps = seriesNames.map(g => {
      const m = {};
      for(const y of years){
        const v = getValueFor(sh, y, { type:"group", groupKey:g, measure: measure || (measures[0] || "") });
        if(v !== null && v !== undefined && String(v).trim() !== "") m[y] = v;
      }
      return m;
    });

    // Min/max global
    const allNums = [];
    for(const sm of seriesMaps){
      for(const y of years){
        const raw = sm[y];
        const n = (typeof raw === "number") ? raw : (toNumber(raw) ?? null);
        if(n !== null) allNums.push(n);
      }
    }

    if(!allNums.length){
      if(box) box.innerHTML = `<div class="empty">Sem valores para este indicador.</div>`;
      if(tag) tag.textContent = sh.name || "Geral";
      renderLegendMulti(seriesNames, colors);
      return;
    }

    const minData = Math.min(...allNums);
    let maxV = Math.max(...allNums);
    if(!Number.isFinite(maxV)) maxV = 1;
    // eixo Y sempre começa em 0 (melhor leitura para indicadores positivos)
    const minV = 0;
    const range = (maxV - minV) !== 0 ? (maxV - minV) : 1;

    const W = 420, H = 170;
    const padL = 40, padR = 14, padT = 16, padB = 28;
    const iw = W - padL - padR;
    const ih = H - padT - padB;

    const svgLines = seriesMaps.map((sm, i) => {
      const pts = makePoints(sm, years, padL, padT, iw, ih, minV, range);
      const d = pointsToPath(pts);
      if(!d) return "";

      const c = colors[i];
      const name = seriesNames[i];
      const isFocus = !!(focusGroup && name === focusGroup);
      const opacity = focusGroup ? (isFocus ? 1 : 0.28) : 1;
      const sw = isFocus ? 4.2 : 3;
      const r = isFocus ? 5.2 : 4.5;

      const circles = pts.filter(Boolean).map(p => `
        <circle class="linePoint" cx="${p.x}" cy="${p.y}" r="${r}" fill="${c}" stroke="white" stroke-width="2" opacity="${opacity}"
          data-tip-title="${escapeHtml(name)} • ${escapeHtml(p.label)}" data-tip-value="${escapeHtml(fmtValue(p.value))}"></circle>
      `).join("");

      return `
        <path d="${d}" fill="none" stroke="${c}" stroke-width="${sw}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>
        ${circles}
      `;
    }).join("");

    // Labels por ano: se poucos parâmetros, mostra mini-valores com cor; se muitos, só ano.
    const showValues = seriesNames.length <= 6;
    const labels = years.map(y => {
      if(!showValues){
        return `<div class="lineLbl"><div class="y">${escapeHtml(y)}</div></div>`;
      }
      const vals = seriesNames.map((g,i) => {
        const raw = seriesMaps[i][y];
        if(raw === null || raw === undefined || String(raw).trim() === "") return "";
        return `<div class="vItem"><span class="dot" style="background:${colors[i]}"></span>${escapeHtml(fmtValue(raw))}</div>`;
      }).filter(Boolean).join("");
      return `
        <div class="lineLbl">
          <div class="y">${escapeHtml(y)}</div>
          <div class="vList">${vals || `<span class="muted">—</span>`}</div>
        </div>
      `;
    }).join("");

    if(tag) tag.textContent = sh.name || "Geral";
    renderLegendMulti(seriesNames, colors);

    if(!box) return;
    box.innerHTML = `
      <div class="lineChartWrap">
        <svg class="lineSvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
          <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+ih}" stroke="rgba(11,58,131,.22)" stroke-width="2"/>
          <line x1="${padL}" y1="${padT+ih}" x2="${padL+iw}" y2="${padT+ih}" stroke="rgba(11,58,131,.22)" stroke-width="2"/>
          <text class="lineAxisText" x="8" y="${padT+12}">${escapeHtml(fmtValue(maxV))}</text>
          <text class="lineAxisText" x="8" y="${padT+ih}">${escapeHtml(fmtValue(minV))}</text>
          ${svgLines}
        </svg>

        <div class="lineLabels">
          ${labels}
        </div>
      </div>
    `;
    return;
  }

  // === MODO NORMAL: uma linha ===
  const metric = currentMetric();
  if(!metric){
    if(box) box.innerHTML = `<div class="empty">Selecione um indicador.</div>`;
    if(tag) tag.textContent = "—";
    renderLegendSingle();
    return;
  }

  let series = [];
  if(metric.type === "wide"){
    series = (sh.years || []).map(y => ({ label:String(y), value:getValueFor(sh, y, metric) }))
      .filter(p => p.value !== null && p.value !== undefined);
    if(tag) tag.textContent = metric.label || "Indicador";
  }else{
    series = years.map(y => ({ label:String(y), value:getValueFor(sh, y, metric) }))
      .filter(p => p.value !== null && p.value !== undefined);
    if(tag) tag.textContent = (metric.type === "group") ? (metric.groupKey || "Geral") : metric.measure;
  }

  if(!series.length){
    if(box) box.innerHTML = `<div class="empty">Sem valores para este indicador.</div>`;
    renderLegendSingle();
    return;
  }

  series.sort((a,b)=>{
    const na = Number(a.label), nb = Number(b.label);
    if(Number.isFinite(na) && Number.isFinite(nb)) return na-nb;
    return String(a.label).localeCompare(String(b.label));
  });

  const nums = series.map(p => (typeof p.value === "number" ? p.value : (toNumber(p.value) ?? 0)));
  const minData = Math.min(...nums);
  const max = Math.max(...nums);
  // eixo Y sempre começa em 0
  const min = 0;
  const range = (Number.isFinite(max - min) && (max - min) !== 0) ? (max - min) : 1;

  const W = 420, H = 170;
  const padL = 40, padR = 14, padT = 16, padB = 28;
  const iw = W - padL - padR;
  const ih = H - padT - padB;

  const pts = series.map((p,i)=>{
    const v = (typeof p.value === "number") ? p.value : (toNumber(p.value) ?? 0);
    const x = padL + (iw * (series.length === 1 ? 0.5 : (i / (series.length - 1))));
    const y = padT + ih * (1 - ((v - min) / range));
    return { x, y, label: p.label, value: p.value };
  });

  const poly = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  renderLegendSingle();

  if(!box) return;

  box.innerHTML = `
    <div class="lineChartWrap">
      <svg class="lineSvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT+ih}" stroke="rgba(11,58,131,.25)" stroke-width="2"/>
        <line x1="${padL}" y1="${padT+ih}" x2="${padL+iw}" y2="${padT+ih}" stroke="rgba(11,58,131,.25)" stroke-width="2"/>
        <text class="lineAxisText" x="8" y="${padT+12}">${escapeHtml(fmtValue(max))}</text>
        <text class="lineAxisText" x="8" y="${padT+ih}">${escapeHtml(fmtValue(min))}</text>
        <polyline points="${poly}" fill="none" stroke="rgba(11,58,131,.92)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        ${pts.map(p => `
          <circle class="linePoint" cx="${p.x}" cy="${p.y}" r="4.5" fill="rgba(11,58,131,.92)" stroke="white" stroke-width="2"
            data-tip-title="${escapeHtml(p.label)}" data-tip-value="${escapeHtml(fmtValue(p.value))}"></circle>
        `).join("")}
      </svg>

      <div class="lineLabels">
        ${series.map(p => `
          <div class="lineLbl">
            <div class="y">${escapeHtml(p.label)}</div>
            <div class="v">${escapeHtml(fmtValue(p.value))}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}
