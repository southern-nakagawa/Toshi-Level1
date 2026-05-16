// ══ 株式分割調整済み株価履歴 ══════════════════════════════════════
function getSplitAdjustedHistory(quotes){
  if(!quotes.length)return[];

  // ① AdjustmentClose が有効な場合
  const sampleAC=parseFloat(quotes[quotes.length-1].AdjustmentClose);
  if(sampleAC>0){
    const r=quotes.map(q=>({
      date:(q.Date||"").slice(0,10),
      close:parseFloat(q.AdjustmentClose)||0
    })).filter(p=>p.close>0);
    if(r.length)return r;
  }

  // ② AdjustmentFactor が機能している場合
  const hasRealFactor=quotes.some(q=>{
    const f=parseFloat(q.AdjustmentFactor);
    return f>0&&Math.abs(f-1)>0.001;
  });
  if(hasRealFactor){
    return quotes.map(q=>({
      date:(q.Date||"").slice(0,10),
      close:Math.round(parseFloat(q.Close||q.C||0)*(parseFloat(q.AdjustmentFactor)||1)*10)/10
    })).filter(p=>p.close>0);
  }

  // ③ フォールバック: 終値の大幅変動から株式分割を自動検出
  const closes=quotes.map(q=>parseFloat(q.Close||q.C||0));
  const n=closes.length;
  const adjusted=new Array(n);
  adjusted[n-1]=closes[n-1];
  let cumDiv=1;
  for(let i=n-1;i>0;i--){
    const prev=closes[i-1],cur=closes[i];
    if(cur>0&&prev>0){
      const ratio=prev/cur;
      if(ratio>=1.8){
        const candidates=[2,3,4,5,10];
        const best=candidates.reduce((a,b)=>Math.abs(ratio-a)<Math.abs(ratio-b)?a:b);
        cumDiv*=best;
      }else if(ratio<=0.45&&ratio>0){
        const best=[2,3,4].reduce((a,b)=>Math.abs(1/ratio-a)<Math.abs(1/ratio-b)?a:b);
        cumDiv/=best;
      }
    }
    adjusted[i-1]=Math.round(closes[i-1]/cumDiv*10)/10;
  }
  return quotes.map((q,i)=>({
    date:(q.Date||"").slice(0,10),close:adjusted[i]
  })).filter(p=>p.close>0);
}

// ══ チャート描画 ══════════════════════════════════════════════════
function buildChart(d,mode){
  if(chart){chart.destroy();chart=null;}
  if(!d||!d.priceHist||!d.priceHist.length)return;
  const canvas=document.getElementById("price-chart");
  if(!canvas)return;
  const ctx=canvas.getContext("2d");
  const labels=d.priceHist.map(p=>p.date);
  const closes=d.priceHist.map(p=>p.close);
  const n=labels.length;

  // 理論・上限ラインをIIFEで全変数確定
  var _lines=(function(){
    const shSrc=d.chartHist&&d.chartHist.length?d.chartHist:d.hist;
    if(shSrc&&shSrc.length){
      const sh=[...shSrc].sort(function(a,b){
        var da=a.effectivePeriod||a.period;
        var db=b.effectivePeriod||b.period;
        return da.localeCompare(db);
      });
      const firstEff=sh[0].effectivePeriod||sh[0].period;
      return {
        preTheory:labels.map(function(dd){
          return dd<firstEff?sh[0].theory:null;
        }),
        preUpper:labels.map(function(dd){
          if(dd>=firstEff)return null;
          return sh[0].upper>sh[0].theory?sh[0].upper:d.t.upper;
        }),
        theoryLine:labels.map(function(dd){
          if(dd<firstEff)return null;
          var th=sh[0].theory;
          for(var hi=0;hi<sh.length;hi++){
            var effDate=sh[hi].effectivePeriod||sh[hi].period;
            if(effDate<=dd)th=sh[hi].theory;else break;
          }
          return th;
        }),
        upperLine:labels.map(function(dd){
          if(dd<firstEff)return null;
          var up=sh[0].upper>sh[0].theory?sh[0].upper:d.t.upper;
          for(var hi=0;hi<sh.length;hi++){
            var effDate=sh[hi].effectivePeriod||sh[hi].period;
            if(effDate<=dd)up=sh[hi].upper||up;else break;
          }
          return up;
        })
      };
    }else{
      return {
        preTheory:[],preUpper:[],
        theoryLine:Array(n).fill(d.t.theory),
        upperLine:Array(n).fill(d.t.upper)
      };
    }
  })();
  var preTheory =_lines.preTheory;
  var preUpper  =_lines.preUpper;
  var theoryLine=_lines.theoryLine;
  var upperLine =_lines.upperLine;

  var yMin,yMax;
  if(mode==="price"){
    const pMin=Math.min(...closes),pMax=Math.max(...closes);
    yMin=Math.round(pMin*0.9);
    yMax=Math.round(pMax*1.1);
    preTheory =preTheory.map(function(v){return(v!=null&&v>=yMin&&v<=yMax)?v:null;});
    preUpper  =preUpper.map(function(v){return(v!=null&&v>=yMin&&v<=yMax)?v:null;});
    theoryLine=theoryLine.map(function(v){return(v!=null&&v>=yMin&&v<=yMax)?v:null;});
    upperLine =upperLine.map(function(v){return(v!=null&&v>=yMin&&v<=yMax)?v:null;});
  }

  const allVals=[...closes,...theoryLine,...upperLine,...preTheory,...preUpper]
    .filter(v=>v!=null&&v>0);
  if(!allVals.length)return;
  if(mode!=="price"){
    yMin=Math.round(Math.min(...allVals)*0.85);
    yMax=Math.round(Math.max(...allVals)*1.1);
  }

  const xConfig={
    ticks:{color:"#64748b",font:{size:10},
      callback:function(val,idx){
        const lbl=labels[idx];if(!lbl)return"";
        const m=lbl.slice(0,7);
        return m.slice(5)==="01"?lbl.slice(0,4)+"年":m.slice(5)+"月";
      },maxTicksLimit:14},
    grid:{color:"#1e2535"}
  };

  const datasets=[
    {label:"株価",data:closes,
      borderColor:"#3b82f6",backgroundColor:"rgba(59,130,246,.07)",
      borderWidth:2,pointRadius:0,fill:true,tension:.3,yAxisID:"y"},
    // 最古財務データ以前のグレー参考ライン
    {label:"理論株価(参考)",data:preTheory||[],
      borderColor:"#64748b",backgroundColor:"transparent",
      borderWidth:1,borderDash:[4,4],pointRadius:0,fill:false,tension:0,
      spanGaps:false,yAxisID:"y"},
    {label:"上限株価(参考)",data:preUpper||[],
      borderColor:"#94a3b8",backgroundColor:"transparent",
      borderWidth:1,borderDash:[4,4],pointRadius:0,fill:false,tension:0,
      spanGaps:false,yAxisID:"y"},
    {label:"理論株価",data:theoryLine,
      borderColor:"#eab308",backgroundColor:"transparent",
      borderWidth:1.5,borderDash:[6,3],pointRadius:0,fill:false,tension:.3,
      spanGaps:false,yAxisID:"y"},
    {label:"上限株価",data:upperLine,
      borderColor:"#f59e0b",backgroundColor:"transparent",
      borderWidth:1.5,borderDash:[3,3],pointRadius:0,fill:false,tension:.3,
      spanGaps:false,yAxisID:"y"},
  ];

  const scales={
    x:xConfig,
    y:{position:"left",min:yMin,max:yMax,
      ticks:{color:"#64748b",font:{size:10},callback:v=>"\u00a5"+v.toLocaleString()},
      grid:{color:"#1e2535"}}
  };

  if(d.div>0){
    const yieldLine=closes.map(c=>c>0?Math.round(d.div/c*10000)/100:null);
    datasets.push({label:"配当利回り",data:yieldLine,
      borderColor:"#ef4444",backgroundColor:"transparent",
      borderWidth:1,borderDash:[5,3],pointRadius:0,fill:false,tension:.2,yAxisID:"y1"});
    scales.y1={position:"right",min:0,max:8,
      ticks:{color:"#ef4444",font:{size:10},callback:v=>v.toFixed(1)+"%"},
      grid:{drawOnChartArea:false}};
  }

  chart=new Chart(ctx,{type:"line",
    data:{labels,datasets},
    options:{responsive:true,animation:false,
      interaction:{mode:"index",intersect:false},
      plugins:{
        legend:{display:true,labels:{color:"#94a3b8",font:{size:10},boxWidth:20,padding:10}},
        tooltip:{callbacks:{
          label:c=>{
            if(c.dataset.yAxisID==="y1")
              return ` ${c.dataset.label}: ${c.raw!=null?c.raw.toFixed(2):"—"}%`;
            return ` ${c.dataset.label}: \u00a5${c.raw!=null?c.raw.toLocaleString():"—"}`;
          }
        }}
      },
      scales
    }});
}
