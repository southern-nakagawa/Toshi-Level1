※このブリーフのファイルパス: Toshi-Level1_dev_brief.md（ブリーフ更新パッチは必ずこのパスに当てること）

# 理論株価スクリーナー（Toshi-Level1）— 開発ブリーフ

> **コードネーム:** Toshi-Level1
> **種別:** 個人用ローカルWebアプリ（日本株スクリーニング）
> **更新:** シャープレシオ・現在株価⭐バー・キャッシュ復元・日付自動更新・atomic write 実装後
> **運用ルール:** 開発終わりに Claude が §6・§7 を含む全体更新案を出す → ユーザーがこのファイルに追記保存

---

## 1. プロジェクト概要

「はっしゃん式」理論株価で日本株をスクリーニングする中期投資支援ツール。J-Quants V2 API（Freeプラン・約90日遅延）から財務データを取得し、割安・割高（α値）を判定する。個人利用・検証フェーズ。

- APIキーはメモリのみ保持（ファイル/localStorage保存なし）
- 財務・株価・銘柄マスターは proxy 側 `cache/*.json` に永続化
- フロントはバニラJS（フレームワークなし）、Chart.js のみ外部依存

---

## 2. スタック / 環境

| 項目 | 内容 |
|---|---|
| フロント | バニラ JS + Chart.js 4.4.0（CDN） |
| プロキシ | Flask CORS プロキシ `proxy.py`（127.0.0.1:8765） |
| データ源 | J-Quants V2 API（Free plan、約90日遅延、5 req/min） |
| 現在値 | Yahoo Finance v8 chart API（`yfinance` ライブラリ経由・認証問題回避済み） |
| 永続化 | localStorage（各種キャッシュ）＋ `cache/` 配下 JSON（proxy側） |
| 開発機 | Mac mini / Safari・Chrome / VSCode / Python 3 |
| Git | GitHub Desktop 運用（リモートpushなし、コマンドは最終手段） |
| 起動 | `理論株価スクリーナー.command`（proxy.py起動＋ブラウザを同時に開く） |

---

## 3. 固有の働き方ルール（このアプリ限定）

※全体の働き方ルールはプロフィール設定済み。ここにはアプリ固有の方針だけ。

- ファイルは常に**フォルダ構造ごと全ファイルまとめて**パッケージ（theory.js/sort.js 等の入れ忘れ防止）
- 出力前に構文チェック：JSは `node --check`、proxyは `python3 -m py_compile`
- proxy.py 変更時は必ず「ファイル差し替えが必要」と明示する
- `cache/*.json` と `.DS_Store` は `.gitignore`（Git追跡させない。`git rm -r --cached` 済み）
- **emptyFinsCodes 系の「失敗時に銘柄を恒久除外」最適化は入れない**（ゼロ件表示の原因になった）
- **updateRowBadge は table.js のみに定義**（conditions.js 重複で2行表示バグ）
- 安定性最優先。問題発生時は GitHub Desktop の「Discard All Changes」で v2 ベースへリバート

---

## 4. ファイル構成マップ

```
（プロジェクトルート）
  index.html                  HTML構造 + 追加<style>ブロック + script src一覧
  style.css                   全スタイル（ダークテーマ・ユーザー管理／別途保有）
  proxy.py                    Flask CORSプロキシ（ルート直下・js/の中ではない）
  理論株価スクリーナー.command    Mac起動ランチャー（要 chmod +x／実行ビット）
  cache/
    fins_cache.json           .gitignore対象
    master_cache.json         .gitignore対象
    price_cache.json          .gitignore対象
  js/                         （読み込み順＝依存順）
    theory.js       理論株価・α値・フォーマッタ（純粋関数・DOM非依存）
    state.js        全グローバル変数・各種キャッシュ(cond/fins/sharpe)・freshCodes・renderGen
    api.js          日付ユーティリティ・株価取得・detectLatestPriceDate（日付自動更新）
    chart.js        株式分割調整・Chart.js描画・buildChart
    table.js        テーブル描画・コア条件バッジ・シャープ列・brightenRow
    watchlist.js    名前付きウォッチリスト（複数グループ・オートコンプリート・IMEガード）
    sort.js         マルチキーソート
    background.js   BG財務収集・順次輝度上昇（bgFetchNext）
    connect.js      接続・キャッシュ復元(loadCachedFins)・キャッシュクリアボタン
    screening.js    スクリーニング実行・WL表示・Phase0/1/2・renderGenガード
    detail.js       詳細パネル・calcSharpe・現在株価⭐バー(fetchRTBar)
    conditions.js   コア4条件計算・BG軽量計算・詳細描画
    app.js          ツールチップ・ペインリサイザー（最後に読み込み）
```

**ディレクトリ確認用 find コマンド（備忘録）:**
```
find . -type d \( -name cache -o -name .git -o -name __pycache__ \) -prune -o -print | sort
```

---

## 5. 主要機能サマリ

### 5.1 はっしゃん式 理論株価（theory.js）
- 理論株価 = (資産価値 + 事業価値) × (1 − リスク率)
  - 資産価値 = BPS × eqRate ／ 事業価値 = 15 × 予想EPS × min(ROA,0.3) × 10 × lev
- α値(%) = (理論株価 − 株価) / 株価 × 100
- 予想EPS = fOp × 0.7 / 発行株数（**FY実績優先**ロジック：基準レコード=BPS>0の最新。FYかつOdP>0ならfOp=OdP、四半期は遡ってFOdP検索、無ければ年率換算実績）
- ROA 四半期年率換算：1Q×4 / 2Q×2 / 3Q×4/3 / FY×1
- 基準レコード選択はスクリーニング・詳細上段・条件計算で統一

### 5.2 スクリーニング（screening.js）
- フィルタ：市場・業種・α値上下限・自己資本比率・ROA・配当利回り・コア条件適合数・バリュートラップ除外
- **Phase0**：既存キャッシュで即時表示（真っ白回避・暗く表示）
- **Phase1**：finsCache済みを即表示 → **Phase2**：不足分を14秒間隔で取得し20件ごと更新
- AbortController で中断可。**renderGen（描画世代トークン）**でビュー切替時の競合を無効化
- 中断時は既存結果を残す（lastResults があればテーブル維持）

### 5.3 企業価値コア4条件（conditions.js）
- ①正相関度 ②割安修正（要・個別株価履歴／詳細表示時）／ ③持続成長 ④配当成長（fins のみ／BG計算可）
- 2段階計算：BG時は③④のみ(bgOnly:true)、詳細表示で①②③④完全計算し上書き
- リスト最右にドット4つ表示。condScore ソートは condCache 動的参照

### 5.4 営業利益率（OPM）
- 営業利益率 = 営業利益 ÷ 売上高 × 100（現在は `OdP` ベース）
- 一覧テーブル最右列（ソート可能）＋詳細パネル財務履歴テーブルに表示
- screening.js の `calcScreenResults` で算出（`opm` フィールド）
- 色分け：10%以上 green / 5%未満 red / それ以外 標準
- 売上高ゼロの銘柄（金融業等）は「—」表示

### 5.5 シャープレシオ
- **2年・年率換算(×√252)・無リスク金利1.0%**
- state.js に sharpeCache（localStorage永続化・condCacheパターン踏襲）
- detail.js に calcSharpe＋詳細カード（renderSharpeBlock）、table.js に列（buildSharpeCell/updateRowSharpe）
- screening.js に sharpe フィールド（ソート用）、index.html にソート可能な「シャープ」列ヘッダ

### 5.6 現在株価⭐バー（detail.js / proxy.py）
- 詳細パネルの「株価水準イメージ」バーに現在株価を⭐でプロット
- Yahoo Finance v8 chart API 経由（認証不要）。現在値が無い場合（相場前・休場）は**前回終値**を使用（「前終」タグ表示）
- 表示：現在株価・**90日前比**（データ基準日の株価からの騰落率・上昇で+%）・α値
- **チャート完全非干渉**：fetchRTBar を setTimeout でイベントループ後に実行。過去に fetch が try-catch 内でチャートを壊した経緯あり
- ⭐は `overflow:visible`＋`z-index`＋`text-shadow` で上下切れ回避

### 5.7 ウォッチリスト（watchlist.js）
- **名前付き複数グループ**（タブ切替・新規/名前変更/削除・ドラッグ並び替え）
- コード/社名オートコンプリート（**IMEガード** `isComposing`/`keyCode===229` で変換確定Enter誤登録を防止）
- 詳細からの登録は openWatchPicker でリスト選択ポップアップ（複数リストへ同時登録可）
- 一括株価に無い銘柄は個別株価を補完取得、計算不可でも incompleteRow で全件表示

### 5.8 キャッシュ・鮮度・日付
- 接続時 `loadCachedFins()` が `/proxy/fins_all` から全財務を復元（**fins_all は app.run() の前に定義。後ろだとデッドコードで404**）
- **freshCodes**（セッション限定Set）：復元キャッシュ=薄い、BG取得/詳細閲覧=標準。BGが暗い銘柄を1.2秒毎に順次明るく（brightenRow）
- **日付自動更新**：detectLatestPriceDate が1日1回トヨタ(72030)プローブで最新営業日を再検出（screener_detect_day で判定）
- ヘッダーに「🗑 キャッシュ」クリアボタン（ウォッチリストは消えない）

### 5.9 proxy.py 安定性
- スロットリング **threading.Lock** でスレッドセーフ化（同時実行の429防止）。RATE_INTERVAL=14秒
- **atomic write**：save_json は `.tmp` に書込→`os.fsync`→`os.replace`
- **SIGINTハンドラ**で Ctrl+C 連打を無視し保存を完了してから終了（`_saving` フラグ）

### 5.10 proxy.py エンドポイント
`/proxy/connect` `/disconnect` `/status` `/master` `/prices(date=一括/code=個別)` `/fins(code=)` `/fins_all(全キャッシュ一括・app.run前)` `/realtime(Yahoo Finance現在値・v8 chart)` `/cache_info` `/cache_clear`

---

## 6. 現在地・次の一手

- **今どこ：** 安定稼働中。営業利益率（OPM）カラム追加完了（4ファイル: screening.js / table.js / detail.js / index.html）。一覧テーブル（ソート可能）＋詳細パネル財務履歴テーブルの両方に表示。計算元は現時点では `OdP`（経常利益）ベース。J-Quants の `OperatingProfit` フィールドが別に存在する場合、名称と計算元の乖離を要確認。
- **次やる：** 特に確定タスクなし。候補は §17相当の未実装項目（チャート期間切替・CSVエクスポート・移動平均線・IRカレンダー 等）。

---

## 7. 既知の問題 / 保留

- **`.command` ランチャーの軽微な挙動（保留）：** proxy 起動済みの場合、`PROXY_PID` 未設定のまま `wait` に到達しウィンドウが即閉じる。ブラウザは開くので実害なし。気になれば要修正。
- **proxy.py はAPIキーをメモリのみ保持** → 再起動のたびに再入力が必要（仕様・既存挙動）。
- **チャート系変更は要注意** → 現在株価取得(fetchRTBar)は setTimeout で完全分離済み。チャートに触る変更時は破損の再発に注意。
- **updateRowBadge の重複定義禁止**（table.js のみ）。
- **emptyFinsCodes 系の恒久除外最適化は導入しない**（過去にゼロ件表示を招いた）。

---

## 付録：詳細仕様（旧要件定義の保持事項）

### A. α値の水準ラベル
超割安(>100)/割安(50〜100)/準割安(10〜50)/適正(−10〜10)/準割高(−30〜−10)/割高(−50〜−30)/超割高(<−50)

### B. 株規模・投資難易度（detail.js）
- 時価総額 = price × shares。大型(≥1兆)/中型(≥300億)/小型(≥50億)/超小型(<50億)
- classifySize / liquidityRisk / pbrZone / roaStability
- バリュートラップ警告：PBR<0.3 かつ α>100% で赤バナー

### C. 外部リンク（5桁→4桁 `code.slice(0,4)`）
IR Bank / 株探 / Yahoo!ファイナンス / みんかぶ / 適時開示(TDnet)

### D. チャート（chart.js）
- 直近504営業日（約2年）・分割調整済み終値
- 分割調整優先：AdjustmentClose → AdjustmentFactor×Close → 終値急変からの自動検出
- 理論株価ライン：確定期間は黄系実線、財務データ不足期間はグレー破線
- 配当利回りライン：右軸0〜8%・赤破線

### E. 財務履歴テーブル
- FY直近8期・四半期直近6期、各行その期のデータのみで独立計算
- EPS注記：（なし）当期予想 / 実=FY実績 / 予=四半期年間予想 / 推=年率換算推計

### F. キャッシュ保存タイミング（proxy.py）
- 財務：20件ごと・切断時・終了時（atomic write）
- マスター・株価bulk：取得時即保存
- 起動時：旧形式(dict単体)→新形式(list)へ自動変換

### G. 主要CSS変数
`--accent #3b82f6`（株価）/ `--gold #eab308`（理論株価）/ `--amber #f59e0b`（上限株価）/ `--green #10b981` / `--red #ef4444` / `--muted #94a3b8`。背景 `#0d1120`、テキスト `#e2e8f0`

### H. 詳細メトリクスのレイアウト
CSS Grid で「数値=左・説明(ラベル/補足)=右2行」（index.html の `<style>` で `.metric-grid .mc` を grid-template-areas 上書き。文字サイズは標準）
