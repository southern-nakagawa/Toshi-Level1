// ══ 詳細パネル ══════════════════════════════════════════════════
async function loadDetail(code,screened){
  activeCode=code;
  document.getElementById("d-empty").classList.add("hidden");
  const dc=document.getElementById("d-content");
  dc.classList.remove("hidden");
  dc.innerHTML='<div class="loading-wrap" style="padding:40px"><div class="spinner"></div><div class="loading-text">取得中…</div></div>';
  if(chart){chart.destroy();chart=null;}
  try{
    const myCode=code;
    const info=(masterCache||[]).find(s=>s.Code===code)||{};

    // finsCache優先（スクリーニングと同一データ）
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

    // 最新レコード（四半期含む・BPS有）で統一
    const validStmtsD=stmts.filter(s=>parseFloat(s.BPS||0)>0);
    const ls=validStmtsD.length?validStmtsD[validStmtsD.length-1]:(stmts.length?stmts[stmts.length-1]:{});

    // fOp: FY実績なら当期OdP優先、四半期なら最新FOdPを遡って取得
    let fOp=0;
    {
      const _qD={'1Q':1,'2Q':2,'3Q':3,'FY':4}[ls.CurPerType]||4;
      const _opTmp=safe(ls.OdP||ls.OP);
      if(_qD===4&&_opTmp>0){
        fOp=_opTmp;
      }else{
        for(let i=stmts.length-1;i>=0;i--){
          const v=safe(stmts[i].FOdP||stmts[i].FOP);
          if(v>0){fOp=v;break;}
        }
      }
    }
    // 配当: 最新から遡って取得
    let div=0;
    for(let i=stmts.length-1;i>=0;i--){
      const v=safe(stmts[i].FDivAnn||stmts[i].FDivFY||stmts[i].DivAnn||stmts[i].NxFDivAnn);
      if(v>0){div=v;break;}
    }

    const bps   =safe(ls.BPS);
    const ta    =safe(ls.TA);
    const eq    =safe(ls.EqAR);
    const op    =safe(ls.OdP||ls.OP);
    const shares=safe(ls.ShOutFY);
    // 四半期は年率換算
    const qNumD={'1Q':1,'2Q':2,'3Q':3,'FY':4}[ls.CurPerType]||4;
    const annOpD=qNumD<4?op*(4/qNumD):op;
    const fEpsRaw=fOp>0&&shares>0?fOp*.7/shares:(annOpD>0&&shares>0?annOpD*.7/shares:0);
    const roaRaw =annOpD>0&&ta>0?annOpD/ta:0;

    const latestQ =quotes.length?quotes[quotes.length-1]:{};
    const latestPrice=safe(latestQ.C||latestQ.Close);
    const price=screened?screened.price:(latestPrice||0);

    const pbr =bps>0&&price>0?price/bps:1;
    const t   =calcTheory(bps,fEpsRaw,roaRaw,eq,pbr);
    const opForUpper=fOp>0?fOp:annOpD;
    const fEpsForUpper=opForUpper>0&&shares>0?opForUpper*.7/shares:0;
    const tDisplay={...t,upper:calcTheory(bps,fEpsForUpper,roaRaw,eq,pbr).upper};
    const a   =calcAlpha(t.theory,price);
    const lv  =levelOf(a);
    const div4=div>0?Math.round(div*25):0;

    // 株価チャート（直近504日≒2年・株式分割調整済み）
    const priceHist=getSplitAdjustedHistory(quotes).slice(-504);

    // 株式分割イベント検出
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
        if(prevF>1.05&&curF<1.05&&prevF/curF>1.5){
          const f=Math.round(prevF);
          if(f>=2)splitEvents.push({date:cur.date,factor:f});
        }
      }
    }
    function getCumSplitFactor(pDate){
      let cum=1;
      splitEvents.forEach(ev=>{if(ev.date>pDate)cum*=ev.factor;});
      return cum;
    }

    // 財務履歴構築
    const qNumMap={'1Q':1,'2Q':2,'3Q':3,'FY':4};
    function approxPeriodEnd(s){
      const fy=new Date((s.CurFYEn||"2000-01-01")+"T00:00:00Z");
      const q=qNumMap[s.CurPerType]||4;
      fy.setMonth(fy.getMonth()-(4-q)*3);
      return fy;
    }
    function effectiveDate(s){
      const disc=(s.DisclosureDate||"").slice(0,10);
      if(disc>="2000-01-01")return disc;
      return approxPeriodEnd(s).toISOString().slice(0,10);
    }

    const allBps=stmts.filter(s=>parseFloat(s.BPS||0)>0);
    const fyRecs=allBps.filter(s=>s.CurPerType==="FY").slice(-8);
    const qRecs =allBps.filter(s=>['1Q','2Q','3Q'].includes(s.CurPerType)).slice(-6);
    const histRecs=[...fyRecs,...qRecs].sort((a,b)=>approxPeriodEnd(a)-approxPeriodEnd(b));
    const chartHistRecs=[...allBps].sort((a,b)=>approxPeriodEnd(a)-approxPeriodEnd(b));

    function buildHistArray(recs){
      const out=[];
      recs.forEach(s=>{
        const _bps=safe(s.BPS),_ta=safe(s.TA),_eq=safe(s.EqAR);
        const _eqN=_eq>1?_eq/100:_eq;
        const _op=safe(s.OdP||s.OP),_ns=safe(s.Sales),_sh=safe(s.ShOutFY);
        const _fOp=safe(s.FOdP||s.FOP||s.NxFOdP||s.NxFOP);
        const isFY=s.CurPerType==="FY";
        const qNum=qNumMap[s.CurPerType]||4;
        const _annualOp=qNum<4?_op*(4/qNum):_op;
        const _roa=_annualOp>0&&_ta>0?_annualOp/_ta:0;
        const _fOpEff=isFY?(_fOp>0?_fOp:_op):(_fOp>0?_fOp:_annualOp);
        const _isFcast=_fOp>0;
        const _fEps =_fOpEff>0&&_sh>0?_fOpEff*.7/_sh:0;
        const _opU  =Math.max(_fOp,isFY?_op:_annualOp);
        const _fEpsU=_opU>0&&_sh>0?_opU*.7/_sh:0;
        const _t=calcTheory(_bps,_fEps,_roa,_eqN,1);
        const _tU=calcTheory(_bps,_fEpsU,_roa,_eqN,1);
        const pEnd=approxPeriodEnd(s);
        const pEndStr=pEnd.toISOString().slice(0,10);
        const periodLabel=isFY
          ?(s.CurFYEn||"").slice(0,7)
          :pEnd.toISOString().slice(0,7)+" ("+s.CurPerType+")";
        const sf=getCumSplitFactor(pEndStr);
        const splitNote=sf>1?`÷${sf}`:"";
        const fEpsNote=(isFY?(_isFcast?"":"実"):(_isFcast?"予":"推"))+splitNote;
        out.push({
          period:periodLabel,
          effectivePeriod:effectiveDate(s),
          isFY,perType:s.CurPerType||"FY",
          theory:Math.round(_t.theory/sf),
          upper:Math.round(_tU.upper/sf),
          bps:   Math.round(_bps/sf),
          fEps:  Math.round(_fEps/sf*10)/10,
          fEpsNote,
          roa:   Math.round(_roa*1000)/10,
          eq:    Math.round(_eqN*1000)/10,
          sales: Math.round(_ns/1e8*10)/10,
          opProfit:Math.round(_op/1e8*10)/10
        });
      });
      return out;
    }
    const hist=buildHistArray(histRecs);
    const chartHist=buildHistArray(chartHistRecs);

    renderDetail({
      info,code,price,latestPrice,screeningDate,t:tDisplay,a,lv,
      lcolor:LCOLOR[lv]||"#6b7280",
      bps,fEps:Math.round(fEpsRaw*10)/10,
      roa:Math.round(roaRaw*1000)/10,
      eq:Math.round(eq*1000)/10,
      pbr:Math.round(pbr*100)/100,
      div,div4,
      divYield:div>0&&price>0?Math.round(div/price*10000)/100:0,
      hist,chartHist,priceHist
    });
  }catch(e){
    document.getElementById("d-content").innerHTML=
      `<div class="empty-detail">エラー: ${e.message}</div>`;
  }
}

function renderDetail(d){
  const dc=document.getElementById("d-content");
  const ac=d.a>=0?"var(--green)":"var(--red)";
  const maxB=Math.max(d.price,d.t.theory,d.t.upper,1);
  const pct=v=>Math.round(v/maxB*100);
  const watched=isWatched(d.code);

  dc.innerHTML=`
    <div class="detail-header">
      <div>
        <div class="d-code">${d.code}</div>
        <div class="d-name">${d.info.CoName||""}</div>
        <div class="d-sub">${d.info.MktNm||""} ／ ${d.info.S33Nm||""}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <button class="close-btn" id="close-detail">✕</button>
        <button class="watch-btn${watched?" watched":""}" id="watch-btn">
          ${watched?"★ 登録解除":"☆ ウォッチ登録"}</button>
      </div>
    </div>
    <div class="metric-grid">
      <div class="mc hl">
        <div class="ml">株価（基準日: ${d.screeningDate||"―"}）</div>
        <div class="mv">¥${fmtPrice(d.price)}</div>
        <div class="ms">PBR: ${fmtPbr(d.pbr)}倍${d.latestPrice&&d.latestPrice!==d.price?
          ` ／ 参考最新: <span style="color:var(--amber)">¥${fmtPrice(d.latestPrice)}</span>`:""}</div>
      </div>
      <div class="mc hl">
        <div class="ml">α値（割安度）</div>
        <div class="mv" style="color:${ac}">${fmtAlpha(d.a??0)}%</div>
        <div class="ms"><span class="lbadge" style="background:${d.lcolor}">${d.lv}</span></div>
      </div>
      <div class="mc">
        <div class="ml">理論株価</div>
        <div class="mv" style="color:var(--gold)">¥${fmtPrice(d.t.theory)}</div>
        <div class="ms">資産:¥${fmtPrice(d.t.asset)} ＋ 事業:¥${fmtPrice(d.t.business)}</div>
      </div>
      <div class="mc">
        <div class="ml">上限株価</div>
        <div class="mv" style="color:var(--amber)">¥${fmtPrice(d.t.upper)}</div>
        <div class="ms">割高ライン目安</div>
      </div>
      <div class="mc">
        <div class="ml">ROA</div>
        <div class="mv ${d.roa>=5?"pos":d.roa<2?"neg":""}">${fmtPct1(d.roa)}%</div>
        <div class="ms">事業効率性</div>
      </div>
      <div class="mc">
        <div class="ml">自己資本比率</div>
        <div class="mv ${d.eq>=50?"pos":d.eq<30?"neg":""}">${fmtPct1(d.eq)}%</div>
        <div class="ms">財務健全性</div>
      </div>
      <div class="mc">
        <div class="ml">BPS（1株純資産）</div>
        <div class="mv">${fmtPrice(d.bps)}</div>
        <div class="ms">解散価値の基準</div>
      </div>
      <div class="mc">
        <div class="ml">予想EPS（はっしゃん式）</div>
        <div class="mv">${fmtEps(d.fEps)}</div>
        <div class="ms">予想経常利益×0.7÷株式数</div>
      </div>
      ${d.div>0?`
      <div class="mc">
        <div class="ml">配当（年間）</div>
        <div class="mv" style="color:var(--accent)">¥${d.div}</div>
        <div class="ms">利回り: ${fmtPct1(d.divYield)}%</div>
      </div>
      <div class="mc">
        <div class="ml">配当4%ライン</div>
        <div class="mv">¥${fmtPrice(d.div4)}</div>
        <div class="ms">長期保有の目安</div>
      </div>`:""}
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
        <th data-tip="予想EPS&#10;予=当期年間予想&#10;実=実績OdP&#10;推=FOdP無・年率換算推計">予想EPS</th>
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
