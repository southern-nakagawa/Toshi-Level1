// ══ ツールチップエンジン ══════════════════════════════════════════
(function(){
  const tip=document.createElement("div");
  tip.id="tooltip";
  document.body.appendChild(tip);
  let cur=null;

  function show(el,e){tip.textContent=el.dataset.tip;tip.classList.add("vis");move(e);}
  function hide(){tip.classList.remove("vis");cur=null;}
  function move(e){
    const tw=tip.offsetWidth||220,th=tip.offsetHeight||50;
    const vw=window.innerWidth,vh=window.innerHeight;
    let x=e.clientX+14,y=e.clientY-10;
    if(x+tw>vw-8)x=e.clientX-tw-14;
    if(y+th>vh-8)y=vh-th-8;
    if(y<8)y=8;
    tip.style.left=x+"px";tip.style.top=y+"px";
  }
  document.addEventListener("mouseover",e=>{
    const el=e.target.closest("[data-tip]");
    if(!el||el===cur)return;
    cur=el;show(el,e);
  });
  document.addEventListener("mousemove",e=>{if(cur)move(e);});
  document.addEventListener("mouseout",e=>{
    if(!cur)return;
    const to=e.relatedTarget;
    if(to&&to.closest("[data-tip]")===cur)return;
    hide();
  });
  document.addEventListener("scroll",hide,true);
  document.addEventListener("click",hide,true);
})();

// ══ ペインリサイザー ══════════════════════════════════════════════
(function(){
  const resizer=document.getElementById("pane-resizer");
  const detail=document.getElementById("detail-pane");
  if(!resizer||!detail)return;
  const PANE_W_KEY="screener_detail_width";
  const savedW=parseInt(localStorage.getItem(PANE_W_KEY));
  if(savedW>=280&&savedW<=900){detail.style.width=savedW+"px";detail.style.minWidth=savedW+"px";}
  let startX,startW;
  resizer.addEventListener("mousedown",e=>{
    startX=e.clientX;startW=detail.offsetWidth;
    resizer.classList.add("dragging");
    document.body.style.cursor="col-resize";
    document.body.style.userSelect="none";
    const onMove=e=>{
      const newW=Math.max(280,Math.min(900,startW-(e.clientX-startX)));
      detail.style.width=newW+"px";detail.style.minWidth=newW+"px";
      if(chart)chart.resize();
    };
    const onUp=()=>{
      resizer.classList.remove("dragging");
      document.body.style.cursor="";document.body.style.userSelect="";
      localStorage.setItem(PANE_W_KEY,detail.offsetWidth);
      document.removeEventListener("mousemove",onMove);
      document.removeEventListener("mouseup",onUp);
    };
    document.addEventListener("mousemove",onMove);
    document.addEventListener("mouseup",onUp);
    e.preventDefault();
  });
})();

// condCacheをページ離脱時に保存
window.addEventListener("beforeunload",function(){
  if(typeof saveCondCache==="function")saveCondCache();
});