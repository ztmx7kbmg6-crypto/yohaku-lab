# 接続を仕上げる手順

2026-11-17確認。クラウドはCloudflare Workers + D1 + Access、画面はGitHub Pages。Supabaseの登録は不要です。

## 最初に一度だけ：Cloudflareのメール認証

Cloudflareの既存OAuth接続にはWorkers/D1の作成権限がありますが、Accessの管理権限はありません。Zero Trustも未有効でした。したがって、この初期設定だけはアカウント所有者による操作が必要です。

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) を開く。Freeプランの組織を作成し、チーム名を決める。請求情報を求められる場合は内容を確認する。有料プランは選ばない。
2. Access → Applications → Add an application → Self-hosted。名前「余白ラボ 編集室」。公開ホスト名 `yohaku-lab-api.ztmx7kbmg6.workers.dev`、パス `/api/login` **のみ**を対象にする。API全体を保護するとMacからの接続が妨げられる。ポリシーはAllow、Include Emailsに管理者のメール**1件だけ**。Everyone/Bypassは選ばない。One-time PINを有効にする。セッションは1時間推奨。
3. アプリのAudience (AUD)と、`チーム名.cloudflareaccess.com`を控える。これらは公開識別子であり、パスワードではない。
4. このアプリの作業フォルダで、次をそれぞれ設定する。

```sh
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler secret put ACCESS_AUD
```

管理者メールは `OWNER_EMAIL` に保存する。今回指定されたメールはサーバーのSecretだけに設定し、ソースには記載しない。別のメールに変更するときは `npx wrangler secret put OWNER_EMAIL`。上記識別子をこのチャットに知らせれば、残りの設定を続けられる。

GitHub Pagesを開き、メール認証でログインする。Accessが返す署名済みJWTの署名・発行元・AUD・有効期限・メールをWorkerが毎回検証する。GitHub Pagesへの復帰時はフラグメントから取得して直ちにURLから削除し、メモリだけに保持する。リロード・期限切れ時はログインし直す。第三者Cookieに依存しない方式。GitHubやCloudflareの管理トークンをiPhoneに渡すことはない。

## Macで使う

Node 22.13以降（24推奨）とGoogle Chromeが必要。初回は `npm ci`。ローカル版は `scripts/start.command` をダブルクリックし、`http://127.0.0.1:4173` を開く。サンプル3本が追加される。ローカル版はMacの利用者が管理者で、他の端末からのアクセスは拒否する。iPhoneはGitHub Pages版を使う。

依存関係のインストールでnpmがビルドスクリプトを保留した場合は、依存する公式のesbuild/workerdインストール処理を確認して実行する。

## 通知と入力テスト

セットアップ時に生成した `.env` はMac専用、権限600、Git管理対象外。iPhoneやGitHubに転送しない。

```sh
node --env-file=.env scripts/agent.mjs
```

この処理を1分間隔で動かすと、通知キューを配信し、予定時刻になった承認済み記事をローカルの入力テスト画面に入力する。`docs/launchd-agent.plist.example`のパスをMacに合わせて指定すればlaunchdに登録できる。**まだ自動起動は登録していない。**最初は手動実行で確認する。停止中でも通知は配信される。設定画面に最終通信時刻が表示される。

iPhone: SafariでHTTPSのGitHub Pagesを開く → 共有 → ホーム画面に追加 → 追加したアイコンから起動 → ログイン → 設定 → 通知を有効にする。iOS/iPadOS 16.4以降。通知拒否後の再許可はOS設定から行う。ロック画面には記事名・本文を送らず「更新があります」とだけ表示する。配信はMac稼働中のみ。端末到達や即時配信は保証されず、UIが正本。

## 夜間制作

既存のChatGPT契約だけでこのMacスクリプトが無制限に生成できるわけではない。次の選択肢がある。

- ChatGPT等で作成したJSONを編集室の「設定→取り込み」で追加。無料1本・200円2本を用意し、必ず人間が最終版を承認する。
- `scripts/generate.mjs` はOpenAI API用。別料金のAPIキーをMacの `.env` に設定し、`node --env-file=.env scripts/generate.mjs`。モデルは `OPENAI_MODEL` で選ぶ。APIキー未設定のまま実行しない。原稿の品質・事実確認は自動で保証されない。最新ニュースの自動調査は未実装。
- 夜間用launchdは`StartCalendarInterval`のHour=2、Minute=0で生成スクリプトを呼ぶ。MacのタイムゾーンをAsia/Tokyoにする。生成用launchdのインストールは未実施。既存のChatGPTスケジュールを新規作成・再開していない。

生成は日付ごとに控えを作り、完了済みは再実行しない。途中中断は自動リトライせず、UIと控えを照合する。修正依頼への自動再生成は未接続。現在はコメントを読んで編集・再取り込みする。

## GitHubから取り込む（任意）

原稿用は**非公開リポジトリ**を別に作る。公開UIのリポジトリに原稿をコミットしない。GitHub Appを作り、対象1リポジトリのみ、Contents: Read-onlyを許可してインストール。秘密鍵は作業フォルダ外のMacの私有ディレクトリで権限600にする。

Macの環境変数 `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_APP_KEY_FILE`, `GITHUB_REPOSITORY`（owner/repo）, `GITHUB_ARTICLE_PATH`（JSON）を設定し、`node --env-file=.env scripts/import-github.mjs`。インストールトークンはメモリ内で発行し、UIには渡さない。同じファイルSHAは二重取り込みしない。ファイルに承認済みと書かれていても、取り込むのは本文・価格・タグだけで、未承認になる。GitHub Appの作成と実アカウントでの検証は未実施。

## 変更と復旧

- 承認は本文・タイトル・タグ・価格・有料位置のSHA-256と版番号に結び付く。変更すると承認・予約が失効する。
- Macは排他ファイルロックとDBのリースで二重処理を避ける。5分で切れた処理は「要確認」。15分超の遅延予約は「失敗」。自動で再処理しない。
- 「すべて停止」は新しい入力テストを止める。取得済みのテストが終わる場合がある。現在noteへの公開コードはない。
- 中断後はnote側を確認し、必要なら既存URLを記録。未公開と確認した場合だけ「下書きに戻す」。再承認と再予約が必要。
- `prepared`は外部通信を遮断したテスト画面への入力成功。note下書き保存や公開成功ではない。
- noteで本人が手動公開した記事は、最終版を承認した状態で「公開URLの記録」に記録できる。これは本人の申告を記録する機能で、note側との自動照合ではない。
- `.state/agent.lock`が残った場合は、実行中プロセスがないことを確認後に削除する。ロックを勝手に引き継がない。
- ローカルDBは `node scripts/backup.mjs`。バックアップは `.state/backups` に保存する。原稿を含むので公開しない。クラウドは `npx wrangler d1 export yohaku-lab --remote --output .state/cloud-backup.sql`。DB復元は処理停止・バックアップ後に実施する。既存DBの削除はしない。

## noteとの実接続で残ること

今回の検証はnoteのログイン状態を使用していない。実noteのエディタ・有料境界・200円設定・タグの入力セレクタは未検証。通常会員向けの公式投稿APIは確認できない。非公式なブラウザ自動操作は画面変更・bot判定・アカウント停止・誤投稿のリスクがあり、公式の許可を意味しない。

実接続を進める場合は、本人が専用ブラウザにログインし、公開ボタンには触れずに下書き入力を検証する。CookieやstorageStateは秘密情報としてMac外・Git外に出さない。最終版をnoteから読み戻して照合し、有料位置・価格を含めて確認するまでは本番公開アダプタを追加しない。公開結果が曖昧な場合は「要確認」に隔離し、URL照合後に復旧する。

この版には本番投稿の実装がない。記事の承認だけで本番投稿を解禁することはできない。本人から直接公開の指示を受けた後に、別途実装・検証する。
