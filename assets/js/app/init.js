import { $ } from "../core/dom.js";
import { state } from "../core/state.js";
import { bindSideNav } from "../ui/tabs.js";
import { bindMapEvents, setMapCompact } from "../ui/map.js";
import { bindMapConfig } from "../ui/mapConfigPanel.js";
import { bindMapKind } from "../ui/mapKind.js";
import { bindTooltip } from "../ui/tooltip.js";
import { bindLoader } from "./loader.js";
import { renderCompareChart } from "../ui/compareChart.js";
import { updatePieFromLastCompare } from "../ui/pie.js";
import { bindSettings } from "../ui/settings.js";

export function initApp(){
  bindSideNav();
  bindMapEvents();
  bindMapConfig();
  bindMapKind();
  bindTooltip();
  bindLoader();
  bindSettings();

  $("btnToggleMap")?.addEventListener("click", () => {
    setMapCompact(!state.mapCompact);
    renderCompareChart();
    updatePieFromLastCompare();
  });

  setMapCompact(state.mapCompact);
}
