#!/usr/bin/env python3
"""
J-Quants V2 API CORS プロキシ
- APIキーはメモリのみ（ファイル保存なし）
- 財務データ・銘柄一覧はキャッシュファイルに自動保存
- Free プラン: 5リクエスト/分 → 自動スロットリング
"""
import os, json, time, atexit, threading, signal
import requests
from flask import Flask, request, jsonify, Response

app = Flask(__name__)
BASE = "https://api.jquants.com"
mem  = {"api_key": None, "last_req": 0}

RATE_INTERVAL = 14.0

CACHE_DIR         = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
FINS_CACHE_FILE   = os.path.join(CACHE_DIR, "fins_cache.json")
MASTER_CACHE_FILE = os.path.join(CACHE_DIR, "master_cache.json")
PRICE_CACHE_FILE  = os.path.join(CACHE_DIR, "price_cache.json")

os.makedirs(CACHE_DIR, exist_ok=True)

def load_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f: return json.load(f)
    except: return None

def save_json(path, data):
    # アトミック書き込み: 一時ファイルに書いてから置換。
    # 書込中にCtrl+C等で中断されても本体ファイルは壊れない。
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())   # 確実にディスクへ書き込む
        os.replace(tmp, path)      # アトミックな置換（OSが保証）
    except Exception as e:
        print(f"[SAVE] 保存エラー {path}: {e}")
        try:
            if os.path.exists(tmp): os.remove(tmp)
        except: pass

_raw_fins    = load_json(FINS_CACHE_FILE) or {}
# 旧形式（dict単体）→ 新形式（list）に自動変換
fins_cache = {}
for k, v in _raw_fins.items():
    fins_cache[k] = v if isinstance(v, list) else ([v] if isinstance(v, dict) else [])
valid_on_load = sum(1 for v in fins_cache.values() if v)
print(f"[CACHE] キャッシュ変換: {valid_on_load}銘柄")
master_cache = load_json(MASTER_CACHE_FILE)
price_cache  = load_json(PRICE_CACHE_FILE) or {}

def cors(resp):
    resp.headers["Access-Control-Allow-Origin"]  = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return resp

@app.after_request
def add_cors(r): return cors(r)

_throttle_lock = threading.Lock()

def throttle():
    # スレッドセーフ: スクリーニングと詳細取得の同時実行による429を防止
    with _throttle_lock:
        wait = RATE_INTERVAL - (time.time() - mem["last_req"])
        if wait > 0:
            print(f"[RATE] {wait:.1f}秒待機...")
            time.sleep(wait)
        mem["last_req"] = time.time()

def jget(path, params=None):
    throttle()
    r = requests.get(f"{BASE}{path}",
                     headers={"x-api-key": mem["api_key"]},
                     params=params or {}, timeout=30)
    print(f"[API] GET {path} → {r.status_code}")
    r.raise_for_status()
    return r.json()

# ── 接続 ──
@app.route("/proxy/connect", methods=["POST", "OPTIONS"])
def connect():
    if request.method == "OPTIONS": return cors(Response())
    key = (request.json or {}).get("apiKey", "").strip()
    if not key:
        return jsonify({"error": "APIキーを入力してください"}), 400
    # 接続テスト: 約90日前の平日（Freeプランのデータ遅延内に収まる日付）
    from datetime import datetime, timedelta
    test_date = datetime.now() - timedelta(days=90)
    while test_date.weekday() >= 5:
        test_date -= timedelta(days=1)
    test_date_str = test_date.strftime("%Y%m%d")
    try:
        r = requests.get(f"{BASE}/v2/equities/bars/daily",
                         headers={"x-api-key": key},
                         params={"code": "86970", "date": test_date_str},
                         timeout=10)
        print(f"[CONNECT] /v2/equities/bars/daily?date={test_date_str} → {r.status_code}")
        if not r.ok:
            return jsonify({"error": f"APIキー認証失敗 ({r.status_code}): {r.text[:200]}"}), 400
    except Exception as e:
        return jsonify({"error": f"接続エラー: {str(e)}"}), 500

    mem["api_key"]  = key
    mem["last_req"] = 0
    valid = sum(1 for v in fins_cache.values() if v)
    return jsonify({"ok": True, "cached_fins": valid})

@app.route("/proxy/disconnect", methods=["POST", "OPTIONS"])
def disconnect():
    if request.method == "OPTIONS": return cors(Response())
    mem["api_key"] = None
    if fins_cache:
        save_json(FINS_CACHE_FILE, fins_cache)
        valid = sum(1 for v in fins_cache.values() if v)
        print(f"[CACHE] 切断時保存: 有効{valid} / 総{len(fins_cache)}銘柄")
    return jsonify({"ok": True})

@app.route("/proxy/status")
def status():
    valid = sum(1 for v in fins_cache.values() if v)
    return jsonify({"connected": bool(mem["api_key"]), "cached_fins": valid})

@app.route("/proxy/cache_info")
def cache_info():
    valid = sum(1 for v in fins_cache.values() if v)
    return jsonify({"fins_valid": valid, "fins_total": len(fins_cache),
                    "master": len(master_cache) if master_cache else 0,
                    "prices": len(price_cache), "cache_dir": CACHE_DIR})

@app.route("/proxy/cache_clear", methods=["POST", "OPTIONS"])
def cache_clear():
    if request.method == "OPTIONS": return cors(Response())
    global fins_cache, master_cache, price_cache
    fins_cache = {}; master_cache = None; price_cache = {}
    for f in [FINS_CACHE_FILE, MASTER_CACHE_FILE, PRICE_CACHE_FILE]:
        try: os.remove(f)
        except: pass
    return jsonify({"ok": True})

# ── 銘柄一覧（V2: /v2/listed/info, レスポンスキー: info）──
@app.route("/proxy/master")
def master():
    global master_cache
    if not mem["api_key"]: return jsonify({"error": "未接続"}), 401
    try:
        if master_cache:
            print(f"[CACHE] 銘柄一覧: キャッシュ返却 ({len(master_cache)}件)")
            return jsonify({"data": master_cache, "from_cache": True})
        # 公式仕様: GET /v2/equities/master, レスポンスキーは "data"
        r = requests.get(f"{BASE}/v2/equities/master",
                         headers={"x-api-key": mem["api_key"]}, timeout=30)
        mem["last_req"] = time.time()
        print(f"[MASTER] /v2/equities/master → {r.status_code}")
        if not r.ok:
            return jsonify({"error": f"銘柄一覧取得失敗 ({r.status_code}): {r.text[:300]}"}), 500
        d = r.json()
        print(f"[MASTER] レスポンスキー: {list(d.keys())}")
        # キーを探す（data, info, items など）
        data = []
        for key in ["data", "info", "items", "equities", "master"]:
            if key in d and d[key]:
                data = d[key]
                print(f"[MASTER] {len(data)}件取得 (key={key})")
                break
        if not data:
            return jsonify({"error": f"銘柄データなし。レスポンス: {str(d)[:300]}"}), 500
        master_cache = data
        save_json(MASTER_CACHE_FILE, master_cache)
        print(f"[MASTER] {len(master_cache)}件取得・保存")
        return jsonify({"data": master_cache})
    except Exception as e:
        print(f"[MASTER] エラー: {e}")
        return jsonify({"error": str(e)}), 500

# ── 株価（V2: /v2/equities/bars/daily, レスポンスキー: data）──
@app.route("/proxy/prices")
def prices():
    if not mem["api_key"]: return jsonify({"error": "未接続"}), 401
    try:
        date = request.args.get("date", "")
        code = request.args.get("code", "")
        if date and not code:
            if date in price_cache:
                print(f"[CACHE] 株価 {date}: キャッシュ返却")
                return jsonify({"data": price_cache[date], "from_cache": True})
            d = jget("/v2/equities/bars/daily", {"date": date})
            price_cache[date] = d.get("data", [])
            save_json(PRICE_CACHE_FILE, price_cache)
            print(f"[PRICE] {date}: {len(price_cache[date])}件保存")
            return jsonify({"data": price_cache[date]})
        params = {}
        if date: params["date"] = date
        if code: params["code"] = code
        d = jget("/v2/equities/bars/daily", params)
        return jsonify({"data": d.get("data", [])})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── 財務サマリー（V2: /v2/fins/summary, レスポンスキー: data）──
@app.route("/proxy/fins")
def fins():
    if not mem["api_key"]: return jsonify({"error": "未接続"}), 401
    try:
        code  = request.args.get("code", "")
        force = request.args.get("force", "") in ("1", "true", "yes")
        if code and code in fins_cache and not force:
            return jsonify({"data": fins_cache[code], "from_cache": True})
        if force and code:
            print(f"[FINS] 強制再取得: {code}")
        d    = jget("/v2/fins/summary", {"code": code} if code else {})
        data = d.get("data", [])
        if code:
            fins_cache[code] = data
            valid = sum(1 for v in fins_cache.values() if v)
            if force:
                save_json(FINS_CACHE_FILE, fins_cache)
                print(f"[CACHE] 強制再取得を即保存: {code} / 有効{valid}銘柄")
            elif valid % 20 == 0 and valid > 0:
                save_json(FINS_CACHE_FILE, fins_cache)
                print(f"[CACHE] 財務保存: 有効{valid} / 総{len(fins_cache)}銘柄")
        return jsonify({"data": data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

_saving = False  # 保存中フラグ（Ctrl+C連打対策）

def save_all():
    if fins_cache:
        save_json(FINS_CACHE_FILE, fins_cache)
        valid = sum(1 for v in fins_cache.values() if v)
        print(f"[CACHE] 保存完了: 有効{valid} / 総{len(fins_cache)}銘柄 → {FINS_CACHE_FILE}")

@atexit.register
def on_exit():
    save_all()

def _graceful_exit(signum, frame):
    # 1回目のCtrl+Cで保存開始。保存中の2回目以降のCtrl+Cは無視する。
    global _saving
    if _saving:
        print("\n[EXIT] 保存中です。Ctrl+Cを押さずにお待ちください…")
        return
    _saving = True
    print("\n[EXIT] キャッシュを保存しています… (Ctrl+Cを押さないでください)")
    try:
        save_all()
    except Exception as e:
        print(f"[EXIT] 保存エラー: {e}")
    print("[EXIT] 保存完了。終了します。")
    os._exit(0)

signal.signal(signal.SIGINT, _graceful_exit)
signal.signal(signal.SIGTERM, _graceful_exit)

# ── 全キャッシュ済み財務データを一括返却（フロントのfinsCache復元用） ──
@app.route("/proxy/fins_all")
def fins_all():
    valid = {k: v for k, v in fins_cache.items() if v}
    print(f"[FINS_ALL] {len(valid)}件を返却")
    return jsonify({"data": valid, "count": len(valid)})

# ── Yahoo Finance 現在株価（横バーの⭐プロット用・スロットリング対象外） ──
# v8 chart APIを使用（認証不要）。現在値が無い場合（相場開始前など）は前回終値を使用。
@app.route("/proxy/realtime")
def realtime():
    codes_param = request.args.get("codes", "")
    if not codes_param:
        return jsonify({"error": "codesを指定してください"}), 400
    code_list = [c.strip() for c in codes_param.split(",") if c.strip()][:20]
    results = {}
    for code5 in code_list:
        ticker = code5[:4] + ".T"
        try:
            r = requests.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}",
                params={"range": "5d", "interval": "1d"},
                headers={
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    "Accept": "application/json",
                },
                timeout=10
            )
            res = (r.json().get("chart") or {}).get("result") or []
            if not res:
                continue
            meta = res[0].get("meta") or {}
            prev = meta.get("previousClose") or meta.get("chartPreviousClose")
            price = meta.get("regularMarketPrice")
            # 相場開始前・休場時は現在値が無いので前回終値を使用
            if price is None:
                price = prev
            if price is None:
                continue
            change = round((price - prev) / prev * 100, 2) if prev else 0
            results[code5] = {
                "price":     price,
                "prevClose": prev,
                "change":    change,
                "time":      meta.get("regularMarketTime"),
                "isPrev":    meta.get("regularMarketPrice") is None,  # 前回終値を使ったか
            }
        except Exception as e:
            print(f"[REALTIME] {code5} エラー: {e}")
    print(f"[REALTIME] {len(results)}/{len(code_list)}件")
    return jsonify({"data": results})

# ── ブラウザから安全に停止（キャッシュ保存してから終了） ──────────────
@app.route("/proxy/shutdown", methods=["POST", "OPTIONS"])
def shutdown():
    if request.method == "OPTIONS":
        return ("", 204)
    print("\n[SHUTDOWN] ブラウザから停止要求を受信。キャッシュ保存中…")
    try:
        save_all()
    except Exception as e:
        print(f"[SHUTDOWN] 保存エラー: {e}")
    # レスポンスを返してから終了するため、別スレッドで少し遅延して終了
    def _die():
        time.sleep(0.5)
        print("[SHUTDOWN] 終了します。")
        os._exit(0)
    threading.Thread(target=_die, daemon=True).start()
    return jsonify({"ok": True, "message": "キャッシュを保存して終了します"})

if __name__ == "__main__":
    valid = sum(1 for v in fins_cache.values() if v)
    print("\n" + "="*52)
    print("  J-Quants V2 CORS プロキシ 起動中")
    print("="*52)
    print(f"  http://localhost:8765 で待機")
    print(f"  APIキー: メモリのみ（ファイル保存なし）")
    print(f"  財務キャッシュ: 有効{valid} / 総{len(fins_cache)}銘柄")
    print(f"  保存先: {CACHE_DIR}")
    print(f"  停止: Ctrl+C")
    print("="*52 + "\n")
    app.run(host="127.0.0.1", port=8765, debug=False)

@app.route("/proxy/master/sample")
def master_sample():
    """マスターデータの最初の1件を返す（フィールド確認用）"""
    global master_cache
    if master_cache and len(master_cache) > 0:
        return jsonify({"sample": master_cache[0], "total": len(master_cache)})
    return jsonify({"error": "キャッシュなし"})