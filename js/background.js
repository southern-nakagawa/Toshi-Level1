// ══ バックグラウンド収集 ══════════════════════════════════════════
function updateBgUI(){
  const tog=document.getElementById("bg-toggle");
  if(tog)tog.checked=bgEnabled;
  const st=document.getElementById("bg-status");
  if(!st)return;
  if(!bgEnabled){st.textContent="";return;}
  if(!masterCache){st.textContent="BG待機中";return;}
  const remaining=masterCache.filter(s=>!(s.Code in finsCache)).length;
  if(!remaining){st.style.color="var(--green)";st.textContent="✓ 収集完了";return;}
  st.style.color="var(--muted)";
  st.textContent=bgRunning?`⟳ BG収集中 残${remaining}件`:`◉ BG待機 ${remaining}件`;
}

function startBgIfNeeded(){
  if(!bgEnabled||bgRunning||!masterCache)return;
  bgRunning=true;updateBgUI();
  bgTimer=setTimeout(bgFetchNext,BG_INTERVAL_MS);
}

async function bgFetchNext(){
  if(!bgEnabled||!masterCache){bgRunning=false;updateBgUI();return;}
  if(document.getElementById("screen-btn").disabled||detailLoading){
    bgTimer=setTimeout(bgFetchNext,BG_INTERVAL_MS);return;
  }
  const missing=masterCache.map(s=>s.Code).filter(c=>!finsCache[c]||!finsCache[c].length);
  if(!missing.length){
    // 全件収集済み → 暗い（未確認）銘柄を順次明るくする（APIなし・高速）
    const dim=masterCache.map(s=>s.Code).filter(c=>finsCache[c]&&finsCache[c].length&&!freshCodes.has(c));
    if(dim.length){
      dim.slice(0,12).forEach(c=>{
        freshCodes.add(c);
        if(typeof brightenRow==="function")brightenRow(c);
        if(typeof updateRowBadge==="function")updateRowBadge(c);
      });
      updateBgUI();
      bgTimer=setTimeout(bgFetchNext,1200);  // APIを使わないので高速
      return;
    }
    bgRunning=false;updateBgUI();return;
  }
  if(!bgInitialized){
    bgInitialized=true;
    const saved=localStorage.getItem("screener_bg_next_code");
    if(saved){const idx=missing.indexOf(saved);if(idx>=0)bgIndex=idx;}
  }
  bgIndex=bgIndex%missing.length;
  const code=missing[bgIndex++];
  const nextCode=missing[bgIndex%missing.length];
  if(nextCode)localStorage.setItem("screener_bg_next_code",nextCode);
  try{
    const r=await fetch(`${PROXY}/proxy/fins?code=${code}`);
    const d=await r.json();
    finsCache[code]=d.data||[];
    freshCodes.add(code);  // BG取得済み → 明るく表示
    if(typeof brightenRow==="function")brightenRow(code);
    // BG時に計算できる条件を自動評価（API追加なし・③④のみ）
    if(typeof computeConditionsBG==='function'){
      try{computeConditionsBG(code);}catch(e){}
    }
  }catch{}
  updateBgUI();
  bgTimer=setTimeout(bgFetchNext,BG_INTERVAL_MS);
}

// BG トグル初期化
(function(){
  const tog=document.getElementById("bg-toggle");
  tog.checked=bgEnabled;
  tog.addEventListener("change",e=>{
    bgEnabled=e.target.checked;
    localStorage.setItem("screener_bg_enabled",bgEnabled);
    if(bgEnabled){startBgIfNeeded();}
    else{clearTimeout(bgTimer);bgRunning=false;}
    updateBgUI();
  });
})();
