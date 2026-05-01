#!/usr/bin/env python3
"""
J-Quants CORS プロキシ
ローカルで起動してブラウザからのAPIリクエストを中継します。
APIキーはメモリのみ保持・ファイル保存なし。
"""
import os, json, requests
from flask import Flask, request, jsonify, Response

app = Flask(__name__)
BASE = "https://api.jquants.com"
mem = {"id_token": None, "refresh_token": None}

def cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return resp

@app.after_request
def add_cors(resp):
    return cors(resp)

@app.route("/proxy/connect", methods=["POST", "OPTIONS"])
def connect():
    if request.method == "OPTIONS": return cors(Response())
    token = (request.json or {}).get("token", "").strip()
    r = requests.get(f"{BASE}/v1/token/auth_refresh", params={"refreshtoken": token}, timeout=10)
    if not r.ok:
        return jsonify({"error": f"認証失敗 (HTTP {r.status_code})"}), 400
    mem["id_token"] = r.json().get("idToken")
    mem["refresh_token"] = token
    return jsonify({"ok": True})

@app.route("/proxy/disconnect", methods=["POST", "OPTIONS"])
def disconnect():
    if request.method == "OPTIONS": return cors(Response())
    mem["id_token"] = None
    mem["refresh_token"] = None
    return jsonify({"ok": True})

@app.route("/proxy/status")
def status():
    return jsonify({"connected": bool(mem["id_token"])})

def _refresh():
    r = requests.get(f"{BASE}/v1/token/auth_refresh",
                     params={"refreshtoken": mem["refresh_token"]}, timeout=10)
    if r.ok:
        mem["id_token"] = r.json().get("idToken")

def jget(path, params=None):
    hdrs = {"Authorization": f"Bearer {mem['id_token']}"}
    r = requests.get(f"{BASE}{path}", headers=hdrs, params=params or {}, timeout=60)
    if r.status_code == 401:
        _refresh()
        hdrs["Authorization"] = f"Bearer {mem['id_token']}"
        r = requests.get(f"{BASE}{path}", headers=hdrs, params=params or {}, timeout=60)
    r.raise_for_status()
    return r.json()

@app.route("/proxy/api")
def proxy_api():
    if not mem["id_token"]:
        return jsonify({"error": "未接続"}), 401
    path   = request.args.get("path", "")
    params = {k: v for k, v in request.args.items() if k != "path"}
    try:
        return jsonify(jget(path, params))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    print("\n" + "="*48)
    print("  J-Quants CORS プロキシ 起動中")
    print("="*48)
    print("  http://localhost:8765 で待機")
    print("  APIキーはメモリのみ（ファイル保存なし）")
    print("  停止: Ctrl+C")
    print("="*48 + "\n")
    app.run(host="127.0.0.1", port=8765, debug=False)
