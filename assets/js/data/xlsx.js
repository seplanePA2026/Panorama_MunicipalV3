import { norm, lower, uniq, canonCategory, isYearLike, sortYears, toNumber, stripAccents } from "../core/utils.js";

export function sheetToRows(ws){
  const aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  if(!aoa || !aoa.length) return { columns: [], rows: [] };

  let headerIdx = aoa.findIndex(r => (r || []).some(v => String(v).trim() !== ""));
  if(headerIdx < 0) headerIdx = 0;

  const rawHeader = (aoa[headerIdx] || []).map(h => norm(h));
  const columns = rawHeader.map((h,i) => h || `UNNAMED_${i+1}`);

  const rows = [];
  for(let i = headerIdx + 1; i < aoa.length; i++){
    const rowArr = aoa[i] || [];
    const hasAny = rowArr.some(v => String(v).trim() !== "");
    if(!hasAny) continue;

    const obj = {};
    for(let j=0; j<columns.length; j++){
      obj[columns[j]] = (j < rowArr.length) ? rowArr[j] : "";
    }
    rows.push(obj);
  }
  return { columns, rows };
}

function findFirstColumn(columns, tests){
  for(const c of columns){
    const lc = lower(c);
    for(const t of tests){
      if(typeof t === "string"){
        if(lc === lower(t)) return c;
      }else if(t instanceof RegExp){
        if(t.test(lc)) return c;
      }
    }
  }
  return null;
}

export function guessYearField(columns){
  let c = findFirstColumn(columns, ["Ano", "Year"]);
  if(c) return c;
  c = columns.find(col => {
    const lc = lower(col);
    return lc.includes("ano") && !lc.includes("mês") && !lc.includes("mes");
  });
  return c || null;
}

export function guessMunNameField(columns){
  return findFirstColumn(columns, [/munic/i, /municip/i, /municí/i, /cidade/i]);
}

export function guessMunCodeField(columns){
  return findFirstColumn(columns, [/code_mun/i, /cod_mun/i, /cod\.?mun/i, /c[oó]digo.*mun/i, /ibge/i, /codigo_ibge/i]);
}

export function guessGroupField(columns){
  return findFirstColumn(columns, [
    "Tipo","Setor","Sexo","Situação","Situacao","Education Level","Mês","Mes",
    "Faixa Etária","Faixa_Etária","Faixa Etaria","Faixa_Etaria",
    "Nível","Nivel","Grupo","Seção","Secao"
  ]);
}

export function guessCategoryField(columns){
  return findFirstColumn(columns, ["Categoria", /categoria/i]);
}

export function isMetaColumnName(col){
  const lc = lower(col);
  if(lc.startsWith("ideb")) return false;
  if(lc === "categoria" || lc.includes("categoria")) return true;
  if(lc.includes("fonte")) return true;
  if(lc.includes("explic")) return true;
  if(lc.includes("explica")) return true;
  if(lc.includes("descri")) return true;
  if(lc.includes("observa")) return true;
  if(lc === "uf" || lc.includes(" uf")) return true;
  if(lc.includes("municip") || lc.includes("municí") || lc.includes("cidade")) return true;
  if(lc.includes("code") || lc.includes("cod_") || lc.includes("código") || lc.includes("codigo") || lc.includes("ibge")) return true;
  if(lc === "id" || lc.endsWith(" id") || lc.endsWith("_id") || lc.includes(" id ") || lc.includes("id_")) return true;
  if(lc.startsWith("unnamed")) return true;
  return false;
}

export function detectYearColumns(columns){
  return sortYears(columns.filter(isYearLike));
}

export function detectYears(sh){
  if(sh.yearField){
    return sortYears(sh.rows.map(r => r[sh.yearField]));
  }
  return detectYearColumns(sh.columns);
}

export function detectNumericMeasureColumns(sh){
  const exclude = new Set([
    sh.yearField,
    sh.groupField,
    sh.categoryField,
    sh.munNameField,
    sh.munCodeField
  ].filter(Boolean));

  const candidates = sh.columns.filter(c => !exclude.has(c) && !isMetaColumnName(c) && !isYearLike(c));
  const measures = [];

  for(const col of candidates){
    const sample = [];
    for(let i=0; i<sh.rows.length && sample.length < 50; i++){
      const v = sh.rows[i][col];
      if(String(v).trim() === "") continue;
      sample.push(v);
    }
    if(!sample.length) continue;

    const numCount = sample.map(toNumber).filter(v => v !== null).length;
    if(numCount / sample.length >= 0.6){
      measures.push(col);
    }
  }

  if(!measures.length){
    return candidates;
  }
  return measures;
}

export function detectIndicatorFieldForWide(sh){
  const exclude = new Set([sh.munNameField, sh.munCodeField].filter(Boolean));
  const yearCols = new Set(sh.years || []);
  for(const col of sh.columns){
    if(exclude.has(col)) continue;
    if(isMetaColumnName(col)) continue;
    if(yearCols.has(col)) continue;
    if(col === sh.groupField) continue;
    const sample = sh.rows.slice(0,30).map(r => r[col]).filter(v => String(v).trim() !== "");
    if(!sample.length) continue;
    const numCount = sample.map(toNumber).filter(v => v !== null).length;
    if(numCount / sample.length < 0.4) return col;
  }
  return null;
}

export function normalizeCategoryKey(categoryRaw){
  const ck = canonCategory(categoryRaw);
  if(ck.includes("territ")) return "territorio";
  if(ck.includes("econ")) return "economia";
  if(ck.includes("pop")) return "populacao";
  if(ck.includes("educ")) return "educacao";
  return ck || "outros";
}

export function canonizeTextKey(str){
  return lower(stripAccents(str));
}
