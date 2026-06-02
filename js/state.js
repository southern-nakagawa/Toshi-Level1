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
let watchlist = JSON.parse(localStorage.getItem("screener_watchlist") || "[]");

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