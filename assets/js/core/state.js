export const state = {
  wb: null,
  model: null,
  baseName: null,
  baseNameLower: "paulo afonso",
  baseCode: null,
  selectedSheet: null,
  selectedSubtab: "Geral",
  selectedYear: null,
  selectedMeasure: null,
  selectedRowKey: null,
  navGroup: "territorio",
  drawerOpen: false,
  rightMode: "data",
  mapKey: "unificado",
  mapSelection: null,
  mapCompact: false,
  lastCompare: null
};

export const NAV_LABELS = {
  mapa: "Mapa",
  territorio: "Território",
  economia: "Economia",
  populacao: "População",
  educacao: "Educação"
};

export const MAP_SOURCES = {
  unificado: {
    key: "unificado",
    label: "Camadas",
    src: "./Seplane_Interface_Atualizado/Mapa_Unificado/index.html?v=1",
    basePath: "Seplane_Interface_Atualizado/Mapa_Unificado/"
  }
};

export const ONLINE_SHEET_ID = "1XzAkfWqFp37Np2mzmqCjvfJajhR92OhU";
export const ONLINE_XLSX_URL = `https://docs.google.com/spreadsheets/d/${ONLINE_SHEET_ID}/export?format=xlsx`;
export const AUTO_LOAD_ON_START = true;
