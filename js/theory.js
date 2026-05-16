// ══ はっしゃん式理論株価 ══════════════════════════════════════════
function eqRate(eq){return eq>=.8?.8:eq>=.67?.75:eq>=.5?.7:eq>=.33?.65:eq>=.1?.6:.5}
function lev(eq){return 1/Math.min(1,Math.max(.66,eq+.33))}
function riskRate(pbr){
  if(pbr>=.5)return 0;if(pbr>=.41)return .2;if(pbr>=.34)return .33;
  if(pbr>=.25)return .5;if(pbr>=.21)return .66;
  if(pbr>=.04)return .75+((.20-pbr)/.16*.20);return .975}
function calcTheory(bps,fEps,roa,eq,pbr){
  const av=bps*eqRate(eq);
  const bv=fEps>0&&roa>0?15*fEps*Math.min(roa,.3)*10*lev(eq):0;
  const t=Math.max(0,(av+bv)*(1-riskRate(pbr)));
  return{theory:Math.round(t),upper:Math.round(av+bv*2),asset:Math.round(av),business:Math.round(bv)}}
function calcAlpha(t,p){return p>0?Math.round((t-p)/p*1000)/10:null}
function levelOf(a){
  if(a===null)return"不明";if(a>100)return"超割安";if(a>50)return"割安";
  if(a>10)return"準割安";if(a>-10)return"適正";if(a>-30)return"準割高";
  if(a>-50)return"割高";return"超割高"}
const LCOLOR={超割安:"#10b981",割安:"#34d399",準割安:"#6ee7b7",適正:"#94a3b8",
  準割高:"#fbbf24",割高:"#f97316",超割高:"#ef4444",不明:"#6b7280"};
function safe(v,d=0){const n=parseFloat(v);return isNaN(n)?d:n}

// ══ 数値フォーマット統一 ══════════════════════════════════════════
const fmtPrice = v => Math.round(v).toLocaleString();
const fmtAlpha = v => (v>=0?"+":"")+Number(v).toFixed(1);
const fmtPct1  = v => Number(v).toFixed(1);
const fmtEps   = v => Number(v).toFixed(1);
const fmtPbr   = v => Number(v).toFixed(2);
