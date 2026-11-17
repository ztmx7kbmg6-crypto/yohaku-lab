#!/bin/zsh
cd "${0:A:h}/.."
if ! command -v node >/dev/null; then
  [[ -f "$HOME/.nvm/nvm.sh" ]] && source "$HOME/.nvm/nvm.sh"
fi
mkdir -p .state/logs
chmod 700 .state/logs
node scripts/note-login.mjs 2>&1 | tee .state/logs/note-login.log
echo "ログイン画面の処理が終了しました。"
