# 公式仕様の確認（2026-11-17）

- [note公式API発表](https://note.jp/n/n6e16e4dc9e26)：note pro企業、対応サービス・パートナー向け。個人通常アカウントに自由な投稿APIが提供されたとは読めない。
- [note機能一覧](https://www.help-note.com/hc/ja/articles/360000621702)：通常noteに予約投稿なし。プレミアムは使わずMac側で予定を持つ。
- [note利用規約](https://note.com/terms)：総則13の迷惑・障害行為、17のアカウント情報管理などを確認。
- [note迷惑行為対応強化](https://note.jp/n/n6d10be8c5088)：機械的な大量投稿・スパムに段階的対応。3本/日の安全保証は確認できない。ランダム化は投稿ペースを分けるためで、検知回避ではない。
- [WebKit iOS Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)：iOS16.4以降、ホーム画面Webアプリ、ユーザー操作で通知許可。HTTPS・Service Worker・manifestを用意。
- [GitHub Pages制限](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)：静的サイトのため原稿DB・秘密を置かない。GitHub Freeでは公開リポジトリを使う。UIのコードのみ公開。
- [Cloudflare D1価格](https://developers.cloudflare.com/d1/platform/pricing/)：Freeは日500万読取行、10万書込行、総5GBなど。少量運用は無料枠に収める設計だが、無料継続や上限未達を保証しない。
- [Workers価格](https://developers.cloudflare.com/workers/platform/pricing/)：Freeの上限を超えるとエラー等がある。通知ポーリングは毎分でも数千リクエスト/日程度を想定。
- [Cloudflare Access JWT検証](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)：署名・issuer・audience・期限を検証。Ownerメールも固定。
- [Playwright認証状態](https://playwright.dev/docs/auth)：Cookie等の状態ファイルはなりすましに利用され得る。Gitに入れない。

比較：Supabase Auth/Postgres/RLSも選択肢だが、既存CloudflareアカウントがあるためWorkers + D1 + Accessを採用。Supabaseの登録・メール配信設定を増やさない。バックエンドは認証済みOwnerまたは権限制限したMacだけが到達でき、D1を直接ブラウザ公開しない。

実機で未確認：iPhone到達通知、Cloudflare Accessの実メールログイン、GitHub App読み込み、AI生成API、有料note入力。これらを動作確認済みと扱わない。
