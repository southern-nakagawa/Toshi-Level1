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
// 今日のカレンダー日（ローカル）
function todayStr(){
  const d=new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}

async function detectLatestPriceDate(sig){
  const savedDate=localStorage.getItem("screener_last_price_date");
  const detectDay=localStorage.getItem("screener_detect_day");
  const today=todayStr();
  const dayChanged=(detectDay!==today);  // 前回検出から日付が変わったか

  // 日付が変わっていなければ保存日を再利用（高速・プローブなし）
  if(!dayChanged&&savedDate){
    if(priceCache[savedDate]&&Object.keys(priceCache[savedDate]).length>0){
      return {bulkDate:savedDate, probeDate:savedDate};
    }
    const cnt=await fetchPricesForDate(savedDate,sig);
    if(cnt>0)return {bulkDate:savedDate, probeDate:savedDate};
  }

  // 日付が変わった or キャッシュなし → トヨタで最新営業日を再検出（1日1回）
  let probeDate=null;
  try{
    const r=await fetch(`${PROXY}/proxy/prices?code=72030`,{signal:sig});
    if(r.ok){
      const d=await r.json();
      const dates=(d.data||[]).map(q=>(q.Date||"").slice(0,10)).filter(Boolean).sort();
      if(dates.length)probeDate=dates.at(-1);
    }
  }catch(e){if(e.name==="AbortError")throw e;}

  let startDate=probeDate||savedDate||latestDateStart();
  let bulkDate=startDate;
  for(let i=0;i<5;i++){
    if(sig.aborted)throw new DOMException("中断","AbortError");
    const cnt=await fetchPricesForDate(bulkDate,sig);
    if(cnt>0)break;
    bulkDate=prevTradingDay(bulkDate);
  }
  localStorage.setItem("screener_detect_day",today);  // 本日検出済みと記録
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
