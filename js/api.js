// ══ 日付ユーティリティ ══════════════════════════════════════════════
function prevTradingDay(dateStr){
  const d=new Date(dateStr+"T12:00:00Z");
  d.setDate(d.getDate()-1);
  while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()-1);
  return d.toISOString().slice(0,10);
}
function nextTradingDay(dateStr){
  const d=new Date(dateStr+"T12:00:00Z");
  d.setDate(d.getDate()+1);
  while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()+1);
  return d.toISOString().slice(0,10);
}
// 直近営業日（Freeプランは遅延があるため3日前を基準）
function latestDate(){
  const d=new Date();d.setDate(d.getDate()-3);
  while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()-1);
  return d.toISOString().slice(0,10);
}
// Freeプランの遅延を考慮した開始日（約90日前）
function latestDateStart(){
  const d=new Date();d.setDate(d.getDate()-90);
  while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()-1);
  return d.toISOString().slice(0,10);
}

// ══ 最新株価日の特定 ══════════════════════════════════════════════
// ①トヨタ(72030)個別履歴で最新日を取得 → ②bulk取得試行
async function detectLatestPriceDate(sig){
  let probeDate=null;
  try{
    const r=await fetch(`${PROXY}/proxy/prices?code=72030`,{signal:sig});
    if(r.ok){
      const d=await r.json();
      const dates=(d.data||[]).map(q=>(q.Date||"").slice(0,10)).filter(Boolean).sort();
      if(dates.length)probeDate=dates.at(-1);
    }
  }catch(e){if(e.name==="AbortError")throw e;}

  const savedDate=localStorage.getItem("screener_last_price_date");
  let startDate=probeDate||savedDate||latestDateStart();

  let bulkDate=startDate;
  for(let i=0;i<5;i++){
    if(sig.aborted)throw new DOMException("中断","AbortError");
    const cnt=await fetchPricesForDate(bulkDate,sig);
    if(cnt>0)break;
    bulkDate=prevTradingDay(bulkDate);
  }
  return {bulkDate, probeDate: probeDate||bulkDate};
}

// 指定日の全銘柄株価を取得（キャッシュ優先）
async function fetchPricesForDate(date,sig){
  if(priceCache[date])return Object.keys(priceCache[date]).length;
  try{
    const r=await fetch(`${PROXY}/proxy/prices?date=${date}`,{signal:sig});
    priceCache[date]={};
    if(r.ok){
      const d=await r.json();
      (d.data||[]).forEach(q=>{
        const c=q.Close||q.C||q.AdjustmentClose;
        if(c)priceCache[date][q.Code]=q;
      });
    }
    return Object.keys(priceCache[date]).length;
  }catch(e){
    if(e.name==="AbortError")throw e;
    return 0;
  }
}
