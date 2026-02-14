import { $ } from "../core/dom.js";
import { state, NAV_LABELS, ONLINE_XLSX_URL, AUTO_LOAD_ON_START } from "../core/state.js";
import { lower } from "../core/utils.js";
import { buildModelFromWorkbook, detectBaseMunicipality } from "../data/model.js";
import { renderAll } from "./render.js";
import { setStatus } from "../ui/tabs.js";

function applyWorkbook(wb, label){
  try{
    if(typeof window.XLSX === "undefined"){
      setStatus("Erro: XLSX não carregou.");
      return;
    }

    const model = buildModelFromWorkbook(wb);

    state.wb = wb;
    state.model = model;

    const base = detectBaseMunicipality(model);
    state.baseName = base.name;
    state.baseNameLower = lower(base.name);
    state.baseCode = base.code;

    let pick =
      model.sheets.find(s => (s.categoryKey === state.navGroup) && (s.years && s.years.length)) ||
      model.sheets.find(s => (s.years && s.years.length)) ||
      model.sheets[0] ||
      null;

    state.selectedSheet = pick;

    if(pick?.categoryKey && NAV_LABELS[pick.categoryKey]){
      state.navGroup = pick.categoryKey;
      if(state.rightMode !== "map"){
        document.querySelectorAll("#sideNav .navBtn").forEach(b => {
          b.classList.toggle("active", b.getAttribute("data-group") === state.navGroup);
        });
      }
    }

    state.selectedSubtab = "Geral";
    state.selectedMeasure = null;
    state.selectedRowKey = null;
    state.selectedYear = null;

    const ub = $("uploadBox");
    if(ub) ub.style.display = "none";

    setStatus(`${label} • Base: ${state.baseName || "—"}`);
    renderAll();
  }catch(err){
    console.error(err);
    setStatus("Erro ao processar a planilha.");
  }
}

export async function loadWorkbookFromUrl(){
  if(typeof window.XLSX === "undefined"){
    setStatus("Erro: biblioteca XLSX não carregou.");
    return;
  }
  try{
    setStatus("Carregando base online…");
    const bust = ONLINE_XLSX_URL + (ONLINE_XLSX_URL.includes("?") ? "&" : "?") + "v=" + Date.now();
    const res = await fetch(bust, { cache: "no-store" });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if(ct.includes("text/html")){
      throw new Error("Resposta HTML (planilha não está pública ou precisa de login).");
    }

    const buf = await res.arrayBuffer();
    const wb = window.XLSX.read(buf, { type: "array" });
    applyWorkbook(wb, "Base online carregada");
  }catch(err){
    console.error(err);
    setStatus("Não foi possível carregar a base online. Verifique se a planilha está publicada (qualquer pessoa com o link: Leitor)." );
  }
}

export function bindLoader(){
  $("btnLoadOnline")?.addEventListener("click", loadWorkbookFromUrl);

  if(typeof window.XLSX === "undefined"){
    setStatus("Aviso: biblioteca XLSX não carregou (verifique internet ou inclua xlsx.full.min.js localmente).");
  }else if(AUTO_LOAD_ON_START){
    window.addEventListener("load", () => {
      loadWorkbookFromUrl();
    });
  }
}
