import { state } from "../core/state.js";
import { setStatus, renderMainTabs } from "../ui/tabs.js";
import { renderSubtabs } from "../ui/subtabs.js";
import { renderTimeline } from "../ui/timeline.js";
import { renderDataPanel } from "../ui/dataPanel.js";
import { renderTrendChart } from "../ui/trendChart.js";
import { renderCompareChart } from "../ui/compareChart.js";
import { updatePieFromLastCompare } from "../ui/pie.js";
import { renderMapConfigPanel } from "../ui/mapConfigPanel.js";
import { renderMapKindToggle } from "../ui/mapKind.js";

export function selectSheet(name){
  const sh = state.model?.sheets?.find(s => s.name === name);
  state.selectedSheet = sh || null;

  state.selectedSubtab = "Geral";
  state.selectedMeasure = null;
  state.selectedRowKey = null;
  state.selectedYear = null;

  renderAll();
}

export function renderAll(){
  try{
    renderMainTabs();
    renderSubtabs();
    renderTimeline();
    renderDataPanel();
    renderTrendChart();
    renderCompareChart();
    updatePieFromLastCompare();
    renderMapKindToggle();
    renderMapConfigPanel();
  }catch(err){
    console.error(err);
    setStatus("Erro ao renderizar. Verifique o console (F12).");
  }
}

window.__gpSelectSheet = selectSheet;
window.__gpRenderAll = renderAll;
