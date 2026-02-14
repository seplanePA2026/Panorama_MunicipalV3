import { $ } from "../core/dom.js";
import { escapeHtml } from "../core/utils.js";

let tip = null;
let tipActive = null;

function tipSet(title, value){
  if(!tip) return;
  tip.innerHTML = `
    <div class="tTitle">${escapeHtml(title)}</div>
    <div class="tVal">${escapeHtml(value)}</div>
  `;
}

function tipPos(clientX, clientY){
  if(!tip) return;
  const pad = 14;
  const rect = tip.getBoundingClientRect();
  let x = clientX + pad;
  let y = clientY + pad;

  if(x + rect.width > window.innerWidth - 10) x = clientX - rect.width - pad;
  if(y + rect.height > window.innerHeight - 10) y = clientY - rect.height - pad;
  x = Math.max(10, x);
  y = Math.max(10, y);

  tip.style.left = x + "px";
  tip.style.top = y + "px";
}

function tipShow(){
  if(!tip) return;
  tip.classList.add("show");
  tip.setAttribute("aria-hidden","false");
}

function tipHide(){
  if(!tip) return;
  tip.classList.remove("show");
  tip.setAttribute("aria-hidden","true");
}

export function bindTooltip(){
  tip = $("chartTooltip");

  document.addEventListener("pointerover", (e) => {
    const wrap = e.target?.closest?.(".barWrap, .pieItem, .linePoint");
    if(!wrap) return;
    const tt = wrap.getAttribute("data-tip-title") || "";
    const tv = wrap.getAttribute("data-tip-value") || "";
    if(!tt && !tv) return;

    tipActive = wrap;
    tipSet(tt || "—", tv || "—");
    tipShow();
    tipPos(e.clientX, e.clientY);
  });

  document.addEventListener("pointermove", (e) => {
    if(!tipActive) return;
    tipPos(e.clientX, e.clientY);
  });

  document.addEventListener("pointerout", (e) => {
    const wrap = e.target?.closest?.(".barWrap, .pieItem, .linePoint");
    if(!wrap || wrap !== tipActive) return;
    const rel = e.relatedTarget;
    if(rel && wrap.contains(rel)) return;
    tipActive = null;
    tipHide();
  });
}
