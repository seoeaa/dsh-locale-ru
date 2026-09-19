#!/bin/bash
# Install dsh-locale-ru into the DeepSeek Harness web profile.
# Usage: bash install.sh [profile]
# Default profile: web
set -e
PROFILE="${1:-web}"
PLUGIN_DIR="$HOME/.dsh/profiles/$PROFILE/plugins/dsh-locale-ru"

echo "Installing dsh-locale-ru into profile: $PROFILE"
mkdir -p "$(dirname "$PLUGIN_DIR")"
if [ ! -d "$PLUGIN_DIR/.git" ]; then
  git clone https://github.com/seoeaa/dsh-locale-ru.git "$PLUGIN_DIR"
else
  git -C "$PLUGIN_DIR" pull
fi

cd "$HOME/.dsh/profiles/$PROFILE"
# link: — профиль использует сам клон; file: скопировал бы файлы в node_modules
# и перестал бы видеть обновления после git pull.
dsh plugin --profile "$PROFILE" add "link:./plugins/dsh-locale-ru"
echo "Done. Restart dsh web and hard-refresh the browser (Ctrl+Shift+R)."
