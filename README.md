# 選択テキスト即時コピー整形

選択したテキストの余計な改行・空白を整えてクリップボードへコピーする
Chrome拡張機能（Manifest V3）。

[ai-council v2](https://github.com/momokuomomo-crypto/ai-council_v2)の
会合で検討・承認された
[稟議書](https://github.com/momokuomomo-crypto/ai-council-output/blob/master/chrome-extension-ideas/稟議書_Chrome拡張機能アイデア.md)
をもとに、
[ai-build-council](https://github.com/momokuomomo-crypto/ai-build-council)
のワークフローで設計・実装した。

## 主な機能

- 選択テキストの改行・空白・全角スペース等をプレーンテキストとして正規化
  （Markdown記法は付加しない）してクリップボードへコピーする
- CRLF/CR正規化、連続改行は段落区切りとして保持、段落内の単一改行は
  スペースへ結合（CJK隣接・可視ハイフンの場合はスペース無しで連結）
  という12段階の整形規則を適用
- 姉妹拡張「選択範囲をMarkdown引用」と同じアーキテクチャ
  （contextMenus + scripting + activeTab）を採用し、`clipboardWrite`
  権限は要求しない

## セットアップ

```bash
npm install
npm run build
```

`chrome://extensions` でデベロッパーモードを有効にし、
「パッケージ化されていない拡張機能を読み込む」で`dist/`を選択する。

## 開発

```bash
npm run dev         # 開発用ビルド（watch）
npm run typecheck
npm run lint
npm run test         # 単体・統合テスト（Vitest, sinon-chrome）
npm run build        # 本番ビルド
```

## ディレクトリ構成

```
src/
  background.ts        # Service Worker（contextMenus登録・注入呼び出し）
  inject/
    copy-in-page.ts     # ページコンテキストへ都度注入するコピー関数
  shared/
    format.ts           # 12段階の整形ロジック
tests/
  unit/                  # 純粋関数の単体テスト（Vitest）
  integration/            # background.tsの統合テスト（sinon-chrome）
```

## 収益化方法

無料版で提供。Pro版でカスタム正規表現を提供する。

## 将来の拡張案

- 表→CSV変換

出典：[稟議書_Chrome拡張機能アイデア.md（項目5）](https://github.com/momokuomomo-crypto/ai-council-output/blob/master/chrome-extension-ideas/稟議書_Chrome拡張機能アイデア.md)

## 開発の経緯

[ai-build-council](https://github.com/momokuomomo-crypto/ai-build-council)
のゲート付きワークフロー（独立設計→設計査読→実装→テスト→固定diffの
独立実装レビュー→修正→記録）で設計・実装した。

実装レビューでは、CJK（日本語等）境界の判定がUTF-16コード単位
（`slice(-1)`等）で行われており、サロゲートペアで表現される稀な漢字を
分断してしまう不具合を、2つの独立レビュワー（Codex CLI・Claude Agent）が
それぞれ独立に発見した。`Array.from`によるコードポイント単位の抽出へ
変更して修正した。詩・コード等、改行に意味がある文章は変換され得るが、
「拡張のメニューを使わない通常コピー」をオプトアウト手段として設計上
受け入れている。
