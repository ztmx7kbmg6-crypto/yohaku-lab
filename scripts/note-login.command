#!/bin/zsh
cd "${0:A:h}/.."
if ! command -v node >/dev/null; then
  [[ -f "$HOME/.nvm/nvm.sh" ]] && source "$HOME/.nvm/nvm.sh"
fi
node scripts/note-login.mjs
