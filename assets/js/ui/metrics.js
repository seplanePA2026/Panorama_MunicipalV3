import { state } from "../core/state.js";
import { norm, toNumber } from "../core/utils.js";
import { getGroups } from "./subtabs.js";
import { filterBaseRows } from "../data/model.js";

export function currentMetric(){
  const sh = state.selectedSheet;
  if(!sh) return null;

  if(!sh.yearField){
    const idx = state.selectedRowKey?.startsWith("w::") ? Number(state.selectedRowKey.slice(3)) : 0;
    const indField = sh.wideIndicatorField;
    const baseRows = filterBaseRows(sh, sh.rows);
    const row = baseRows[idx] || baseRows[0];
    const label = indField ? norm(row?.[indField]) : "Indicador";
    return { type:"wide", rowIndex: idx, label };
  }

  const gf = sh.groupField;
  const measures = sh.measures || [];
  if(!measures.length) return null;

  if(gf){
    let groupKey = state.selectedSubtab;

    if(!groupKey || groupKey === "Geral"){
      const groups = getGroups(sh).filter(g => g !== "Geral");
      const clicked = norm(state.selectedRowKey || "");
      if(clicked && groups.includes(clicked)){
        groupKey = clicked;
      }else{
        groupKey = groups[0] || null;
      }
    }

    const measure =
      (state.selectedMeasure && measures.includes(state.selectedMeasure))
        ? state.selectedMeasure
        : measures[0];

    return { type:"group", groupKey, measure };
  }

  const measure =
    (state.selectedMeasure && measures.includes(state.selectedMeasure))
      ? state.selectedMeasure
      : measures[0];

  return { type:"measure", measure };
}

export function getValueFor(sh, year, metric, rowForWide=null){
  if(!sh || !metric || !year) return null;

  if(metric.type === "wide"){
    const baseRows = filterBaseRows(sh, sh.rows);
    const row = rowForWide ?? baseRows[metric.rowIndex] ?? baseRows[0];
    if(!row) return null;
    const v = row[String(year)];
    const n = toNumber(v);
    return n !== null ? n : (String(v).trim() ? v : null);
  }

  if(!sh.yearField) return null;
  const yf = sh.yearField;

  let rows = sh.rows.filter(r => String(r[yf]).trim() === String(year).trim());
  rows = filterBaseRows(sh, rows);

  if(sh.groupField && metric.type === "group" && metric.groupKey){
    rows = rows.filter(r => norm(r[sh.groupField]) === norm(metric.groupKey));
  }
  if(!rows.length) return null;

  const nums = rows.map(r => toNumber(r[metric.measure])).filter(v => v !== null);
  if(nums.length) return nums.length === 1 ? nums[0] : nums.reduce((a,b)=>a+b,0);

  return toNumber(rows[0][metric.measure]) ?? rows[0][metric.measure];
}
