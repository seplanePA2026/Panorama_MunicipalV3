import { norm, lower, uniq, canonCategory } from "../core/utils.js";
import {
  sheetToRows,
  guessYearField,
  guessGroupField,
  guessCategoryField,
  guessMunNameField,
  guessMunCodeField,
  detectYears,
  detectNumericMeasureColumns,
  detectIndicatorFieldForWide,
  normalizeCategoryKey
} from "./xlsx.js";
import { state } from "../core/state.js";

export function buildModelFromWorkbook(wb){
  const sheets = wb.SheetNames.map(name => {
    const ws = wb.Sheets[name];
    const parsed = sheetToRows(ws);
    const sh = {
      name,
      rows: parsed.rows,
      columns: parsed.columns,
      yearField: null,
      groupField: null,
      categoryField: null,
      categoryRaw: null,
      categoryKey: null,
      munNameField: null,
      munCodeField: null,
      years: [],
      measures: [],
      wideIndicatorField: null,
      hasMultiMunicipios: false
    };

    sh.yearField = guessYearField(sh.columns);
    sh.groupField = guessGroupField(sh.columns);
    sh.categoryField = guessCategoryField(sh.columns);

    if(sh.categoryField){
      const cats = uniq(sh.rows.map(r => norm(r[sh.categoryField]))).filter(Boolean);
      sh.categoryRaw = cats[0] || null;
      sh.categoryKey = normalizeCategoryKey(sh.categoryRaw);
    }else{
      sh.categoryKey = "outros";
    }

    sh.munNameField = guessMunNameField(sh.columns) || sh.columns.find(c => lower(c).includes("municip"));
    sh.munCodeField = guessMunCodeField(sh.columns);

    sh.years = detectYears(sh);

    if(sh.yearField){
      sh.measures = detectNumericMeasureColumns(sh);
    }else{
      sh.measures = sh.years.slice();
      sh.wideIndicatorField = detectIndicatorFieldForWide(sh);
    }

    const muniCol = sh.munNameField;
    const codeCol = sh.munCodeField;
    const muniSet = new Set();
    if(muniCol){
      for(const r of sh.rows){
        const nm = lower(r[muniCol]);
        if(nm) muniSet.add(nm);
        if(muniSet.size > 2) break;
      }
    }
    const codeSet = new Set();
    if(codeCol){
      for(const r of sh.rows){
        const cd = String(r[codeCol] ?? "").trim();
        if(cd) codeSet.add(cd);
        if(codeSet.size > 2) break;
      }
    }
    sh.hasMultiMunicipios = (muniSet.size > 1) || (codeSet.size > 1);

    return sh;
  });

  return { sheets };
}

export function detectBaseMunicipality(model){
  for(const sh of model.sheets){
    const nameCol = sh.munNameField;
    const codeCol = sh.munCodeField;
    if(!nameCol) continue;
    for(const r of sh.rows.slice(0,300)){
      const nm = lower(r[nameCol]);
      if(nm.includes("paulo afonso")){
        const code = codeCol ? String(r[codeCol] ?? "").trim() : null;
        return { name: norm(r[nameCol]) || "Paulo Afonso", code: code || null };
      }
    }
  }
  for(const sh of model.sheets){
    const nameCol = sh.munNameField;
    const codeCol = sh.munCodeField;
    if(!nameCol) continue;
    for(const r of sh.rows){
      const nm = norm(r[nameCol]);
      if(nm){
        const code = codeCol ? String(r[codeCol] ?? "").trim() : null;
        return { name: nm, code: code || null };
      }
    }
  }
  return { name: "Paulo Afonso", code: "2924009" };
}

export function isBaseRow(sh, r){
  const codeCol = sh.munCodeField;
  const nameCol = sh.munNameField;

  if(codeCol && state.baseCode){
    const rc = String(r[codeCol] ?? "").trim();
    if(rc && rc === String(state.baseCode).trim()) return true;
  }
  if(nameCol && state.baseNameLower){
    const rn = lower(r[nameCol]);
    if(rn && rn.includes(state.baseNameLower)) return true;
  }
  if(!codeCol && !nameCol) return true;
  return false;
}

export function filterBaseRows(sh, rows){
  if(!sh.munNameField && !sh.munCodeField) return rows;

  if(sh.munCodeField && state.baseCode){
    const has = rows.some(r => String(r[sh.munCodeField] ?? "").trim() === String(state.baseCode).trim());
    if(has) return rows.filter(r => String(r[sh.munCodeField] ?? "").trim() === String(state.baseCode).trim());
  }
  if(sh.munNameField && state.baseNameLower){
    const has = rows.some(r => lower(r[sh.munNameField]).includes(state.baseNameLower));
    if(has) return rows.filter(r => lower(r[sh.munNameField]).includes(state.baseNameLower));
  }
  if(sh.munNameField){
    const first = lower(rows.find(r => norm(r[sh.munNameField]))?.[sh.munNameField] || "");
    if(first) return rows.filter(r => lower(r[sh.munNameField]) === first);
  }
  return rows;
}
