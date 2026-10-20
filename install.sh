#!/usr/bin/env bash
# Illimitable's installer: `illi`, one file, into ~/.local/bin (or
# $ILLI_INSTALL). The latest release's binary for this system; with none
# yet, built from the source with Bun (installed first if missing). Run
# again (or `illi upgrade`), it replaces the one there.
#
#   curl -fsSL https://raw.githubusercontent.com/4our4ace/illimitable-chat/main/install.sh | bash

set -euo pipefail

REPO="4our4ace/illimitable-chat"
BIN="${ILLI_INSTALL:-$HOME/.local/bin}"

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf 'illi: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Linux)  os=linux ;;
  Darwin) os=darwin ;;
  *)      die "$(uname -s) isn't supported (on Windows, run it in WSL)" ;;
esac
case "$(uname -m)" in
  x86_64 | amd64)  arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *)               die "$(uname -m) isn't supported" ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

if curl -fsSL "https://github.com/$REPO/releases/latest/download/illi-$os-$arch" -o "$tmp/illi" 2>/dev/null; then
  say "Downloaded the latest release of Illimitable."
else
  say "No release for $os-$arch yet: building Illimitable from its source."
  command -v git >/dev/null || die "git is needed to build from the source"
  if ! command -v bun >/dev/null; then
    say "Installing Bun first (bun.sh)."
    curl -fsSL https://bun.sh/install | bash >/dev/null
    export PATH="$HOME/.bun/bin:$PATH"
  fi
  git clone --quiet --depth 1 "https://github.com/$REPO" "$tmp/repo"
  bun build --compile --minify "$tmp/repo/src/main.ts" --outfile "$tmp/illi" >/dev/null
fi

chmod 755 "$tmp/illi"
version="$("$tmp/illi" --version)" || die "the new illi won't run here"

# moved in whole, so an illi running from there goes on
mkdir -p "$BIN"
cp "$tmp/illi" "$BIN/.illi.new"
mv -f "$BIN/.illi.new" "$BIN/illi"
say "Installed $version in $BIN/illi"

case ":$PATH:" in
  *":$BIN:"*) ;;
  *)
    case "$(basename "${SHELL:-}")" in
      fish) echo "Put it on your PATH:  fish_add_path $BIN" ;;
      zsh)  echo "Put it on your PATH:  echo 'export PATH=\"$BIN:\$PATH\"' >> ~/.zshrc" ;;
      *)    echo "Put it on your PATH:  echo 'export PATH=\"$BIN:\$PATH\"' >> ~/.bashrc" ;;
    esac
    ;;
esac
echo "Then run:  illi"
