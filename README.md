# 余白ラボ 編集室

日本語・スマホ向けの記事管理PWA。記事単位の最終版承認、コメント、修正履歴、JSTランダム予約、停止、監査ログ、Macの排他処理を備えます。noteへの本番投稿は実装していません。

```sh
npm ci
SEED=1 npm start
```

`http://127.0.0.1:4173` を開きます。`scripts/start.command` からも起動できます。Macローカル版はサンプル原稿3本入り。データは `.state/`、公開静的画面は `public/`。クラウド版はGitHub Pages + Cloudflare Workers/D1/Access。管理画面に秘密鍵・Githubトークン・原稿データを埋め込みません。

- [接続・運用・復旧の手順](docs/SETUP.md)
- [公式仕様と未検証項目](docs/SOURCES.md)
- [原稿のJSON形式](docs/article.example.json)

検証：`npm test`、`npm run test:ui`。入力テスト：環境設定後に `node --env-file=.env scripts/agent.mjs`。実noteではなく外部通信を遮断した専用画面でテストします。`prepared`を公開成功と混同しないでください。

公開済みURLは本人が手動投稿を確認してから記録できます。修正時は承認・予約が消えます。古い版や未承認記事は予約できません。中断した処理を自動で再実行しません。

公開リポジトリに `.state/`, `.env`, `.auth/`, `artifacts/`, 原稿やバックアップを追加しないでください。GitHub App経由の原稿取り込みは別の非公開リポジトリを使います。
