// condCache保存（localStorage）
function saveCondCache(){
  try{localStorage.setItem("screener_cond_cache",JSON.stringify(condCache));}
  catch(e){}
}

// ══ コア4条件計算エンジン ══════════════════════════════════════════

function pearson(xs, ys) {
  const n = xs.length;
  if(n < 10) return 0;
  const mx = xs.reduce((a,b)=>a+b,0)/n;
  const my = ys.reduce((a,b)=>a+b,0)/n;
  let num=0, sdx=0, sdy=0;
  for(let i=0;i<n;i++){
    const ex=xs[i]-mx, ey=ys[i]-my;
    num+=ex*ey; sdx+=ex*ex; sdy+=ey*ey;
  }
  const denom=Math.sqrt(sdx*sdy);
  return denom>0?num/denom:0;
}

function computeConditions(d) {
  const result={corr:null,disc:null,growth:null,div:null,score:0,computed:true};

  // 時系列ソート済みhist
  const sortedHist=[...d.hist].sort((a,b)=>
    (a.effectivePeriod||a.period).localeCompare(b.effectivePeriod||b.period));

  if(sortedHist.length<2) return result;

  const sh=[...(d.chartHist&&d.chartHist.length?d.chartHist:d.hist)]
    .sort((a,b)=>(a.effectivePeriod||a.period).localeCompare(b.effectivePeriod||b.period));

  // ══ 1. 正相関度 ════════════════════════════════════════════════
  if(d.priceHist&&d.priceHist.length>=10&&sh.length>=2){
    const firstEff=sh[0].effectivePeriod||sh[0].period;
    const paired=[];
    d.priceHist.forEach(p=>{
      if(p.date<firstEff)return;
      let th=sh[0].theory;
      for(const h of sh){
        if((h.effectivePeriod||h.period)<=p.date)th=h.theory;
        else break;
      }
      if(th>0)paired.push({price:p.close,theory:th});
    });
    if(paired.length>=10){
      const prices=paired.map(p=>p.price),theories=paired.map(p=>p.theory);
      const fullCorr=pearson(prices,theories);
      const n252=Math.min(252,paired.length);
      const p1y=paired.slice(-n252);
      const oneYearCorr=pearson(p1y.map(p=>p.price),p1y.map(p=>p.theory));
      const theoryGrowth=sh[sh.length-1].theory>=sh[0].theory;
      result.corr={
        fullCorr:Math.round(fullCorr*100),
        oneYearCorr:Math.round(oneYearCorr*100),
        theoryGrowth,
        ok:fullCorr>=0.5&&oneYearCorr>=0.5&&theoryGrowth
      };
    }
  }

  // ══ 2. 割安修正 ════════════════════════════════════════════════
  if(sortedHist.length>=3&&d.priceHist&&d.priceHist.length>0){
    const alphas=sortedHist.map(h=>{
      if(!h.theory||h.theory<=0)return null;
      const eff=h.effectivePeriod||h.period;
      // 開示日以降で最も近い株価を取得
      let best=null,bestDiff=Infinity;
      for(const p of d.priceHist){
        const diff=Math.abs(new Date(p.date)-new Date(eff));
        if(diff<bestDiff){bestDiff=diff;best=p;}
      }
      if(!best||!best.close)return null;
      return(h.theory-best.close)/best.close*100;
    }).filter(v=>v!==null);

    if(alphas.length>=2){
      const avgAlpha=alphas.reduce((a,b)=>a+b,0)/alphas.length;
      const latestAlpha=d.a??0;
      result.disc={
        avgAlpha:Math.round(avgAlpha*10)/10,
        latestAlpha:Math.round(latestAlpha*10)/10,
        ok:avgAlpha>=0&&latestAlpha>=0&&latestAlpha<avgAlpha
      };
    }
  }

  // ══ 3. 持続成長 ════════════════════════════════════════════════
  const theoryVals=sortedHist.map(h=>h.theory).filter(v=>v>0);
  if(theoryVals.length>=3){
    let netMoves=0;
    for(let i=1;i<theoryVals.length;i++){
      if(theoryVals[i]>theoryVals[i-1])netMoves++;
      else if(theoryVals[i]<theoryVals[i-1])netMoves--;
    }
    const maxT=Math.max(...theoryVals),latestT=theoryVals[theoryVals.length-1];
    const peakRatio=maxT>0?latestT/maxT:1;
    // 2年換算閾値: +2以上（10年+8 → 2年+1.6 → 切り上げ+2）
    result.growth={
      netMoves,peakRatio:Math.round(peakRatio*100),
      total:theoryVals.length-1,
      ok:netMoves>=2&&peakRatio>=0.85
    };
  }

  // ══ 4. 配当成長 ════════════════════════════════════════════════
  const divRecs=sortedHist.filter(h=>h.isFY&&h.div>0);
  if(divRecs.length>=2){
    const divs=divRecs.map(h=>h.div);
    let divNet=0;
    for(let i=1;i<divs.length;i++){
      if(divs[i]>divs[i-1])divNet++;
      else if(divs[i]<divs[i-1])divNet--;
    }
    const div4Vals=divRecs.map(h=>h.div4||Math.round(h.div/0.04));
    const maxDiv4=Math.max(...div4Vals),latestDiv4=div4Vals[div4Vals.length-1];
    const div4Peak=maxDiv4>0?latestDiv4/maxDiv4:1;
    // 2年換算閾値: +1以上（FYデータは最大2件）
    result.div={
      netMoves:divNet,div4PeakRatio:Math.round(div4Peak*100),
      dataPoints:divRecs.length,
      ok:divNet>=1&&div4Peak>=0.85
    };
  }else if(d.div===0){
    result.div={noDiv:true,ok:false};
  }

  result.score=[result.corr?.ok,result.disc?.ok,result.growth?.ok,result.div?.ok]
    .filter(Boolean).length;
  return result;
}

// ── スコアドット表示 ──────────────────────────────────────────
function scoreDotsHTML(cond){
  const items=[cond.corr,cond.disc,cond.growth,cond.div];
  const labels=['①正相関','②割安修正','③持続成長','④配当成長'];
  return items.map((c,i)=>{
    if(!c)return`<span style="color:#334155;font-size:14px" title="${labels[i]}: 計算中">○</span>`;
    return c.ok
      ?`<span style="color:#10b981;font-size:14px" title="${labels[i]}: 適合 ✅">●</span>`
      :`<span style="color:#475569;font-size:14px" title="${labels[i]}: 非適合">○</span>`;
  }).join('<span style="color:#1e2535">|</span>');
}

// ── 詳細パネルへの条件ブロック挿入 ──────────────────────────────
function renderConditionBlock(code,cond){
  const el=document.getElementById("cond-block");
  if(!el)return;

  const isBgOnly=!!(cond&&cond.bgOnly);
  function condItem(label,tip,c,details){
    if(!c){
      const msg=isBgOnly?'詳細を開くと計算（株価履歴が必要）':'計算中…';
      return`<div class="cond-item pending" data-tip="${tip}">
      <span class="cond-icon">🔍</span>
      <div><div class="cond-label">${label}</div>
      <div class="cond-detail">${msg}</div></div></div>`;
    }
    const icon=c.ok?'✅':'❌',cls=c.ok?'ok':'ng';
    return`<div class="cond-item ${cls}" data-tip="${tip}">
      <span class="cond-icon">${icon}</span>
      <div><div class="cond-label">${label}</div>
      <div class="cond-detail">${details}</div></div></div>`;
  }

  const corrDetails=cond.corr
    ?`全期間相関: ${cond.corr.fullCorr}% ／ 1年相関: ${cond.corr.oneYearCorr}% ／ 理論株価: ${cond.corr.theoryGrowth?'↑上昇傾向':'↓下降傾向'}`
    :'データ不足（価格・財務履歴が必要）';
  const discDetails=cond.disc
    ?`全平均α値: ${cond.disc.avgAlpha>=0?'+':''}${cond.disc.avgAlpha}% ／ 最新α値: ${cond.disc.latestAlpha>=0?'+':''}${cond.disc.latestAlpha}%`
    :'履歴データ不足（3期以上必要）';
  const growthDetails=cond.growth
    ?`理論株価 純増: ${cond.growth.netMoves>=0?'+':''}${cond.growth.netMoves}/${cond.growth.total}期 ／ 最高値比: ${cond.growth.peakRatio}%`
    :'履歴データ不足（3期以上必要）';
  const divDetails=cond.div?.noDiv?'無配当銘柄（評価対象外）'
    :cond.div?`配当純増: ${cond.div.netMoves>=0?'+':''}${cond.div.netMoves}/${cond.div.dataPoints-1}期 ／ 配当4%株価 最高値比: ${cond.div.div4PeakRatio}%`
    :'FY配当データ不足（2期以上必要）';

  const corrTip='【正相関度】業績（理論株価）と実際の株価が正に連動しているか確認&#10;条件: 全期間相関≥50% かつ 1年相関≥50% かつ 理論株価が上昇傾向&#10;業績が良くなれば株価も上がる「素直な銘柄」かどうかの指標';
  const discTip='【割安修正】継続的に割安で、直近の割安感が改善傾向にあるか確認&#10;条件: 全平均α値≥0% かつ 最新α値≥0% かつ 最新α値＜全平均α値&#10;「割安が解消されつつある＝株価が理論株価に近づいている」状態が理想';
  const growthTip='【持続成長】理論株価（業績）が時系列で成長傾向にあるか確認&#10;条件: 理論株価の純増加回数≥+2 かつ 最高値比≥85%&#10;過去2年間で業績が着実に成長しているかを判定（10年+8の2年換算）';
  const divTip='【配当成長】配当が増配傾向にあるか確認&#10;条件: 配当純増回数≥+1 かつ 配当4%株価の最高値比≥85%&#10;配当が安定・増加傾向にある株主還元意識の高い企業かを判定';

  el.innerHTML=`
<div class="cond-wrap">
  <div class="cond-header">
    <span data-tip="企業価値コア4条件: 中長期投資に適した銘柄の特性を評価。&#10;詳細を開いた銘柄についてのみ計算されます。&#10;スクリーニング結果のリストでも適合数が表示されます。">企業価値コア4条件</span>
    <span class="cond-score" data-tip="4条件の適合数。多いほど中長期投資に適した特性を持つ銘柄&#10;4/4: 優良候補 / 3/4: 有望 / 2/4: 要確認 / 1/4以下: 慎重に">
      ${scoreDotsHTML(cond)} <strong style="margin-left:6px;font-size:14px">${cond.score}/4</strong>
    </span>
  </div>
  <div class="cond-grid">
    ${condItem('① 正相関度',corrTip,cond.corr,corrDetails)}
    ${condItem('② 割安修正',discTip,cond.disc,discDetails)}
    ${condItem('③ 持続成長',growthTip,cond.growth,growthDetails)}
    ${condItem('④ 配当成長',divTip,cond.div,divDetails)}
  </div>
  <div style="font-size:10px;color:#334155;margin-top:8px;padding-top:6px;border-top:1px solid #1e2535">${isBgOnly?"🔄 BG計算済み（③④）: ①正相関②割安修正は詳細を開くと完全計算されます":"※ 閾値は10年条件を2年データに換算。正相関度のみ株価履歴が必要"}</div>
</div>`;
}

// updateRowBadge は table.js で定義

// ══ BG収集時の軽量条件計算（API追加なし・③④のみ評価） ════════════

// 軽量hist構築（split調整なし・BG専用）
function buildLightHist(stmts){
  const qNM={'1Q':1,'2Q':2,'3Q':3,'FY':4};
  function aEnd(s){
    const fy=new Date((s.CurFYEn||"2000-01-01")+"T00:00:00Z");
    fy.setMonth(fy.getMonth()-(4-(qNM[s.CurPerType]||4))*3);return fy;
  }
  function eff(s){
    const d=(s.DisclosureDate||"").slice(0,10);
    return d>="2000-01-01"?d:aEnd(s).toISOString().slice(0,10);
  }
  const allBps=stmts.filter(s=>parseFloat(s.BPS||0)>0);
  const fyR=allBps.filter(s=>s.CurPerType==="FY").slice(-8);
  const qR =allBps.filter(s=>['1Q','2Q','3Q'].includes(s.CurPerType)).slice(-6);
  const histR=[...fyR,...qR].sort((a,b)=>aEnd(a)-aEnd(b));
  const chartR=[...allBps].sort((a,b)=>aEnd(a)-aEnd(b));
  function build(recs){
    return recs.map(s=>{
      const bps=safe(s.BPS),ta=safe(s.TA),eq=safe(s.EqAR),eqN=eq>1?eq/100:eq;
      const op=safe(s.OdP||s.OP),sh=safe(s.ShOutFY);
      const fOp=safe(s.FOdP||s.FOP||s.NxFOdP||s.NxFOP);
      const div=safe(s.FDivAnn||s.FDivFY||s.DivAnn||s.NxFDivAnn);
      const isFY=s.CurPerType==="FY",qNum=qNM[s.CurPerType]||4;
      const annOp=qNum<4?op*(4/qNum):op,roa=annOp>0&&ta>0?annOp/ta:0;
      const fOpEff=isFY?(fOp>0?fOp:op):(fOp>0?fOp:annOp);
      const fEps=fOpEff>0&&sh>0?fOpEff*.7/sh:0;
      const t=calcTheory(bps,fEps,roa,eqN,1);
      return{theory:Math.round(t.theory),effectivePeriod:eff(s),
             isFY,roa:Math.round(roa*1000)/10,
             div,div4:div>0?Math.round(div/0.04):0};
    }).filter(h=>h.theory>0);
  }
  return{hist:build(histR),chartHist:build(chartR)};
}

// BG用条件計算: API追加なし・③持続成長④配当成長のみ評価
// ①正相関②割安修正は株価履歴が必要 → null（詳細を開くと完全計算）
function computeConditionsBG(code){
  const stmts=finsCache[code];
  if(!stmts||!stmts.length)return;
  // 詳細で完全計算済みなら上書きしない
  if(condCache[code]&&!condCache[code].bgOnly)return;

  const{hist}=buildLightHist(stmts);
  if(hist.length<2)return;
  const sh=[...hist].sort((a,b)=>a.effectivePeriod.localeCompare(b.effectivePeriod));

  const result={corr:null,disc:null,growth:null,div:null,score:0,computed:true,bgOnly:true};

  // ── ③持続成長 ─────────────────────────────────────────────
  const tv=sh.map(h=>h.theory).filter(v=>v>0);
  if(tv.length>=3){
    let net=0;
    for(let i=1;i<tv.length;i++){
      if(tv[i]>tv[i-1])net++;else if(tv[i]<tv[i-1])net--;
    }
    const maxT=Math.max(...tv),latT=tv[tv.length-1];
    const pr=maxT>0?latT/maxT:1;
    result.growth={netMoves:net,peakRatio:Math.round(pr*100),total:tv.length-1,ok:net>=2&&pr>=0.85};
  }

  // ── ④配当成長 ─────────────────────────────────────────────
  const dr=sh.filter(h=>h.isFY&&h.div>0);
  if(dr.length>=2){
    const divs=dr.map(h=>h.div);
    let dn=0;
    for(let i=1;i<divs.length;i++){
      if(divs[i]>divs[i-1])dn++;else if(divs[i]<divs[i-1])dn--;
    }
    const d4v=dr.map(h=>h.div4||Math.round(h.div/0.04));
    const mx=Math.max(...d4v),lt=d4v[d4v.length-1];
    const dp=mx>0?lt/mx:1;
    result.div={netMoves:dn,div4PeakRatio:Math.round(dp*100),dataPoints:dr.length,ok:dn>=1&&dp>=0.85};
  }

  result.score=[result.corr?.ok,result.disc?.ok,result.growth?.ok,result.div?.ok].filter(Boolean).length;
  condCache[code]=result;
  saveCondCache();
  // テーブル行をリアルタイム更新
  if(typeof updateRowBadge==='function')updateRowBadge(code);
}