// ══ ウォッチリスト ══════════════════════════════════════════════════
function isWatched(code){return watchlist.some(w=>w.code===code)}

function toggleWatch(code,info){
  if(isWatched(code)){
    watchlist=watchlist.filter(w=>w.code!==code);
  }else{
    watchlist.push({code,name:info.CoName||"",market:info.MktNm||"",sector:info.S33Nm||""});
  }
  localStorage.setItem("screener_watchlist",JSON.stringify(watchlist));
  updateWlBadge();
  const meta=document.getElementById("results-meta");
  if(meta&&!meta.classList.contains("hidden")&&meta.textContent.includes("ウォッチリスト"))
    showWatchlistResults();
}

function updateWlBadge(){
  const b=document.getElementById("wl-badge");
  if(!b)return;
  if(watchlist.length){b.textContent=watchlist.length;b.classList.remove("hidden");}
  else b.classList.add("hidden");
}

function showWatchlist(){
  const dc=document.getElementById("d-content");
  document.getElementById("d-empty").classList.add("hidden");
  dc.classList.remove("hidden");
  document.querySelectorAll("#results-tbody tr").forEach(t=>t.classList.remove("active"));
  activeCode=null;
  if(chart){chart.destroy();chart=null;}

  const listHTML=watchlist.length?watchlist.map((w,i)=>`
    <div class="wl-item" data-code="${w.code}" data-idx="${i}" draggable="true">
      <span class="wl-drag-handle" title="ドラッグで並べ替え">⠿</span>
      <div style="flex:1;cursor:pointer" class="wl-name-area">
        <span style="font-family:monospace;color:var(--accent);font-size:13px">${w.code}</span>
        <span style="margin-left:8px;font-size:13px">${w.name}</span>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${w.market} ／ ${w.sector}</div>
      </div>
      <button class="btn-sm wl-del" data-code="${w.code}" style="font-size:11px;padding:3px 10px;flex-shrink:0">解除</button>
    </div>`).join("")
    :'<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">登録銘柄がありません</div>';

  dc.innerHTML=`
    <div class="detail-header">
      <div>
        <div class="d-name">⭐ ウォッチリスト</div>
        <div class="d-sub">${watchlist.length}銘柄登録中</div>
      </div>
      <button class="close-btn" id="close-wl">✕</button>
    </div>
    <div style="padding:12px 16px;border-bottom:1px solid var(--border)">
      <div style="display:flex;gap:8px">
        <input type="text" id="wl-input" placeholder="証券コード（例: 7203）" maxlength="5"
          style="flex:1;padding:7px 10px;background:#0d1120;border:1px solid var(--border);
          border-radius:6px;color:var(--text);font-family:monospace;font-size:13px">
        <button class="btn-sm" id="wl-add" style="padding:6px 14px;border-color:var(--accent);color:var(--accent)">＋ 追加</button>
      </div>
      <div id="wl-err" style="font-size:11px;color:var(--red);min-height:16px;margin-top:4px"></div>
    </div>
    <div id="wl-list">${listHTML}</div>`;

  document.getElementById("close-wl").addEventListener("click",closeDetail);

  const addFn=()=>{
    const inp=document.getElementById("wl-input");
    const raw=(inp.value||"").trim();
    const errEl=document.getElementById("wl-err");
    errEl.textContent="";
    if(!raw){errEl.textContent="コードを入力してください";return;}
    let info=(masterCache||[]).find(s=>s.Code===raw);
    if(!info)info=(masterCache||[]).find(s=>s.Code===raw+"0");
    if(!info)info=(masterCache||[]).find(s=>s.Code===raw.replace(/^0+/,""));
    if(!info){errEl.textContent=`コード "${raw}" が見つかりません`;return;}
    const code=info.Code;
    if(isWatched(code)){errEl.textContent="すでに登録されています";return;}
    watchlist.push({code,name:info.CoName||"",market:info.MktNm||"",sector:info.S33Nm||""});
    localStorage.setItem("screener_watchlist",JSON.stringify(watchlist));
    updateWlBadge();
    inp.value="";
    showWatchlist();
  };
  document.getElementById("wl-add").addEventListener("click",addFn);
  document.getElementById("wl-input").addEventListener("keydown",e=>{if(e.key==="Enter")addFn();});

  dc.querySelectorAll(".wl-name-area").forEach(el=>{
    el.addEventListener("click",()=>loadDetail(el.closest(".wl-item").dataset.code,null));
  });

  dc.querySelectorAll(".wl-del").forEach(btn=>{
    btn.addEventListener("click",e=>{
      e.stopPropagation();
      watchlist=watchlist.filter(w=>w.code!==btn.dataset.code);
      localStorage.setItem("screener_watchlist",JSON.stringify(watchlist));
      updateWlBadge();
      showWatchlist();
      showWatchlistResults();
    });
  });

  // ドラッグ&ドロップ並べ替え
  let dragSrc=null;
  dc.querySelectorAll(".wl-item[draggable]").forEach(el=>{
    el.addEventListener("dragstart",e=>{
      dragSrc=el;e.dataTransfer.effectAllowed="move";
      setTimeout(()=>el.style.opacity=".4",0);
    });
    el.addEventListener("dragend",()=>{el.style.opacity="";});
    el.addEventListener("dragover",e=>{
      e.preventDefault();e.dataTransfer.dropEffect="move";
      dc.querySelectorAll(".wl-item").forEach(x=>x.classList.remove("wl-over"));
      if(el!==dragSrc)el.classList.add("wl-over");
    });
    el.addEventListener("dragleave",()=>el.classList.remove("wl-over"));
    el.addEventListener("drop",e=>{
      e.preventDefault();el.classList.remove("wl-over");
      if(!dragSrc||dragSrc===el)return;
      const si=parseInt(dragSrc.dataset.idx),di=parseInt(el.dataset.idx);
      const[moved]=watchlist.splice(si,1);watchlist.splice(di,0,moved);
      localStorage.setItem("screener_watchlist",JSON.stringify(watchlist));
      showWatchlist();showWatchlistResults();
    });
  });
}

document.getElementById("watchlist-btn").addEventListener("click",()=>{
  showWatchlist();showWatchlistResults();
});
