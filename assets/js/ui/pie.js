import { $ } from "../core/dom.js";
import { state } from "../core/state.js";
import { escapeHtml, fmtValue, lower, norm, toNumber } from "../core/utils.js";
import { filterBaseRows } from "../data/model.js";
import { getGroups } from "./subtabs.js";
import { yearsForCurrentSelection } from "./timeline.js";
import { currentMetric, getValueFor } from "./metrics.js";

/**
 * Atualiza o painel lateral do mapa (antes era o gráfico em pizza).
 * Agora exibe a coluna "Explicação" da planilha, de forma automática.
 * Também preenche a barra de Projeções (compacta) quando houver série histórica suficiente.
 */
function findColLike(sh, needles){
  const cols = sh?.columns || [];
  for(const c of cols){
    const lc = lower(c);
    for(const n of needles){
      if(lc.includes(n)) return c;
    }
  }
  return null;
}

function chooseGroupForExplanation(sh){
  if(!sh?.groupField) return null;

  const groups = getGroups(sh).filter(g => g !== "Geral");
  if(!groups.length) return null;

  // Se estiver em "Geral", preferimos um grupo que tenha o mesmo nome da planilha (ex.: IDHM)
  const current = state.selectedSubtab;
  if(current && current !== "Geral") return current;

  const byName = groups.find(g => lower(g) === lower(sh.name)) || groups.find(g => lower(g).includes(lower(sh.name)));
  return byName || groups[0];
}

function renderExplanationHtml(raw){
  const txt = String(raw ?? "").trim();
  if(!txt) return "";

  const lines = txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  // Se parece com lista (• ou -), renderiza como bullets
  const isList = lines.some(l => /^([•\-–]|\d+\.)\s+/.test(l));
  if(!isList){
    return `<div class="expText">${escapeHtml(txt)}</div>`;
  }

  const items = lines.map(line => {
    line = line.replace(/^([•\-–]|\d+\.)\s+/, "").trim();
    // realça prefixos curtos "O que é:", "Como se mede:", etc.
    const m = line.match(/^(.{1,28}?):\s*(.+)$/);
    if(m){
      const k = escapeHtml(m[1] + ":");
      const v = escapeHtml(m[2]);
      return `<li><b>${k}</b> ${v}</li>`;
    }
    return `<li>${escapeHtml(line)}</li>`;
  });

  return `
    <div class="expText">
      <ul class="expList">
        ${items.join("")}
      </ul>
    </div>
  `;
}



function sortYearLabels(arr){
  return arr.slice().sort((a,b)=>{
    const na = Number(a), nb = Number(b);
    if(Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

function calcProjection(sh, metric){
  if(!sh || !metric) return null;

  const years = sortYearLabels(yearsForCurrentSelection());
  const pts = [];

  for(const y of years){
    const raw = getValueFor(sh, y, metric);
    const n = (typeof raw === "number") ? raw : (toNumber(raw) ?? null);
    const yy = Number(String(y).replace(/\.0$/,"")); // ex.: "2010.0"
    if(n === null || !Number.isFinite(yy)) continue;
    pts.push({ year: yy, value: n });
  }

  if(pts.length < 2) return null;
  pts.sort((a,b)=>a.year-b.year);

  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];

  const step = b.year - a.year;
  if(!(step > 0)) return null;

  const slope = (b.value - a.value) / step;  // variação por ano
  const nextYear = b.year + step;            // projeta para o próximo intervalo
  const proj = b.value + slope * step;       // tendência do último período
  const delta = proj - b.value;

  return { nextYear, proj, delta, baseYear: b.year, baseValue: b.value };
}

function applyProjectionUI(indLabel, proj){
  const bar = $("projBar");
  const lbl = $("projLbl");
  const val = $("projVal");
  const trend = $("projTrend");
  const expBox = $("expProj");

  // Não usamos mais o card abaixo da explicação
  if(expBox) expBox.style.display = "none";

  if(!bar || !lbl || !val || !trend) return;

  if(!proj){
    bar.style.display = "none";
    return;
  }

  const up = proj.delta >= 0;
  const arrow = up ? "▲" : "▼";
  const deltaTxt = fmtValue(Math.abs(proj.delta));
  const trendTxt = `${arrow} ${deltaTxt}`;

  bar.style.display = "flex";
  lbl.textContent = `${indLabel || "Indicador"} • Proj. ${proj.nextYear}`;
  val.textContent = fmtValue(proj.proj);

  trend.textContent = trendTxt;
  trend.classList.toggle("pos", up);
  trend.classList.toggle("neg", !up);
}


export function updatePieFromLastCompare(){
  const titleEl = $("pieTitle");
  const subEl = $("pieSub");
  const emptyEl = $("pieEmpty");
  const contentEl = $("expContent");

  const sh = state.selectedSheet;

  if(!contentEl || !titleEl || !subEl || !emptyEl){
    return;
  }

  titleEl.textContent = "Explicação";

  if(!sh){
    emptyEl.style.display = "block";
    emptyEl.textContent = "Selecione uma categoria para ver a explicação.";
    subEl.textContent = "—";
    contentEl.innerHTML = "";
    return;
  }

  const year = state.selectedYear;
  if(!year){
    emptyEl.style.display = "block";
    emptyEl.textContent = "Selecione um ano para ver a explicação.";
    subEl.textContent = "—";
    contentEl.innerHTML = "";
    return;
  }

  const expCol = findColLike(sh, ["explic", "descri", "observa"]);
  const fonteCol = findColLike(sh, ["fonte", "source"]);

  let indicadorLabel = null;
  let fonte = null;
  let exp = null;

  if(!sh.yearField){
    // formato wide
    const baseRows = filterBaseRows(sh, sh.rows);
    const idx = state.selectedRowKey?.startsWith("w::") ? Number(state.selectedRowKey.slice(3)) : 0;
    const row = baseRows[idx] || baseRows[0] || null;

    const indField = sh.wideIndicatorField;
    indicadorLabel = indField ? norm(row?.[indField]) : (sh.name || "Indicador");
    fonte = fonteCol ? norm(row?.[fonteCol]) : null;
    exp = expCol ? row?.[expCol] : null;
  }else{
    const yf = sh.yearField;
    let rows = filterBaseRows(sh, sh.rows).filter(r => String(r[yf]).trim() === String(year).trim());

    // escolhe grupo conforme seleção
    const g = chooseGroupForExplanation(sh);
    if(sh.groupField && g){
      rows = rows.filter(r => lower(r[sh.groupField]) === lower(g));
      indicadorLabel = g;
    }else{
      indicadorLabel = sh.name || "Indicador";
    }

    const row = rows[0] || null;
    fonte = fonteCol ? norm(row?.[fonteCol]) : null;
    exp = expCol ? row?.[expCol] : null;
  }

  if(!expCol){
    emptyEl.style.display = "block";
    emptyEl.textContent = "Coluna \"Explicação\" não encontrada nesta aba.";
    subEl.textContent = `${indicadorLabel || sh.name || "—"} • ${year}`;
    contentEl.innerHTML = "";
    return;
  }

  if(!exp || String(exp).trim() === ""){
    emptyEl.style.display = "block";
    emptyEl.textContent = "Sem texto de explicação para este item.";
    subEl.textContent = `${indicadorLabel || sh.name || "—"} • ${year}`;
    contentEl.innerHTML = "";
    return;
  }

  emptyEl.style.display = "none";
  subEl.textContent = `${indicadorLabel || sh.name || "—"} • ${year}`;

  const meta = [fonte ? `Fonte: ${fonte}` : null].filter(Boolean).join(" • ");

  contentEl.innerHTML = `
    <div class="expTop">
      <div class="expBadge">${escapeHtml(indicadorLabel || sh.name || "Indicador")}</div>
      <div class="expMeta">${escapeHtml(`Ano ${year}`)}${meta ? " • " + escapeHtml(meta) : ""}</div>
    </div>
    ${renderExplanationHtml(exp)}
  `;

  // === Projeções (barra azul + bloco na explicação) ===
  // Regra: usa a série histórica do indicador atual para estimar uma tendência simples (não oficial).
  try{
    let metric = currentMetric();
    if(metric && sh?.groupField && indicadorLabel){
      // quando estamos em "Geral" (multi), mantemos a projeção para o indicador do texto (ex.: IDHM)
      if(metric.type === "group") metric = { ...metric, groupKey: indicadorLabel };
    }
    const proj = calcProjection(sh, metric);
    applyProjectionUI(indicadorLabel || sh?.name || "Indicador", proj);
  }catch(_e){
    applyProjectionUI(indicadorLabel || sh?.name || "Indicador", null);
  }
}
