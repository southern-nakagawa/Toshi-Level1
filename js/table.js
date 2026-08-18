// ══ テーブル描画 ══════════════════════════════════════════════════

// コア条件セル生成（スコア左・ドット右・1行表示）
function buildCondCell(code){
  const cond=condCache&&condCache[code];
  if(!cond){
    return '<td class="td-cond" data-tip="詳細を開くと計算されます&#10;①正相関 ②割安修正 ③持続成長 ④配当成長">'
      +'<span style="font-size:10px;color:#334155;margin-right:4px;font-weight:700">—/4</span>'
      +'<span style="color:#334155;font-size:13px;letter-spacing:1px">○○○○</span></td>';
  }
  const items=[
    {c:cond.corr,   label:'①正相関度'},
    {c:cond.disc,   label:'②割安修正'},
    {c:cond.growth, label:'③持続成長'},
    {c:cond.div,    label:'④配当成長'}
  ];
  const dots=items.map(function(item){
    const c=item.c, label=item.label;
    if(!c) return '<span style="color:#334155;font-size:13px" title="'+label+': 詳細を開くと計算">○</span>';
    return c.ok
      ? '<span style="color:#10b981;font-size:13px" title="'+label+': 適合 ✅">●</span>'
      : '<span style="color:#475569;font-size:13px" title="'+label+': 非適合">○</span>';
  }).join('');
  const sc=cond.score;
  const scoreColor=sc>=3?'#10b981':sc>=2?'#eab308':'#94a3b8';
  const bgNote=cond.bgOnly?' data-tip="コア4条件 '+sc+'/4 (BG計算済み)&#10;①②は詳細を開くと完全計算&#10;③持続成長 ④配当成長は計算完了"':' data-tip="コア4条件 '+sc+'/4&#10;①正相関 ②割安修正 ③持続成長 ④配当成長&#10;●=適合 ○=非適合"';
  return '<td class="td-cond"'+bgNote+'>'
    +'<span style="font-size:11px;font-weight:700;color:'+scoreColor+';margin-right:4px">'+sc+'/4</span>'
    +dots+'</td>';
}

// シャープレシオセル生成（詳細を開くと計算・td-condの右隣に表示）
function buildSharpeCell(code){
  const sh=sharpeCache&&sharpeCache[code];
  if(sh===undefined){
    return '<td class="num muted td-sharpe" data-tip="シャープレシオ（2年・年率換算）&#10;詳細を開くと計算されます">—</td>';
  }
  if(sh===null){
    return '<td class="num muted td-sharpe" data-tip="株価データ不足で算出不可">—</td>';
  }
  const cls=sh.sharpe>=1?"pos":sh.sharpe<0?"neg":"";
  return '<td class="num '+cls+' td-sharpe" data-tip="シャープレシオ（2年・年率）&#10;年率リターン '+sh.annReturn+'% ／ 年率σ '+sh.annStd+'%">'+sh.sharpe.toFixed(2)+'</td>';
}

function renderTable(rows){
  const tbody=document.getElementById("results-tbody");
  tbody.innerHTML="";
  rows.forEach(function(r){
    const tr=document.createElement("tr");
    tr.dataset.code=r.code;
    if(r.code===activeCode)tr.classList.add("active");
    if(r.incomplete){
      // データ不足銘柄: コード・銘柄名・業種のみ表示
      tr.style.opacity="0.55";
      tr.innerHTML=
        '<td>'+r.code+'</td>'+
        '<td title="'+r.name+'">'+r.name+'</td>'+
        '<td class="num" colspan="13" style="color:var(--muted);text-align:left;padding-left:12px">'+
          '⚠ データ取得不可（株価・財務データなし。上場廃止・取引停止等の可能性）</td>'+
        '<td style="color:var(--muted);font-size:11px">'+(r.sector||"").replace("\u696d","")+'</td>'+
        '<td class="td-cond"></td>'+
        '<td class="td-sharpe"></td>'+
        '<td class="num">—</td>';
      tr.addEventListener("click",function(){
        document.querySelectorAll("#results-tbody tr").forEach(function(t){t.classList.remove("active");});
        tr.classList.add("active");
        loadDetail(r.code,r);
      });
      tbody.appendChild(tr);
      return;
    }
    if(!r.incomplete&&!freshCodes.has(r.code))tr.style.opacity="0.55";
    tr.innerHTML=
      '<td>'+r.code+'</td>'+
      '<td title="'+r.name+'">'+r.name+'</td>'+
      '<td class="num">'+fmtPrice(r.price)+'</td>'+
      '<td class="num" style="color:var(--gold)">'+fmtPrice(r.theory)+'</td>'+
      '<td class="num '+(r.alpha>=0?"pos":"neg")+'">'+fmtAlpha(r.alpha)+'%</td>'+
      '<td><span class="lbadge" style="background:'+r.lcolor+'">'+r.level+'</span></td>'+
      '<td class="num muted">'+fmtPrice(r.upper)+'</td>'+
      '<td class="num">'+fmtPrice(r.asset)+'</td>'+
      '<td class="num">'+fmtPrice(r.business)+'</td>'+
      '<td class="num">'+fmtPrice(r.bps)+'</td>'+
      '<td class="num">'+fmtEps(r.fEps)+'</td>'+
      '<td class="num '+(r.roa>=5?"pos":r.roa<2?"neg":"")+'">'+fmtPct1(r.roa)+'%</td>'+
      '<td class="num '+(r.eq>=50?"pos":r.eq<30?"neg":"")+'">'+fmtPct1(r.eq)+'%</td>'+
      '<td class="num">'+fmtPbr(r.pbr)+'</td>'+
      '<td class="num '+(r.divYield>=3?"pos":"")+'">'+
        (r.divYield>0?fmtPct1(r.divYield)+"%":"—")+'</td>'+
      '<td style="color:var(--muted);font-size:11px">'+
        (r.sector||"").replace("\u696d","")+'</td>'+
      buildCondCell(r.code)+
      buildSharpeCell(r.code)+
      '<td class="num'+(r.opm!==null?(r.opm>=10?' pos':r.opm<5?' neg':''):'')+'">'+(r.opm!==null?fmtPct1(r.opm)+'%':'—')+'</td>';
    tr.addEventListener("click",function(){
      document.querySelectorAll("#results-tbody tr").forEach(function(t){t.classList.remove("active");});
      tr.classList.add("active");
      loadDetail(r.code,r);
    });
    tbody.appendChild(tr);
  });
}

// テーブル行のコア条件セルを差し替え（detail計算/BG計算後に呼ばれる）
function updateRowBadge(code){
  // 個別行のバッジ更新
  const tr=document.querySelector("#results-tbody tr[data-code=\""+code+"\"]");
  if(tr){
    const td=tr.querySelector(".td-cond");
    if(td){
      const tmp=document.createElement("tbody");
      tmp.innerHTML=buildCondCell(code);
      const newTd=tmp.querySelector("td");
      if(newTd)td.replaceWith(newTd);
    }
  }
  // condScoreがアクティブソートキーなら全体を再ソート・再描画
  if(typeof sortKeys!=="undefined"&&sortKeys.length&&
     sortKeys[0].key==="condScore"&&
     typeof lastResults!=="undefined"&&lastResults.length){
    renderTable(applySort(lastResults).slice(0,300));
  }
}

// テーブル行のシャープレシオセルを差し替え（detail計算後に呼ばれる）
function updateRowSharpe(code){
  const tr=document.querySelector("#results-tbody tr[data-code=\""+code+"\"]");
  if(!tr)return;
  const td=tr.querySelector(".td-sharpe");
  if(!td)return;
  const tmp=document.createElement("tbody");
  tmp.innerHTML=buildSharpeCell(code);
  const newTd=tmp.querySelector("td");
  if(newTd)td.replaceWith(newTd);
  if(typeof sortKeys!=="undefined"&&sortKeys.length&&
     sortKeys[0].key==="sharpe"&&
     typeof lastResults!=="undefined"&&lastResults.length){
    const row=lastResults.find(r=>r.code===code);
    if(row)row.sharpe=sharpeCache[code]?sharpeCache[code].sharpe:null;
    renderTable(applySort(lastResults).slice(0,300));
  }
}

function closeDetail(){
  document.getElementById("d-empty").classList.remove("hidden");
  document.getElementById("d-content").classList.add("hidden");
  document.querySelectorAll("#results-tbody tr").forEach(function(t){t.classList.remove("active");});
  activeCode=null;
  if(chart){chart.destroy();chart=null;}
}

// 指定銘柄の行を標準の明るさに戻す（freshCodes追加後に呼ぶ）
function brightenRow(code){
  const tr=document.querySelector('#results-tbody tr[data-code="'+code+'"]');
  if(tr&&!tr.querySelector('[colspan]'))tr.style.opacity="";
}
