// ══ 接続 ══════════════════════════════════════════════════════════
document.getElementById("connect-btn").addEventListener("click",async()=>{
  const key=document.getElementById("apikey-input").value.trim();
  const btn=document.getElementById("connect-btn");
  const err=document.getElementById("connect-err");
  if(!key){err.textContent="APIキーを入力してください";return;}
  btn.disabled=true;btn.textContent="接続確認中…";err.textContent="";
  try{
    const r=await fetch(`${PROXY}/proxy/connect`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({apiKey:key})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||"接続失敗");
    document.getElementById("connect-screen").classList.add("hidden");
    document.getElementById("main-screen").classList.remove("hidden");
    updateWlBadge();
    loadFilters();
  }catch(e){
    err.textContent=e.message.includes("fetch")?
      "プロキシに接続できません。proxy.py を起動してください。":e.message;
    btn.disabled=false;btn.textContent="接続する";
  }
});

document.getElementById("apikey-input").addEventListener("keydown",e=>{
  if(e.key==="Enter")document.getElementById("connect-btn").click();
});

document.getElementById("disconnect-btn").addEventListener("click",async()=>{
  if(!confirm("切断しますか？"))return;
  await fetch(`${PROXY}/proxy/disconnect`,{method:"POST"}).catch(()=>{});
  location.reload();
});

// ══ フィルタ読み込み ══════════════════════════════════════════════
async function loadFilters(){
  const mSel=document.getElementById("f-market");
  const sSel=document.getElementById("f-sector");
  mSel.innerHTML='<option value="">取得中…</option>';
  sSel.innerHTML='<option value="">取得中…</option>';
  try{
    if(!masterCache){
      const r=await fetch(`${PROXY}/proxy/master`);
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||"銘柄一覧取得失敗");
      masterCache=d.data||[];
    }
    if(!masterCache.length)throw new Error("銘柄データが空です");

    const sample=masterCache[0];
    console.log("[MASTER] fields:",Object.keys(sample));

    const mktField=["MktNm","MarketCode","Mkt","Market","Section","市場"].find(k=>sample[k]!==undefined);
    const secField=["S33Nm","Sector33Code","Sec33","Sector","業種"].find(k=>sample[k]!==undefined);
    const nameField=["CoName","Name","銘柄名"].find(k=>sample[k]!==undefined);
    if(!mktField&&!secField)throw new Error(`フィールド名不明: ${Object.keys(sample).join(", ")}`);

    window._masterFields={mkt:mktField,sec:secField,name:nameField,code:"Code"};

    const ms=mktField?[...new Set(masterCache.map(s=>s[mktField]).filter(Boolean))].sort():[];
    const secMap={};
    masterCache.forEach(s=>{if(s.S33&&s.S33Nm)secMap[s.S33]=s.S33Nm;});
    const ss=Object.keys(secMap).sort((a,b)=>parseInt(a)-parseInt(b)).map(k=>secMap[k]);

    mSel.innerHTML='<option value="">すべて</option>';
    sSel.innerHTML='<option value="">すべて</option>';
    ms.forEach(m=>mSel.appendChild(Object.assign(document.createElement("option"),{value:m,textContent:m})));
    ss.forEach(s=>sSel.appendChild(Object.assign(document.createElement("option"),{value:s,textContent:s})));

    startBgIfNeeded();
    loadCachedFins();  // proxyのキャッシュ済み財務データを復元
  }catch(e){
    mSel.innerHTML=`<option value="">エラー</option>`;
    sSel.innerHTML=`<option value="">エラー</option>`;
    document.getElementById("placeholder").classList.remove("hidden");
    document.getElementById("placeholder").textContent="銘柄一覧取得エラー: "+e.message;
  }
}

// ══ proxyのキャッシュ済み財務データを一括復元 ══════════════════════
// ページ再読み込み後もfinsCacheを復元し、スクリーニングを即座に表示
async function loadCachedFins(){
  try{
    const r=await fetch(`${PROXY}/proxy/fins_all`);
    if(!r.ok)return;
    const d=await r.json();
    if(d.data&&typeof d.data==="object"){
      let n=0;
      for(const code in d.data){
        if(d.data[code]&&d.data[code].length){
          finsCache[code]=d.data[code];
          n++;
        }
      }
      console.log(`[CACHE] ${n}件の財務データを復元`);
      // 復元したキャッシュ分のコア条件（③④）をBG計算で先行評価
      if(typeof computeConditionsBG==="function"){
        const codes=Object.keys(finsCache);
        let i=0;
        (function batch(){
          const end=Math.min(i+300,codes.length);
          for(;i<end;i++){
            if(!condCache[codes[i]]){
              try{computeConditionsBG(codes[i],true);}catch(e){}  // skipSave=true
            }
          }
          if(i<codes.length){setTimeout(batch,30);}
          else{
            if(typeof saveCondCache==="function")saveCondCache();  // 最後に1回だけ保存
            console.log("[CACHE] コア条件の先行計算完了");
          }
        })();
      }
    }
  }catch(e){
    console.warn("[CACHE] 復元失敗",e);
  }
}

// ══ キャッシュクリア ══════════════════════════════════════════════
(function(){
  const btn=document.getElementById("cache-clear-btn");
  if(!btn)return;
  btn.addEventListener("click",async()=>{
    if(!confirm("キャッシュ（財務・株価・コア条件）を全て消去しますか？\n次回スクリーニングで最新データを取り直します（再収集に時間がかかります）。\n\n※ウォッチリストは消えません"))return;
    btn.disabled=true;btn.textContent="消去中…";
    try{
      await fetch(`${PROXY}/proxy/cache_clear`,{method:"POST"});
    }catch(e){}
    // フロント側キャッシュも消去
    finsCache={};
    priceCache={};
    condCache={};
    freshCodes=new Set();
    try{
      localStorage.removeItem("screener_cond_cache");
      localStorage.removeItem("screener_last_price_date");
      localStorage.removeItem("screener_detect_day");
      localStorage.removeItem("screener_bg_next_code");
    }catch(e){}
    bgIndex=0;bgInitialized=false;
    alert("キャッシュを消去しました。スクリーニングを実行すると最新データを取得します。");
    btn.disabled=false;btn.textContent="🗑 キャッシュ";
    updateBgUI();
  });
})();