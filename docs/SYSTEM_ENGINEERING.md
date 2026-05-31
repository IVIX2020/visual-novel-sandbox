# The House: System Engineering Manual (開発者向け)

このドキュメントでは、サンドボックスのエンジン部分（JavaScript/Vite）の構造と拡張方法について説明します。

---

## 1. 技術スタック
- **Runtime**: Browser (Vanilla JS / ES Modules)
- **Bundler**: Vite
- **Parser**: `marked` (Markdown), `js-yaml` (Frontmatter)
- **Persistence**: LocalStorage

---

## 2. ディレクトリ構造
- `/src/js/`:
  - `main.js`: エントリーポイント。オーディオのアンロック、グローバル関数の公開、Engine の初期化を担当。
  - `engine.js`: シーンのレンダリング、UI制御、状態変化のトリガーを担当。
  - `data-loader.js`: Markdown ファイルの解析、正規表現による記法抽出、マスターデータのロードを担当。
  - `state.js`: ゲーム状態（Flags, Memories, Objects）の保持と、セーブ/ロード、条件評価を担当。
  - `audio-manager.js`: Audio オブジェクトの管理、BGM のループ、SE の再生を担当。
- `/public/assets/`: 静的アセット（画像、音声）の配信。

---

## 3. 状態管理 (State)
`state.js` はシングルトンとして動作します。
- `flags`: 汎用的な boolean フラグ。
- `unlockedMemories / foundObjects`: `Set` オブジェクトで管理。
- `check(condition)`: `!flag`（否定）を含む条件式を評価し、真偽値を返します。このメソッドは画像表示、選択肢表示、テキスト分岐のすべてで共通して使用されます。

---

## 4. パーサー仕様 (Data Loader)
`data-loader.js` は Markdown を以下の順序で処理します：
1. **Frontmatter**: シーンの基本属性を取得。
2. **Block Splitting**: `###` を区切りとして「メイン描写」と「選択肢ブロック」に分割。
3. **Regex Extraction**: 
   - `![[...] ]`: 画像を抽出してテキストから除去。
   - `[[...|...]]`: 移動リンクを抽出。
   - `(type:id|label)`: インタラクションを抽出。
   - `@ cond`: ブランチを生成。
4. **Highlight Processing**: `==cond|text==` を `<span>` タグに置換し、CSS クラス `.blurred` または `.unlocked` を付与。

---

## 5. オーディオ・アンロック戦略
ブラウザの自動再生ポリシーを回避するため、`main.js` で `window` レベルのクリックイベントを監視しています。初回の操作で `AudioManager.unlock()` を呼び出し、Base64 形式の極小 WAV データを再生することで `AudioContext` を有効化します。

---

## 6. 拡張のアイデア
- **演出**: `engine.js` の `showText` にタイピングエフェクトを追加。
- **ロジック**: `state.js` に「アイテム所持」や「数値変数（好感度など）」の概念を追加。
- **UI**: サイドバーに現在のチャプターを表示する機能。