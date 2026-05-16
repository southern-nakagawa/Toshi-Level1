// ══ マルチキーソート ══════════════════════════════════════════════
const STR_SORT=new Set(["code","name","sector","market"]);

function onHeaderClick(key){
  const idx=sortKeys.findIndex(s=>s.key===key);
  if(idx>=0){
    const dir=sortKeys[idx].dir==="desc"?"asc":"desc";
    sortKeys.splice(idx,1);sortKeys.unshift({key,dir});
  }else{
    sortKeys.unshift({key,dir:"desc"});
    if(sortKeys.length>3)sortKeys=sortKeys.slice(0,3);
  }
  localStorage.setItem("screener_sort_keys",JSON.stringify(sortKeys));
  updateSortHeaders();
  if(lastResults.length)renderTable(applySort(lastResults).slice(0,300));
}

function applySort(rows){
  return[...rows].sort((a,b)=>{
    for(const{key,dir}of sortKeys){
      const va=a[key]??(STR_SORT.has(key)?"":0);
      const vb=b[key]??(STR_SORT.has(key)?"":0);
      if(va===vb)continue;
      if(STR_SORT.has(key)){
        const c=String(va).localeCompare(String(vb),"ja");
        return dir==="desc"?-c:c;
      }
      return dir==="desc"?vb-va:va-vb;
    }
    return 0;
  });
}

function updateSortHeaders(){
  document.querySelectorAll("thead th.sortable").forEach(th=>{
    const key=th.dataset.key;
    const idx=sortKeys.findIndex(s=>s.key===key);
    const ind=th.querySelector(".sort-ind");
    if(idx>=0){
      th.classList.add("sort-active");
      const arrow=sortKeys[idx].dir==="desc"?"↓":"↑";
      const pri=sortKeys.length>1?`<sup class="sort-pri">${idx+1}</sup>`:"";
      ind.innerHTML=arrow+pri;
    }else{
      th.classList.remove("sort-active");
      ind.innerHTML="";
    }
  });
}

document.querySelectorAll("thead th.sortable").forEach(th=>{
  th.addEventListener("click",()=>onHeaderClick(th.dataset.key));
});
updateSortHeaders();
