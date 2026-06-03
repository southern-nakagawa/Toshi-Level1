// ══ グローバル設定 ══════════════════════════════════════════════════
const PROXY = "http://localhost:8765";

// ══ キャッシュ ══════════════════════════════════════════════════════
let masterCache = null;
let priceCache  = {};
let finsCache   = {};

// ══ スクリーニング状態 ══════════════════════════════════════════════
let screenAbortCtrl  = null;   // スクリーニング中断用
let lastResults      = [];
let screeningDate    = null;
let screeningPrices  = {};
let lastProbeDate    = null;   // 個別履歴から確認した真の最新日

// ══ 詳細パネル状態 ═══════════════════════════════════════════════════
let activeCode       = null;
let chart            = null;
let currentDetailData= null;   // チャートスケール切替用
let chartScaleMode   = 'all';  // 'all' | 'price'

// ══ ソート状態 ══════════════════════════════════════════════════════
let sortKeys = JSON.parse(
  localStorage.getItem("screener_sort_keys") || '[{"key":"alpha","dir":"desc"}]'
);

// ══ ウォッチリスト ══════════════════════════════════════════════════
// 名前付きウォッチリスト（複数グループ対応）
let watchlistGroups=(function(){
  try{
    const g=JSON.parse(localStorage.getItem("screener_wl_groups")||"null");
    if(g&&typeof g==="object"&&Object.keys(g).length)return g;
    // 旧形式（単一リスト）から移行
    const old=JSON.parse(localStorage.getItem("screener_watchlist")||"[]");
    return {"マイリスト":Array.isArray(old)?old:[]};
  }catch(e){return {"マイリスト":[]};}
})();
let activeWatchlistName=localStorage.getItem("screener_wl_active")||Object.keys(watchlistGroups)[0]||"マイリスト";
if(!watchlistGroups[activeWatchlistName]){
  activeWatchlistName=Object.keys(watchlistGroups)[0]||"マイリスト";
  if(!watchlistGroups[activeWatchlistName])watchlistGroups[activeWatchlistName]=[];
}
// watchlist は常にアクティブなグループを指す
let watchlist=watchlistGroups[activeWatchlistName];

// ══ バックグラウンド収集 ═════════════════════════════════════════════
let bgEnabled     = localStorage.getItem("screener_bg_enabled") === "true";
let bgRunning     = false;
let bgTimer       = null;
let bgIndex       = 0;
let bgInitialized = false;
const BG_INTERVAL_MS = 13000;

// ══ コア4条件キャッシュ ══════════════════════════════════════════
// condCache: localStorage永続化（ページリロード後も保持）
let condCache=(function(){
  try{return JSON.parse(localStorage.getItem("screener_cond_cache")||"{}");}
  catch(e){return {};}
})();
let realtimeCache={};  // Yahoo Finance現在株価（セッション中のみ）

// 旧バージョンの誤判定データを掃除（取得失敗銘柄が誤って蓄積されていたため）
try{localStorage.removeItem("screener_empty_fins");}catch(e){}

let detailPriceCache={};  // {code:quotes} 個別株価キャッシュ（再クリック高速化）
let freshCodes=new Set(); // 当セッションで取得/閲覧した銘柄（明るく表示）
let detailLoading=false;  // 詳細読込中フラグ（BG競合回避）