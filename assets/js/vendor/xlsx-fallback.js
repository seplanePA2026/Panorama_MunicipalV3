window.addEventListener("error", function(e){
  const s = (e && e.target && e.target.tagName === "SCRIPT") ? e.target : null;
  if(!s) return;
  if(String(s.src || "").includes("xlsx.full.min.js") && typeof window.XLSX === "undefined"){
    const f = document.createElement("script");
    f.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    document.head.appendChild(f);
  }
}, true);
