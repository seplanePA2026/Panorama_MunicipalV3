export const norm = (s) => String(s ?? "").trim();
export const lower = (s) => norm(s).toLowerCase();

export function stripAccents(str){
  return String(str ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function canonCategory(str){
  return lower(stripAccents(str));
}

export function uniq(arr){
  return Array.from(new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== "")));
}

export function escapeHtml(v){
  const s = String(v ?? "");
  return s
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function isYearLike(x){
  const t = String(x ?? "").trim().replace(/\.0$/, "");
  return /^(19|20)\d{2}$/.test(t);
}

export function sortYears(arr){
  return uniq(arr.map(v => String(v).trim().replace(/\.0$/, "")))
    .filter(isYearLike)
    .sort((a,b)=>Number(a)-Number(b));
}

export function toNumber(v){
  if(v === null || v === undefined) return null;
  if(typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if(!s) return null;

  s = s.replace(/\s+/g,"");
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if(hasDot && hasComma){
    if(s.lastIndexOf(",") > s.lastIndexOf(".")){
      s = s.replace(/\./g,"").replace(",",".");
    }else{
      s = s.replace(/,/g,"");
    }
  }else if(hasComma && !hasDot){
    s = s.replace(",",".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function fmtValue(v){
  if(v === null || v === undefined || String(v).trim() === "") return "—";
  if(typeof v === "number" && Number.isFinite(v)){
    return v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  }
  const n = toNumber(v);
  if(n !== null) return n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return String(v);
}
