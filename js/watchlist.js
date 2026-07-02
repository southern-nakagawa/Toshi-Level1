// ══ ウォッチリスト（名前付き複数グループ対応） ════════════════════════
function isWatched(code){return watchlist.some(w=>w.code===code)}
// いずれかのリストに登録されているか
function isWatchedAny(code){
  return Object.values(watchlistGroups).some(arr=>(arr||[]).some(w=>w.code===code));
}

// ── 詳細パネル用: リスト選択ポップアップ ──
function openWatchPicker(code,info,anchorBtn){
  const old=document.getElementById("wl-picker");
  if(old){old.remove();if(old._closer)document.removeEventListener("click",old._closer);}

  const names=Object.keys(watchlistGroups);
  const menu=document.createElement("div");
  menu.id="wl-picker";
  menu.style.cssText="position:absolute;z-index:2000;background:#0d1424;border:1px solid var(--border);"
    +"border-radius:8px;padding:6px;box-shadow:0 8px 28px rgba(0,0,0,.6);min-width:190px;max-width:260px";
  menu.innerHTML='<div style="font-size:11px;color:var(--muted);padding:4px 8px 6px">リストに登録 / 解除（クリックで切替）</div>'
    +names.map(n=>{
      const inList=(watchlistGroups[n]||[]).some(w=>w.code===code);
      return `<div class="wl-pick" data-name="${n.replace(/"/g,"&quot;")}"
        style="padding:8px 10px;cursor:pointer;border-radius:5px;display:flex;align-items:center;gap:8px;font-size:13px">
        <span style="width:16px;text-align:center;color:var(--green)">${inList?"✓":"＋"}</span>
        <span style="flex:1">${n}</span>
        <span style="font-size:10px;color:var(--muted)">${(watchlistGroups[n]||[]).length}</span>
      </div>`;
    }).join("");

  document.body.appendChild(menu);
  const r=anchorBtn.getBoundingClientRect();
  let top=r.bottom+window.scrollY+4;
  let left=r.right+window.scrollX-menu.offsetWidth;
  if(left<8)left=8;
  menu.style.top=top+"px";
  menu.style.left=left+"px";

  menu.querySelectorAll(".wl-pick").forEach(el=>{
    el.addEventListener("mouseenter",()=>el.style.background="rgba(255,255,255,.06)");
    el.addEventListener("mouseleave",()=>el.style.background="");
    el.addEventListener("click",(ev)=>{
      ev.stopPropagation();
      const name=el.dataset.name;
      const grp=watchlistGroups[name]||(watchlistGroups[name]=[]);
      const idx=grp.findIndex(w=>w.code===code);
      if(idx>=0)grp.splice(idx,1);
      else grp.push({code,name:info.CoName||"",market:info.MktNm||"",sector:info.S33Nm||""});
      watchlist=watchlistGroups[activeWatchlistName];  // 参照を再同期
      saveWatchlists();
      updateWlBadge();
      // 詳細ボタン表示更新
      const btn=document.getElementById("watch-btn");
      if(btn){
        const w=isWatchedAny(code);
        btn.textContent=w?"★ リスト編集":"☆ リスト登録";
        btn.classList.toggle("watched",w);
      }
      // アクティブリスト表示中なら結果を更新
      const meta=document.getElementById("results-meta");
      if(meta&&meta.textContent.includes("ウォッチリスト"))showWatchlistResults();
      // ポップアップ再描画（チェック状態更新）
      openWatchPicker(code,info,anchorBtn);
    });
  });

  // 外クリックで閉じる
  const closer=(e)=>{
    if(!menu.contains(e.target)&&e.target!==anchorBtn){
      menu.remove();
      document.removeEventListener("click",closer);
    }
  };
  menu._closer=closer;
  setTimeout(()=>document.addEventListener("click",closer),0);
}

// 全グループを保存
function saveWatchlists(){
  watchlistGroups[activeWatchlistName]=watchlist;
  localStorage.setItem("screener_wl_groups",JSON.stringify(watchlistGroups));
  localStorage.setItem("screener_wl_active",activeWatchlistName);
}

// グループ切り替え
function switchWatchlist(name){
  saveWatchlists();
  if(!watchlistGroups[name])watchlistGroups[name]=[];
  activeWatchlistName=name;
  watchlist=watchlistGroups[name];
  saveWatchlists();
}

function toggleWatch(code,info){
  if(isWatched(code)){
    watchlist=watchlist.filter(w=>w.code!==code);
  }else{
    watchlist.push({code,name:info.CoName||"",market:info.MktNm||"",sector:info.S33Nm||""});
  }
  saveWatchlists();
  updateWlBadge();
  const meta=document.getElementById("results-meta");
  if(meta&&!meta.classList.contains("hidden")&&meta.textContent.includes("ウォッチリスト"))
    showWatchlistResults();
}

function updateWlBadge(){
  const b=document.getElementById("wl-badge");
  if(!b)return;
  const total=Object.values(watchlistGroups).reduce((s,a)=>s+(a?a.length:0),0);
  if(total){b.textContent=watchlist.length;b.classList.remove("hidden");}
  else b.classList.add("hidden");
}

// 名称・コードから候補を検索
function searchCandidates(query){
  if(!query||!masterCache)return [];
  const q=query.toLowerCase().trim();
  const isNum=/^\d+$/.test(q);
  const out=[];
  for(const s of masterCache){
    const code=s.Code||"";
    const name=(s.CoName||"").toLowerCase();
    let hit=false;
    if(isNum){
      if(code.startsWith(q)||code.startsWith(q+"0"))hit=true;
    }
    if(!hit&&name.includes(q))hit=true;
    if(hit){out.push(s);if(out.length>=10)break;}
  }
  return out;
}

function showWatchlist(){
  const dc=document.getElementById("d-content");
  document.getElementById("d-empty").classList.add("hidden");
  dc.classList.remove("hidden");
  document.querySelectorAll("#results-tbody tr").forEach(t=>t.classList.remove("active"));
  activeCode=null;
  if(chart){chart.destroy();chart=null;}

  const groupNames=Object.keys(watchlistGroups);
  const tabsHTML=groupNames.map(n=>`
    <button class="wl-tab${n===activeWatchlistName?" active":""}" data-name="${n.replace(/"/g,"&quot;")}"
      style="padding:5px 12px;font-size:12px;border:1px solid ${n===activeWatchlistName?"var(--accent)":"var(--border)"};
      border-radius:6px;background:${n===activeWatchlistName?"rgba(59,130,246,.15)":"transparent"};
      color:${n===activeWatchlistName?"var(--accent)":"var(--muted)"};cursor:pointer;white-space:nowrap">
      ${n} <span style="opacity:.6;font-size:10px">${(watchlistGroups[n]||[]).length}</span>
    </button>`).join("");

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
        <div class="d-sub">「${activeWatchlistName}」 ${watchlist.length}銘柄</div>
      </div>
      <button class="close-btn" id="close-wl">✕</button>
    </div>

    <div style="padding:10px 16px;border-bottom:1px solid var(--border)">
      <div style="font-size:11px;color:var(--muted);margin-bottom:6px">リスト選択</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${tabsHTML}
        <button id="wl-new" title="新しいリストを作成"
          style="padding:5px 10px;font-size:12px;border:1px dashed var(--border);border-radius:6px;
          background:transparent;color:var(--muted);cursor:pointer">＋ 新規</button>
      </div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button id="wl-rename" class="btn-sm" style="font-size:11px;padding:3px 10px;color:var(--muted)">名前変更</button>
        <button id="wl-delete" class="btn-sm" style="font-size:11px;padding:3px 10px;color:var(--red);border-color:rgba(239,68,68,.4)">リスト削除</button>
      </div>
    </div>

    <div style="padding:12px 16px;border-bottom:1px solid var(--border);position:relative">
      <div style="display:flex;gap:8px">
        <input type="text" id="wl-input" placeholder="コード または 銘柄名（例: 7203 / トヨタ）" autocomplete="off"
          style="flex:1;padding:7px 10px;background:#0d1120;border:1px solid var(--border);
          border-radius:6px;color:var(--text);font-size:13px">
        <button class="btn-sm" id="wl-add" style="padding:6px 14px;border-color:var(--accent);color:var(--accent)">＋ 追加</button>
      </div>
      <div id="wl-suggest" style="position:absolute;left:16px;right:16px;top:54px;z-index:50;
        background:#0d1424;border:1px solid var(--border);border-radius:6px;overflow:hidden;
        display:none;max-height:280px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.5)"></div>
      <div id="wl-err" style="font-size:11px;color:var(--red);min-height:16px;margin-top:4px"></div>
    </div>

    <div id="wl-list">${listHTML}</div>`;

  document.getElementById("close-wl").addEventListener("click",closeDetail);

  // ── リストタブ切り替え ──
  dc.querySelectorAll(".wl-tab").forEach(btn=>{
    btn.addEventListener("click",()=>{
      switchWatchlist(btn.dataset.name);
      updateWlBadge();
      showWatchlist();
      showWatchlistResults();
    });
  });

  // ── 新規リスト作成 ──
  document.getElementById("wl-new").addEventListener("click",()=>{
    const name=(prompt("新しいリスト名を入力してください")||"").trim();
    if(!name)return;
    if(watchlistGroups[name]){alert("同名のリストが既にあります");return;}
    watchlistGroups[name]=[];
    switchWatchlist(name);
    updateWlBadge();
    showWatchlist();
    showWatchlistResults();
  });

  // ── 名前変更 ──
  document.getElementById("wl-rename").addEventListener("click",()=>{
    const newName=(prompt("新しいリスト名",activeWatchlistName)||"").trim();
    if(!newName||newName===activeWatchlistName)return;
    if(watchlistGroups[newName]){alert("同名のリストが既にあります");return;}
    // 順序を保ったままキーをリネーム
    const entries=Object.entries(watchlistGroups).map(([k,v])=>[k===activeWatchlistName?newName:k,v]);
    watchlistGroups=Object.fromEntries(entries);
    activeWatchlistName=newName;
    watchlist=watchlistGroups[newName];
    saveWatchlists();
    showWatchlist();
  });

  // ── リスト削除 ──
  document.getElementById("wl-delete").addEventListener("click",()=>{
    if(Object.keys(watchlistGroups).length<=1){alert("最後のリストは削除できません");return;}
    if(!confirm(`リスト「${activeWatchlistName}」を削除しますか？（登録銘柄${watchlist.length}件も削除されます）`))return;
    delete watchlistGroups[activeWatchlistName];
    activeWatchlistName=Object.keys(watchlistGroups)[0];
    watchlist=watchlistGroups[activeWatchlistName];
    saveWatchlists();
    updateWlBadge();
    showWatchlist();
    showWatchlistResults();
  });

  // ── 候補検索付き追加 ──
  const inp=document.getElementById("wl-input");
  const sug=document.getElementById("wl-suggest");
  const errEl=document.getElementById("wl-err");

  const addByCode=(code)=>{
    errEl.textContent="";
    let info=(masterCache||[]).find(s=>s.Code===code);
    if(!info){errEl.textContent=`コード "${code}" が見つかりません`;return;}
    if(isWatched(info.Code)){errEl.textContent="すでに登録されています";return;}
    watchlist.push({code:info.Code,name:info.CoName||"",market:info.MktNm||"",sector:info.S33Nm||""});
    saveWatchlists();
    updateWlBadge();
    inp.value="";sug.style.display="none";
    showWatchlist();
    showWatchlistResults();
  };

  const renderSuggest=()=>{
    const q=inp.value.trim();
    if(!q){sug.style.display="none";return;}
    const cands=searchCandidates(q);
    if(!cands.length){sug.style.display="none";return;}
    sug.innerHTML=cands.map(s=>{
      const watched=isWatched(s.Code);
      return `<div class="wl-cand" data-code="${s.Code}"
        style="padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);
        display:flex;align-items:center;gap:8px;${watched?"opacity:.45":""}">
        <span style="font-family:monospace;color:var(--accent);font-size:12px;flex-shrink:0">${s.Code}</span>
        <span style="font-size:13px;flex:1">${s.CoName||""}</span>
        <span style="font-size:10px;color:var(--muted)">${s.S33Nm||""}</span>
        ${watched?'<span style="font-size:10px;color:var(--green)">登録済</span>':""}
      </div>`;
    }).join("");
    sug.style.display="block";
    sug.querySelectorAll(".wl-cand").forEach(el=>{
      el.addEventListener("click",()=>addByCode(el.dataset.code));
    });
  };

  inp.addEventListener("input",renderSuggest);
  inp.addEventListener("focus",renderSuggest);
  inp.addEventListener("keydown",e=>{
    // 漢字変換中(IME)のEnterは無視 → 誤登録を防止
    if(e.isComposing||e.keyCode===229)return;
    if(e.key==="Enter"){
      const cands=searchCandidates(inp.value.trim());
      if(cands.length){addByCode(cands[0].Code);}
      else errEl.textContent="該当する銘柄がありません";
    }else if(e.key==="Escape"){sug.style.display="none";}
  });
  document.getElementById("wl-add").addEventListener("click",()=>{
    const cands=searchCandidates(inp.value.trim());
    if(cands.length)addByCode(cands[0].Code);
    else errEl.textContent="該当する銘柄がありません";
  });
  // 候補の外をクリックで閉じる
  document.addEventListener("click",e=>{
    if(sug&&!sug.contains(e.target)&&e.target!==inp)sug.style.display="none";
  });

  // ── 銘柄クリックで詳細 ──
  dc.querySelectorAll(".wl-name-area").forEach(el=>{
    el.addEventListener("click",()=>loadDetail(el.closest(".wl-item").dataset.code,null));
  });

  // ── 解除 ──
  dc.querySelectorAll(".wl-del").forEach(btn=>{
    btn.addEventListener("click",e=>{
      e.stopPropagation();
      watchlist=watchlist.filter(w=>w.code!==btn.dataset.code);
      saveWatchlists();
      updateWlBadge();
      showWatchlist();
      showWatchlistResults();
    });
  });

  // ── ドラッグ&ドロップ並べ替え ──
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
      saveWatchlists();
      showWatchlist();showWatchlistResults();
    });
  });
}

document.getElementById("watchlist-btn").addEventListener("click",()=>{
  showWatchlist();showWatchlistResults();
});
