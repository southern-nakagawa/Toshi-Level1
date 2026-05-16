// ══ テーブル描画 ══════════════════════════════════════════════════
function renderTable(rows){
  const tbody=document.getElementById("results-tbody");
  tbody.innerHTML="";
  rows.forEach(r=>{
    const tr=document.createElement("tr");
    if(r.code===activeCode)tr.classList.add("active");
    tr.innerHTML=`
      <td>${r.code}</td>
      <td title="${r.name}">${r.name}</td>
      <td class="num">${fmtPrice(r.price)}</td>
      <td class="num" style="color:var(--gold)">${fmtPrice(r.theory)}</td>
      <td class="num ${r.alpha>=0?"pos":"neg"}">${fmtAlpha(r.alpha)}%</td>
      <td><span class="lbadge" style="background:${r.lcolor}">${r.level}</span></td>
      <td class="num muted">${fmtPrice(r.upper)}</td>
      <td class="num">${fmtPrice(r.asset)}</td>
      <td class="num">${fmtPrice(r.business)}</td>
      <td class="num">${fmtPrice(r.bps)}</td>
      <td class="num">${fmtEps(r.fEps)}</td>
      <td class="num ${r.roa>=5?"pos":r.roa<2?"neg":""}">${fmtPct1(r.roa)}%</td>
      <td class="num ${r.eq>=50?"pos":r.eq<30?"neg":""}">${fmtPct1(r.eq)}%</td>
      <td class="num">${fmtPbr(r.pbr)}</td>
      <td class="num ${r.divYield>=3?"pos":""}">${r.divYield>0?fmtPct1(r.divYield)+"%":"—"}</td>
      <td style="color:var(--muted);font-size:11px">${(r.sector||"").replace("業","")}</td>`;
    tr.addEventListener("click",()=>{
      document.querySelectorAll("#results-tbody tr").forEach(t=>t.classList.remove("active"));
      tr.classList.add("active");
      loadDetail(r.code,r);
    });
    tbody.appendChild(tr);
  });
}

function closeDetail(){
  document.getElementById("d-empty").classList.remove("hidden");
  document.getElementById("d-content").classList.add("hidden");
  document.querySelectorAll("#results-tbody tr").forEach(t=>t.classList.remove("active"));
  activeCode=null;
  if(chart){chart.destroy();chart=null;}
}
