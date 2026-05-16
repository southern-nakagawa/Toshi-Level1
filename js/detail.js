// ══ 株規模・リスク分類ヘルパー ════════════════════════════════════
function classifySize(mc){
  if(mc>=1e12)return{label:'大型株',color:'#3b82f6',note:'機関投資家も多く安定',level:'中長期向き・安定'};
  if(mc>=3e10)return{label:'中型株',color:'#10b981',note:'バランス型。中長期向き',level:'中長期向き・標準'};
  if(mc>=5e9) return{label:'小型株',color:'#f59e0b',note:'流動性に注意。中〜上級者向き',level:'上級者向き・注意'};
  return{label:'超小型株',color:'#ef4444',note:'売買困難な場合あり。上級者専用',level:'上級者専用・高リスク'};
}
function pbrZone(pbr){
  if(pbr<0.3) return{label:'超割安注意',color:'#ef4444',note:'バリュートラップの可能性が高い'};
  if(pbr<0.5) return{label:'要観察',color:'#f59e0b',note:'割安だが業績確認が必要'};
  if(pbr<=3)  return{label:'標準圏 ✓',color:'#10b981',note:'一般的な評価範囲（安心帯）'};
  if(pbr<=5)  return{label:'やや割高',color:'#f59e0b',note:'高成長期待が織り込まれている'};
  return{label:'割高圏',color:'#ef4444',note:'高成長が継続しないと危険'};
}
function roaStability(roas){
  const valid=roas.filter(v=>v>0);
  if(valid.length<3)return{label:'データ不足',color:'#6b7280',std:null};
  const mean=valid.reduce((a,b)=>a+b,0)/valid.length;
  const std=Math.sqrt(valid.reduce((a,v)=>a+(v-mean)**2,0)/valid.length);
  if(std<1.5)return{label:'高安定 ✓',color:'#10b981',std:Math.round(std*10)/10};
  if(std<4)  return{label:'標準',color:'#eab308',std:Math.round(std*10)/10};
  return{label:'変動大',color:'#ef4444',std:Math.round(std*10)/10};
}
function liquidityRisk(mc){
  if(mc>=1e11)return{label:'流動性 十分',color:'#10b981',note:'大口の売買も問題なし'};
  if(mc>=3e10)return{label:'流動性 普通',color:'#eab308',note:'通常の売買は問題なし'};
  if(mc>=5e9) return{label:'流動性 注意',color:'#f59e0b',note:'大量注文でスリッページに注意'};
  return{label:'流動性 高リスク',color:'#ef4444',note:'売買が成立しにくい場合あり'};
}

// ══ 詳細パネル ══════════════════════════════════════════════════
async function loadDetail(code,screened){
  activeCode=code;
  document.getElementById("d-empty").classList.add("hidden");
  const dc=document.getElementById("d-content");
  dc.classList.remove("hidden");
  dc.innerHTML='<div class="loading-wrap" style="padding:40px"><div class="spinner"></div><div class="loading-text">取得中\u2026</div></div>';
  if(chart){chart.destroy();chart=null;}
  try{
    const myCode=code;
    const info=(masterCache||[]).find(s=>s.Code===code)||{};
    let stmts;
    if(finsCache[code]&&finsCache[code].length){
      stmts=finsCache[code];
    }else{
      const fr=await fetch(`${PROXY}/proxy/fins?code=${code}`).then(r=>r.json());
      if(activeCode!==myCode)return;
      stmts=Array.isArray(fr.data)?fr.data:(fr.data?[fr.data]:[]);
      finsCache[code]=stmts;
    }
    const pr=await fetch(`${PROXY}/proxy/prices?code=${code}`).then(r=>r.json());
    if(activeCode!==myCode)return;
    const quotes=pr.data||[];

    const validStmtsD=stmts.filter(s=>parseFloat(s.BPS||0)>0);
    const ls=validStmtsD.length?validStmtsD[validStmtsD.length-1]:(stmts.length?stmts[stmts.length-1]:{});
    let fOp=0;
    {
      const _qD={'1Q':1,'2Q':2,'3Q':3,'FY':4}[ls.CurPerType]||4;
      const _opTmp=safe(ls.OdP||ls.OP);
      if(_qD===4&&_opTmp>0){fOp=_opTmp;}
      else{for(let i=stmts.length-1;i>=0;i--){const v=safe(stmts[i].FOdP||stmts[i].FOP);if(v>0){fOp=v;break;}}}
    }
    let div=0;
    for(let i=stmts.length-1;i>=0;i--){
      const v=safe(stmts[i].FDivAnn||stmts[i].FDivFY||stmts[i].DivAnn||stmts[i].NxFDivAnn);
      if(v>0){div=v;break;}
    }
    const bps   =safe(ls.BPS),ta=safe(ls.TA),eq=safe(ls.EqAR);
    const op    =safe(ls.OdP||ls.OP),shares=safe(ls.ShOutFY);
    const qNumD ={'1Q':1,'2Q':2,'3Q':3,'FY':4}[ls.CurPerType]||4;
    const annOpD=qNumD<4?op*(4/qNumD):op;
    const fEpsRaw=fOp>0&&shares>0?fOp*.7/shares:(annOpD>0&&shares>0?annOpD*.7/shares:0);
    const roaRaw =annOpD>0&&ta>0?annOpD/ta:0;
    const latestQ=quotes.length?quotes[quotes.length-1]:{};
    const latestPrice=safe(latestQ.C||latestQ.Close);
    const price=screened?screened.price:(latestPrice||0);
    const pbr =bps>0&&price>0?price/bps:1;
    const t   =calcTheory(bps,fEpsRaw,roaRaw,eq,pbr);
    const a   =calcAlpha(t.theory,price);
    const opForUpper=fOp>0?fOp:annOpD;
    const fEpsForUpper=opForUpper>0&&shares>0?opForUpper*.7/shares:0;
    const tDisplay={...t,upper:calcTheory(bps,fEpsForUpper,roaRaw,eq,pbr).upper};
    const lv  =levelOf(a);
    const div4=div>0?Math.round(div/0.04):0;
    const vt  =price>0&&pbr<0.3&&(a??0)>100;
    const marketCap=price*shares;
    const priceHist=getSplitAdjustedHistory(quotes).slice(-504);
    const quoteByDate={};
    quotes.forEach(q=>quoteByDate[(q.Date||"").slice(0,10)]=q);
    const splitEvents=[];
    const sortedPH=priceHist.slice().sort((a,b)=>a.date.localeCompare(b.date));
    for(let i=1;i<sortedPH.length;i++){
      const cur=sortedPH[i],prev=sortedPH[i-1];
      const curOrig =parseFloat((quoteByDate[cur.date] ||{}).Close||(quoteByDate[cur.date] ||{}).C||0);
      const prevOrig=parseFloat((quoteByDate[prev.date]||{}).Close||(quoteByDate[prev.date]||{}).C||0);
      if(curOrig>0&&prevOrig>0&&cur.close>0&&prev.close>0){
        const curF=curOrig/cur.close,prevF=prevOrig/prev.close;
        if(prevF>1.05&&curF<1.05&&prevF/curF>1.5){const f=Math.round(prevF);if(f>=2)splitEvents.push({date:cur.date,factor:f});}
      }
    }
    function getCumSplitFactor(pDate){let cum=1;splitEvents.forEach(ev=>{if(ev.date>pDate)cum*=ev.factor;});return cum;}
    const qNumMap={'1Q':1,'2Q':2,'3Q':3,'FY':4};
    function approxPeriodEnd(s){
      const fy=new Date((s.CurFYEn||"2000-01-01")+"T00:00:00Z");
      fy.setMonth(fy.getMonth()-(4-(qNumMap[s.CurPerType]||4))*3);return fy;
    }
    function effectiveDate(s){
      const disc=(s.DisclosureDate||"").slice(0,10);
      return disc>="2000-01-01"?disc:approxPeriodEnd(s).toISOString().slice(0,10);
    }
    const allBps=stmts.filter(s=>parseFloat(s.BPS||0)>0);
    const fyRecs=allBps.filter(s=>s.CurPerType==="FY").slice(-8);
    const qRecs =allBps.filter(s=>['1Q','2Q','3Q'].includes(s.CurPerType)).slice(-6);
    const histRecs=[...fyRecs,...qRecs].sort((a,b)=>approxPeriodEnd(a)-approxPeriodEnd(b));
    const chartHistRecs=[...allBps].sort((a,b)=>approxPeriodEnd(a)-approxPeriodEnd(b));

    function buildHistArray(recs){
      const out=[];
      recs.forEach(s=>{
        const _bps=safe(s.BPS),_ta=safe(s.TA),_eq=safe(s.EqAR),_eqN=_eq>1?_eq/100:_eq;
        const _op=safe(s.OdP||s.OP),_ns=safe(s.Sales),_sh=safe(s.ShOutFY);
        const _fOp=safe(s.FOdP||s.FOP||s.NxFOdP||s.NxFOP);
        const _div=safe(s.FDivAnn||s.FDivFY||s.DivAnn||s.NxFDivAnn);
        const isFY=s.CurPerType==="FY",qNum=qNumMap[s.CurPerType]||4;
        const _annualOp=qNum<4?_op*(4/qNum):_op,_roa=_annualOp>0&&_ta>0?_annualOp/_ta:0;
        const _fOpEff=isFY?(_fOp>0?_fOp:_op):(_fOp>0?_fOp:_annualOp),_isFcast=_fOp>0;
        const _fEps=_fOpEff>0&&_sh>0?_fOpEff*.7/_sh:0;
        const _opU=Math.max(_fOp,isFY?_op:_annualOp),_fEpsU=_opU>0&&_sh>0?_opU*.7/_sh:0;
        const _t=calcTheory(_bps,_fEps,_roa,_eqN,1),_tU=calcTheory(_bps,_fEpsU,_roa,_eqN,1);
        const pEnd=approxPeriodEnd(s),pEndStr=pEnd.toISOString().slice(0,10);
        const periodLabel=isFY?(s.CurFYEn||"").slice(0,7):pEnd.toISOString().slice(0,7)+" ("+s.CurPerType+")";
        const sf=getCumSplitFactor(pEndStr),splitNote=sf>1?"÷"+sf:"";
        const fEpsNote=(isFY?(_isFcast?"":"実"):(_isFcast?"予":"推"))+splitNote;
        out.push({
          period:periodLabel,effectivePeriod:effectiveDate(s),isFY,perType:s.CurPerType||"FY",
          theory:Math.round(_t.theory/sf),upper:Math.round(_tU.upper/sf),
          bps:Math.round(_bps/sf),fEps:Math.round(_fEps/sf*10)/10,fEpsNote,
          roa:Math.round(_roa*1000)/10,eq:Math.round(_eqN*1000)/10,
          sales:Math.round(_ns/1e8*10)/10,opProfit:Math.round(_op/1e8*10)/10,
          div:Math.round(_div/sf*10)/10,div4:_div>0?Math.round(_div/0.04/sf):0
        });
      });
      return out;
    }
    const hist=buildHistArray(histRecs),chartHist=buildHistArray(chartHistRecs);
    const dObj={
      info,code,price,latestPrice,screeningDate,t:tDisplay,a,lv,lcolor:LCOLOR[lv]||"#6b7280",
      bps,fEps:Math.round(fEpsRaw*10)/10,roa:Math.round(roaRaw*1000)/10,
      eq:Math.round(eq*1000)/10,pbr:Math.round(pbr*100)/100,
      div,div4,divYield:div>0&&price>0?Math.round(div/price*10000)/100:0,
      hist,chartHist,priceHist,vt,marketCap,shares
    };
    renderDetail(dObj);
    if(typeof computeConditions==="function"){
      try{const cond=computeConditions(dObj);condCache[code]=cond;renderConditionBlock(code,cond);updateRowBadge(code);}
      catch(e){console.warn("[COND]",e);}
    }
  }catch(e){
    document.getElementById("d-content").innerHTML=`<div class="empty-detail">エラー: ${e.message}</div>`;
  }
}

function renderDetail(d){
  const dc=document.getElementById("d-content");
  const ac=(d.a??0)>=0?"var(--green)":"var(--red)";
  const maxB=Math.max(d.price,d.t.theory,d.t.upper,1);
  const pct=v=>Math.round(v/maxB*100);
  const watched=isWatched(d.code);
  const sz=d.marketCap>0?classifySize(d.marketCap):null;
  const pz=pbrZone(d.pbr);
  const roas=d.hist.map(h=>h.roa).filter(v=>v>0);
  const rs=roaStability(roas);
  const lq=d.marketCap>0?liquidityRisk(d.marketCap):null;
  const mcDisplay=d.marketCap>0?(d.marketCap>=1e12
    ?(Math.round(d.marketCap/1e11)/10).toFixed(1)+"兆円"
    :Math.round(d.marketCap/1e8).toLocaleString()+"億円"):"—";

  dc.innerHTML=`
<div class="detail-header">
  <div>
    <div class="d-code">${d.code}</div>
    <div class="d-name">${d.info.CoName||""}</div>
    <div class="d-sub">${d.info.MktNm||""} ／ ${d.info.S33Nm||""}</div>
  </div>
  <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
    <button class="close-btn" id="close-detail">✕</button>
    <button class="watch-btn${watched?" watched":""}" id="watch-btn">${watched?"★ 登録解除":"☆ ウォッチ登録"}</button>
  </div>
</div>
<div class="ext-links">
  <span style="font-size:11px;color:var(--muted);align-self:center;flex-shrink:0">外部リンク:</span>
  <a class="ext-link" href="https://irbank.net/${d.code.slice(0,4)}/results" target="_blank"
    data-tip="IR Bank: 過去10年の財務データを無料閲覧（最も詳細）">📊 IR Bank</a>
  <a class="ext-link" href="https://kabutan.jp/stock/?code=${d.code.slice(0,4)}" target="_blank"
    data-tip="株探: 決算・ニュース・チャートを確認">📈 株探</a>
  <a class="ext-link" href="https://finance.yahoo.co.jp/quote/${d.code.slice(0,4)}.T" target="_blank"
    data-tip="Yahoo!ファイナンス: 株価・指標・掲示板">💹 Yahoo!</a>
  <a class="ext-link" href="https://minkabu.jp/stock/${d.code.slice(0,4)}" target="_blank"
    data-tip="みんかぶ: 予想・目標株価・口コミ">👥 みんかぶ</a>
  <a class="ext-link" href="https://www.release.tdnet.info/inbs/I_main_00.html?code=${d.code}" target="_blank"
    data-tip="TDnet: 決算短信・有価証券報告書の原本（適時開示）">📄 適時開示</a>
</div>
${d.vt?`<div class="vt-banner" data-tip="PBR ${fmtPbr(d.pbr)}倍かつα値 +${fmtPct1(d.a??0)}%。市場が割安と評価しない何らかの理由がある可能性があります。&#10;業績悪化・財務リスク・業界衰退など。IR Bankで過去10年の実績を確認してください。">
  ⚠️ <strong>バリュートラップ注意！</strong> PBR ${fmtPbr(d.pbr)}倍 × α値 +${fmtPct1(d.a??0)}%
  <span style="color:#fca5a5;margin-left:8px;font-size:11px">→ 市場が割安と見なさない要因がある可能性。業績・財務の詳細確認を推奨</span>
</div>`:""}
<div class="metric-grid">
  <div class="mc hl">
    <div class="ml">株価（基準日: ${d.screeningDate||"―"}）</div>
    <div class="mv">¥${fmtPrice(d.price)}</div>
    <div class="ms">PBR: ${fmtPbr(d.pbr)}倍${d.latestPrice&&d.latestPrice!==d.price?` ／ 参考最新: <span style="color:var(--amber)">¥${fmtPrice(d.latestPrice)}</span>`:""}</div>
  </div>
  <div class="mc hl">
    <div class="ml">α値（割安度）</div>
    <div class="mv" style="color:${ac}">${fmtAlpha(d.a??0)}%</div>
    <div class="ms"><span class="lbadge" style="background:${d.lcolor}">${d.lv}</span></div>
  </div>
  <div class="mc"><div class="ml">理論株価</div><div class="mv" style="color:var(--gold)">¥${fmtPrice(d.t.theory)}</div>
    <div class="ms">資産:¥${fmtPrice(d.t.asset)} ＋ 事業:¥${fmtPrice(d.t.business)}</div></div>
  <div class="mc"><div class="ml">上限株価</div><div class="mv" style="color:var(--amber)">¥${fmtPrice(d.t.upper)}</div>
    <div class="ms">割高ライン目安</div></div>
  <div class="mc"><div class="ml">ROA</div>
    <div class="mv ${d.roa>=5?"pos":d.roa<2?"neg":""}">${fmtPct1(d.roa)}%</div>
    <div class="ms">事業効率性</div></div>
  <div class="mc"><div class="ml">自己資本比率</div>
    <div class="mv ${d.eq>=50?"pos":d.eq<30?"neg":""}">${fmtPct1(d.eq)}%</div>
    <div class="ms">財務健全性</div></div>
  <div class="mc"><div class="ml">BPS（1株純資産）</div><div class="mv">${fmtPrice(d.bps)}</div>
    <div class="ms">解散価値の基準</div></div>
  <div class="mc"><div class="ml">予想EPS（はっしゃん式）</div><div class="mv">${fmtEps(d.fEps)}</div>
    <div class="ms">予想経常利益×0.7÷株式数</div></div>
  ${d.div>0?`<div class="mc"><div class="ml">配当（年間）</div>
    <div class="mv" style="color:var(--accent)">¥${d.div}</div>
    <div class="ms">利回り: ${fmtPct1(d.divYield)}%</div></div>
  <div class="mc"><div class="ml">配当4%ライン</div><div class="mv">¥${fmtPrice(d.div4)}</div>
    <div class="ms">長期保有の目安</div></div>`:""}
</div>
<div class="size-wrap">
  <h4 style="margin:0 0 8px;font-size:12px;color:var(--muted)">株規模・投資難易度</h4>
  <div class="size-grid">
    ${sz?`<div class="size-item" data-tip="時価総額（株価×発行株数）による規模分類。&#10;大型株: 1兆円以上 / 中型株: 300億〜1兆円 / 小型株: 50〜300億円 / 超小型株: 50億円未満&#10;${sz.note}">
      <span class="size-badge" style="background:${sz.color}22;color:${sz.color};border:1px solid ${sz.color}44">${sz.label}</span>
      <div><div style="font-size:11px;color:var(--muted)">時価総額: ${mcDisplay}</div>
      <div style="font-size:11px;color:var(--muted)">${sz.level}</div></div></div>`:""}
    ${lq?`<div class="size-item" data-tip="流動性リスク（時価総額ベース）。&#10;${lq.note}&#10;流動性が低いと希望価格での売買が困難になる場合があります">
      <span class="size-badge" style="background:${lq.color}22;color:${lq.color};border:1px solid ${lq.color}44">${lq.label}</span>
      <div style="font-size:11px;color:var(--muted)">${lq.note}</div></div>`:""}
    <div class="size-item" data-tip="PBR安心度: PBR（株価純資産倍率）の評価ゾーン。&#10;0.5〜3倍が一般的に安全圏。0.3未満はバリュートラップリスク。3倍超は成長期待&#10;${pz.note}">
      <span class="size-badge" style="background:${pz.color}22;color:${pz.color};border:1px solid ${pz.color}44">PBR: ${pz.label}</span>
      <div style="font-size:11px;color:var(--muted)">${pz.note}</div></div>
    <div class="size-item" data-tip="業績安定度: ROAの標準偏差（過去${roas.length}期分）。&#10;低いほど業績が安定していて予測しやすい。&#10;1.5%未満: 高安定 / 1.5〜4%: 標準 / 4%超: 変動大${rs.std!==null?" (σ="+rs.std+"%)":""}">
      <span class="size-badge" style="background:${rs.color}22;color:${rs.color};border:1px solid ${rs.color}44">業績安定: ${rs.label}</span>
      <div style="font-size:11px;color:var(--muted)">${rs.std!==null?"ROA変動 ±"+rs.std+"% ("+roas.length+"期)":roas.length+"期のデータ"}</div></div>
  </div>
</div>
<div class="bar-wrap"><h4>株価水準イメージ</h4>
  <div class="bar-row">
    <span class="bar-lbl" style="color:var(--muted)" data-tip="J-Quantsの最新利用可能日の終値">株価</span>
    <div class="bar-bg"><div class="bar-fill" style="width:${pct(d.price)}%;background:var(--accent)"></div></div>
    <span class="bar-val" style="color:var(--accent)">¥${fmtPrice(d.price)}</span>
  </div>
  <div class="bar-row">
    <span class="bar-lbl" style="color:var(--gold)" data-tip="はっしゃん式による理論上の適正株価">理論株価</span>
    <div class="bar-bg"><div class="bar-fill" style="width:${pct(d.t.theory)}%;background:var(--gold)"></div></div>
    <span class="bar-val" style="color:var(--gold)">¥${fmtPrice(d.t.theory)}</span>
  </div>
  <div class="bar-row">
    <span class="bar-lbl" style="color:var(--amber)" data-tip="実績利益ベースで事業価値を最大評価した上限価格">上限株価</span>
    <div class="bar-bg"><div class="bar-fill" style="width:${pct(d.t.upper)}%;background:var(--amber)"></div></div>
    <span class="bar-val" style="color:var(--amber)">¥${fmtPrice(d.t.upper)}</span>
  </div>
  ${d.div4>0?`<div class="bar-row">
    <span class="bar-lbl" style="color:var(--accent)" data-tip="配当利回りが4%になる株価">配当4%</span>
    <div class="bar-bg"><div class="bar-fill" style="width:${pct(d.div4)}%;background:var(--accent)"></div></div>
    <span class="bar-val" style="color:var(--accent)">¥${fmtPrice(d.div4)}</span>
  </div>`:""}
</div>
<div class="chart-wrap">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
    <h4 style="margin:0">株価推移（過去2年・分割調整済み）
      <span style="font-size:10px;color:var(--muted)">— 株価 &nbsp;— 理論株価 &nbsp;— 上限株価${d.div>0?` &nbsp;<span style="color:#ef4444">— 配当利回り(右軸)</span>`:""}</span>
    </h4>
    <div class="chart-toggle">
      <button id="yscale-all" class="${chartScaleMode==='all'?'active':''}">全体</button>
      <button id="yscale-price" class="${chartScaleMode==='price'?'active':''}">株価基準</button>
    </div>
  </div>
  <canvas id="price-chart" height="160"></canvas>
</div>
${d.hist.length?`<div class="hist-wrap"><h4>財務履歴</h4>
  <table class="hist-tbl"><thead><tr>
    <th data-tip="FY=通期決算（実績）&#10;1Q/2Q/3Q=四半期報告（当期年間予想ベース）">期</th>
    <th data-tip="はっしゃん式理論株価（PBR=1基準）">理論株価</th>
    <th>BPS</th>
    <th data-tip="予=当期年間予想 実=実績OdP 推=FOdP無・年率換算推計">予想EPS</th>
    <th>ROA%</th><th>自己資本比率%</th><th>売上(億)</th><th>経常利益(億)</th>
  </tr></thead><tbody>
  ${d.hist.map(h=>`<tr class="${h.isFY?"":"hist-q-row"}">
    <td style="${h.isFY?"":"color:var(--muted);font-size:12px"}">${h.period}</td>
    <td style="color:${h.isFY?"var(--gold)":"#a07830"}">¥${fmtPrice(h.theory)}</td>
    <td>${fmtPrice(h.bps)}</td>
    <td>${fmtEps(h.fEps)}${h.fEpsNote?`<span style="color:var(--muted);font-size:9px;margin-left:2px">(${h.fEpsNote})</span>`:""}</td>
    <td class="${h.roa>=5?"pos":h.roa<2?"neg":""}">${fmtPct1(h.roa)}%</td>
    <td class="${h.eq>=50?"pos":h.eq<30?"neg":""}">${fmtPct1(h.eq)}%</td>
    <td>${h.sales}</td>
    <td class="${h.opProfit>0?"pos":"neg"}">${h.opProfit}</td>
  </tr>`).join("")}
  </tbody></table></div>`:""}
<div id="cond-block"></div>
<div style="height:24px"></div>`;

  document.getElementById("close-detail").addEventListener("click",closeDetail);
  document.getElementById("watch-btn").addEventListener("click",()=>{
    toggleWatch(d.code,d.info);
    const w=isWatched(d.code);
    const btn=document.getElementById("watch-btn");
    btn.textContent=w?"★ 登録解除":"☆ ウォッチ登録";
    btn.classList.toggle("watched",w);
  });
  currentDetailData=d;
  ["yscale-all","yscale-price"].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.addEventListener("click",()=>{
      chartScaleMode=id==="yscale-all"?"all":"price";
      document.getElementById("yscale-all").classList.toggle("active",chartScaleMode==="all");
      document.getElementById("yscale-price").classList.toggle("active",chartScaleMode==="price");
      buildChart(currentDetailData,chartScaleMode);
    });
  });
  buildChart(d,chartScaleMode);
}
