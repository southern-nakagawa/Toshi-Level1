// ══ プログレス表示 ══════════════════════════════════════════════
function setProgress(pct,text,sub=""){
  document.getElementById("progress-fill").style.width=pct+"%";
  if(text)document.getElementById("loading-text").textContent=text;
  if(sub!==undefined)document.getElementById("loading-sub").textContent=sub;
}
function setSpProgress(pct,text){
  const sp=document.getElementById("screen-progress");
  const fill=document.getElementById("sp-bar-fill");
  const txt=document.getElementById("sp-text");
  sp.classList.remove("hidden");
  fill.style.width=pct+"%";
  txt.textContent=text;
}
function hideSpProgress(){
  document.getElementById("screen-progress").classList.add("hidden");
  document.getElementById("sp-bar-fill").style.width="0%";
}

// ══ スクリーニング計算（共通）══════════════════════════════════
function calcScreenResults(codes,prices,filters){
  const {minA,maxA,minEq,minRoa,minDiv,noTrap,minCond=0}=filters;
  const infoMap={};(masterCache||[]).forEach(s=>infoMap[s.Code]=s);
  const results=[];
  for(const code of codes){
    const rawStmts=finsCache[code];
    if(!rawStmts||!rawStmts.length)continue;
    // 最新レコード（四半期含む・BPS有）で統一
    const validStmts=rawStmts.filter(s=>parseFloat(s.BPS||0)>0);
    const stmt=validStmts.length?validStmts[validStmts.length-1]:null;
    if(!stmt)continue;
    const pq=prices[code];if(!pq)continue;
    const price=safe(pq.Close||pq.C||pq.AdjustmentClose);
    if(price<=0)continue;
    const bps   =safe(stmt.BPS);
    const ta    =safe(stmt.TA||stmt.TotalAssets);
    const eq    =safe(stmt.EqAR||stmt.EquityToAssetRatio);
    const op    =safe(stmt.OdP||stmt.OP||stmt.OperatingProfit);
    const shares=safe(stmt.ShOutFY||stmt.NumberOfSharesIssued);
    const ns    =safe(stmt.Sales||stmt.NetSales);
    if(bps<=0||ta<=0||shares<=0)continue;
    // 四半期は経常利益を年率換算
    const qNS={'1Q':1,'2Q':2,'3Q':3,'FY':4}[stmt.CurPerType]||4;
    const annOp=qNS<4?op*(4/qNS):op;
    // FY実績なら当期OdP優先、四半期なら最新FOdPを遡って取得
    let fOp=0;
    if(qNS===4&&annOp>0){
      fOp=annOp;
    }else{
      for(let i=rawStmts.length-1;i>=0;i--){
        const v=safe(rawStmts[i].FOdP||rawStmts[i].FOP||rawStmts[i].NxFOdP||rawStmts[i].NxFOP);
        if(v>0){fOp=v;break;}
      }
    }
    const eqNorm=eq>1?eq/100:eq;
    const fEps=fOp>0?fOp*.7/shares:0;
    const roa =annOp>0?annOp/ta:0;
    const pbr =bps>0?price/bps:1;
    let div=0;
    for(let i=rawStmts.length-1;i>=0;i--){
      const v=safe(rawStmts[i].FDivAnn||rawStmts[i].FDivFY||rawStmts[i].DivAnn||rawStmts[i].NxFDivAnn);
      if(v>0){div=v;break;}
    }
    const t=calcTheory(bps,fEps,roa,eqNorm,pbr);
    const a=calcAlpha(t.theory,price);
    if(a===null)continue;
    if(a<minA||a>maxA)continue;
    if(eqNorm*100<minEq)continue;
    if(roa*100<minRoa)continue;
    const divYield=div>0&&price>0?Math.round(div/price*10000)/100:0;
    if(minDiv>0&&divYield<minDiv)continue;
    const vt=pbr<0.3&&a>100;
    if(noTrap&&vt)continue;
    const si=infoMap[code]||{};
    const lv=levelOf(a);
    const _cond=condCache[code];
    results.push({
      code, name:si.CoName||"", market:si.MktNm||"", sector:si.S33Nm||"",
      price,...t,
      alpha:Math.round(a*10)/10,
      level:lv,lcolor:LCOLOR[lv]||"#6b7280",
      bps:Math.round(bps),
      fEps:Math.round(fEps*10)/10,
      roa:Math.round(roa*1000)/10,
      eq:Math.round(eq*1000)/10,
      pbr:Math.round(pbr*100)/100,
      divYield, vt,
      condScore:_cond?_cond.score:null,
      sharpe:sharpeCache[code]?sharpeCache[code].sharpe:null,
      opm:ns>0?Math.round(op/ns*1000)/10:null
    });
  }
  return results;
}

// ══ スクリーニング結果表示 ════════════════════════════════════════
function showScreenResults(results,date,suffix,minCond=0){
  lastResults=results;
  const meta=document.getElementById("results-meta");
  const table=document.getElementById("results-table");
  const placeholder=document.getElementById("placeholder");
  placeholder.classList.add("hidden");
  table.classList.remove("hidden");
  meta.classList.remove("hidden");
  const displayDate=lastProbeDate||date;
  const dateSuffix=lastProbeDate&&lastProbeDate!==date
    ?`<span style="color:#475569;font-size:10px;margin-left:4px">（株価取得: ${date}）</span>`:"";
  meta.innerHTML=`<strong>${results.length}銘柄</strong>が条件に一致 ／ 株価基準日: <strong>${displayDate}</strong>${dateSuffix}
    ${suffix?`<span style="color:var(--muted);font-size:11px;margin-left:8px">${suffix}</span>`:""}`;
  let sorted=applySort(results);
  if(minCond>0){
    const minC=typeof minCond!=='undefined'?minCond:0;
    sorted=sorted.filter(r=>{const c=condCache[r.code];return c&&c.score>=minC;});
  }
  renderTable(sorted.slice(0,300));
}

// ══ ウォッチリスト → スクリーニングリスト表示 ════════════════════
async function showWatchlistResults(){
  // 実行中のスクリーニングを中断（テーブル描画の競合を防止）
  if(screenAbortCtrl){try{screenAbortCtrl.abort();}catch(e){}}
  const myGen=++renderGen;  // この表示の描画世代
  const alive=()=>myGen===renderGen;

  const meta=document.getElementById("results-meta");
  const placeholder=document.getElementById("placeholder");
  const table=document.getElementById("results-table");

  if(!watchlist.length){
    lastResults=[];
    table.classList.add("hidden");
    meta.classList.add("hidden");
    placeholder.classList.remove("hidden");
    placeholder.textContent="⭐ ウォッチリストに銘柄が登録されていません";
    return;
  }
  const codes=watchlist.map(w=>w.code);

  let date=null, prices={};
  const cached=Object.keys(priceCache).filter(d=>Object.keys(priceCache[d]).length>0);
  if(cached.length){
    date=cached.sort().at(-1);
    prices={...priceCache[date]};  // コピー（cacheを汚さない）
  }else{
    meta.classList.remove("hidden");
    meta.innerHTML=`<span style="color:var(--muted)">⭐ 株価データ取得中…</span>`;
    date=latestDate();
    for(let t=0;t<12;t++){
      if(!priceCache[date]){
        try{
          const r=await fetch(`${PROXY}/proxy/prices?date=${date}`);
          const d=await r.json();
          priceCache[date]={};
          (d.data||[]).forEach(q=>{
            const c=q.Close||q.C||q.AdjustmentClose;
            if(c)priceCache[date][q.Code]=q;
          });
        }catch{break;}
      }
      if(Object.keys(priceCache[date]).length){prices={...priceCache[date]};break;}
      const prev=new Date(date+"T12:00:00Z");
      prev.setDate(prev.getDate()-1);
      while(prev.getDay()===0||prev.getDay()===6)prev.setDate(prev.getDate()-1);
      date=prev.toISOString().slice(0,10);
    }
  }

  const missing=codes.filter(c=>!finsCache[c]||!finsCache[c].length);
  if(missing.length){
    meta.classList.remove("hidden");
    meta.innerHTML=`<span style="color:var(--muted)">⭐ 財務データ取得中… ${missing.length}件</span>`;
    for(const code of missing){
      if(!alive())return;  // 別リスト/ビューに切替 → 中断
      try{
        const r=await fetch(`${PROXY}/proxy/fins?code=${code}`);
        const d=await r.json();
        finsCache[code]=d.data||[];
      }catch{}
    }
  }
  if(!alive())return;

  // ★ 一括株価に含まれない銘柄は個別株価を補完取得
  const missingPrice=codes.filter(c=>!prices[c]);
  if(missingPrice.length){
    meta.classList.remove("hidden");
    meta.innerHTML=`<span style="color:var(--muted)">⭐ 個別株価取得中… ${missingPrice.length}件</span>`;
    for(const code of missingPrice){
      if(!alive())return;  // 別リスト/ビューに切替 → 中断
      try{
        const r=await fetch(`${PROXY}/proxy/prices?code=${code}`);
        const d=await r.json();
        const quotes=d.data||[];
        if(quotes.length)prices[code]=quotes[quotes.length-1];
      }catch{}
    }
  }
  if(!alive())return;

  const wlFilters={minA:-9999,maxA:9999,minEq:0,minRoa:0,minDiv:0,noTrap:false};
  const results=calcScreenResults(codes,prices,wlFilters);

  // ★ 計算できなかった銘柄も「データ不足」として必ず表示（登録順）
  const okCodes=new Set(results.map(r=>r.code));
  watchlist.forEach(w=>{
    if(!okCodes.has(w.code)){
      results.push({
        code:w.code, name:w.name||"", market:w.market||"", sector:w.sector||"",
        price:0,theory:0,upper:0,asset:0,business:0,
        alpha:null,level:"データ不足",lcolor:"#6b7280",
        bps:0,fEps:0,roa:0,eq:0,pbr:0,divYield:0,vt:false,
        condScore:null,sharpe:null,opm:null,incomplete:true
      });
    }
  });

  if(!alive())return;
  lastResults=results;
  placeholder.classList.add("hidden");
  table.classList.remove("hidden");
  meta.classList.remove("hidden");
  const incompleteCount=results.filter(r=>r.incomplete).length;
  meta.innerHTML=`⭐ <strong>${results.length}銘柄</strong>のウォッチリスト ／ 株価基準日: <strong>${date}</strong>
    ${incompleteCount>0?`<span style="color:var(--amber);font-size:11px;margin-left:8px">（データ不足: ${incompleteCount}件）</span>`:""}`;
  renderTable(applySort(results).slice(0,300));
}

// ══ スクリーニング実行 ════════════════════════════════════════════
document.getElementById("screen-btn").addEventListener("click",runScreen);
document.getElementById("abort-btn").addEventListener("click",()=>{
  if(screenAbortCtrl)screenAbortCtrl.abort();
});
["f-market","f-sector","f-mina","f-maxa","f-eq","f-roa","f-div","f-notrap"].forEach(id=>{
  const el=document.getElementById(id);
  if(el)el.addEventListener("change",()=>{
    if(document.getElementById("screen-btn").disabled&&screenAbortCtrl)
      screenAbortCtrl.abort();
  });
});

async function runScreen(){
  screenAbortCtrl=new AbortController();
  const sig=screenAbortCtrl.signal;
  const myGen=++renderGen;  // この実行の描画世代
  const alive=()=>!sig.aborted&&myGen===renderGen;  // 中断もビュー切替もされていない
  const btn=document.getElementById("screen-btn");
  const abortBtn=document.getElementById("abort-btn");
  const loading=document.getElementById("loading");
  const placeholder=document.getElementById("placeholder");

  btn.disabled=true;btn.textContent="実行中…";
  abortBtn.classList.remove("hidden");
  hideSpProgress();

  const filters={
    minA  :parseFloat(document.getElementById("f-mina").value)||-999,
    maxA  :parseFloat(document.getElementById("f-maxa").value)||999,
    minEq :parseFloat(document.getElementById("f-eq").value)||0,
    minRoa:parseFloat(document.getElementById("f-roa").value)||0,
    minDiv:parseFloat(document.getElementById("f-div").value)||0,
    minCond:parseInt(document.getElementById("f-cond")?.value||"0")||0,
    noTrap:document.getElementById("f-notrap").checked,
    market:document.getElementById("f-market").value,
    sector:document.getElementById("f-sector").value,
  };

  try{
    if(!masterCache){
      loading.classList.remove("hidden");
      setProgress(10,"銘柄一覧取得中…","");
      const r=await fetch(`${PROXY}/proxy/master`,{signal:sig});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error);
      masterCache=d.data||[];
    }
    let stocks=masterCache;
    if(filters.market)stocks=stocks.filter(s=>s.MktNm===filters.market);
    if(filters.sector)stocks=stocks.filter(s=>s.S33Nm===filters.sector);

    // Phase0: 既存キャッシュで即座に一覧表示（真っ白回避・暗く表示）
    // 日付検出/取得を待たず、直近のキャッシュ済み株価で先に描画する
    const cachedDates=Object.keys(priceCache).filter(d=>priceCache[d]&&Object.keys(priceCache[d]).length>0);
    if(cachedDates.length){
      const pd=cachedDates.sort().at(-1);
      const pp=priceCache[pd];
      const codes0=stocks.map(s=>s.Code).filter(c=>pp[c]&&finsCache[c]&&finsCache[c].length);
      if(codes0.length&&alive()){
        loading.classList.add("hidden");
        const r0=calcScreenResults(codes0,pp,filters);
        showScreenResults(r0,pd,"最新の株価を確認中…",filters.minCond||0);
      }
    }

    setProgress(20,"最新株価日を確認中…","(基準日を特定中)");
    const {bulkDate,probeDate}=await detectLatestPriceDate(sig);
    const date=bulkDate;
    lastProbeDate=probeDate;
    localStorage.setItem("screener_last_price_date",date);
    loading.classList.add("hidden");
    const prices=priceCache[date];
    const allCodes=stocks.map(s=>s.Code).filter(c=>prices[c]);

    // Phase1: キャッシュ済みを即表示
    const cachedCodes=allCodes.filter(c=>finsCache[c]&&finsCache[c].length);
    const missingCodes=allCodes.filter(c=>!finsCache[c]||!finsCache[c].length);
    if(!alive())return;
    if(cachedCodes.length>0){
      const partial=calcScreenResults(cachedCodes,prices,filters);
      showScreenResults(partial,date,missingCodes.length>0?`財務取得中 ${missingCodes.length}件…`:"",filters.minCond||0);
    }else if(missingCodes.length===0){
      showScreenResults([],date,"");
    }

    // Phase2: 未取得分を順次取得して更新
    if(missingCodes.length>0){
      setSpProgress(0,`0/${missingCodes.length}件 取得中`);
      for(let i=0;i<missingCodes.length;i++){
        if(sig.aborted)throw new DOMException("中断","AbortError");
        if(myGen!==renderGen)return;  // ビューが切り替わった → 描画せず終了
        const code=missingCodes[i];
        try{
          const r=await fetch(`${PROXY}/proxy/fins?code=${code}`,{signal:sig});
          const d=await r.json();
          finsCache[code]=d.data||[];
          freshCodes.add(code);  // 取得済み → 明るく表示
        }catch(e){
          if(e.name==="AbortError")throw e;
          finsCache[code]=[];
        }
        const done=i+1;
        const pct=Math.round(done/missingCodes.length*100);
        const remain=Math.round((missingCodes.length-done)*14/60);
        setSpProgress(pct,`${done}/${missingCodes.length}件 取得中${remain>0?` 残約${remain}分`:""}`);
        if((done%20===0||done===missingCodes.length)&&alive()){
          const r=calcScreenResults(allCodes,prices,filters);
          showScreenResults(r,date,done<missingCodes.length?`財務取得中 ${missingCodes.length-done}件残…`:"",filters.minCond||0);
        }
      }
      hideSpProgress();
    }

    if(!alive())return;
    const finalResults=calcScreenResults(allCodes,prices,filters);
    showScreenResults(finalResults,date,"",filters.minCond||0);
    screeningDate=date;screeningPrices=prices;
    console.log("[SCREEN] 完了 結果:",finalResults.length,"件");

  }catch(e){
    loading.classList.add("hidden");
    hideSpProgress();
    if(e.name==="AbortError"){
      // ビューが切り替わって中断された場合は表示に一切触れない
      if(myGen!==renderGen){
        // ウォッチリスト等へ切替済み → 何もしない
      }else if(lastResults.length){
        const meta=document.getElementById("results-meta");
        if(meta&&!meta.classList.contains("hidden")){
          meta.innerHTML+=' <span style="color:var(--amber);font-size:11px">⏹ 中断（現在の結果を表示中・詳細閲覧可）</span>';
        }
      }else{
        placeholder.classList.remove("hidden");
        placeholder.textContent="⏹ スクリーニングを中断しました";
        document.getElementById("results-table").classList.add("hidden");
        document.getElementById("results-meta").classList.add("hidden");
      }
    }else{
      placeholder.classList.remove("hidden");
      placeholder.textContent="エラー: "+e.message;
    }
  }finally{
    btn.disabled=false;btn.textContent="スクリーニング実行";
    document.getElementById("abort-btn").classList.add("hidden");
    startBgIfNeeded();
  }
}
