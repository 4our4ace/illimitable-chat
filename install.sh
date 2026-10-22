#!/usr/bin/env bash
# illimitable's installer: `illi`, one file, into ~/.local/bin (or
# $ILLI_INSTALL). The latest release's binary for this system, checked
# against the release's SHA256SUMS; with none for it (or ILLI_SOURCE=1),
# built from the source with Bun (installed first if missing). A download
# that fails (offline, a rate limit) stops it. Run again (or `illi
# upgrade`), it replaces the one there.
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

asset="illi-$os-$arch"
release="https://github.com/$REPO/releases/latest/download"

# a release's file into $tmp; prints its HTTP status (404: none), fails
# when GitHub can't be reached
fetch() {
  curl -sSL --retry 2 -o "$tmp/$1" -w '%{http_code}' "$release/$1" || die "can't download $1 from GitHub (offline?): try again later"
}

# a file's SHA-256
sha() {
  if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | awk '{print $1}'
}

build=""
if [ -n "${ILLI_SOURCE:-}" ]; then
  build="ILLI_SOURCE is set"
else
  code="$(fetch "$asset")"
  case "$code" in
    200) ;;
    404) build="no release for $os-$arch yet" ;;
    *)   die "GitHub won't give $asset now (HTTP $code): try again later" ;;
  esac
fi

if [ -z "$build" ]; then
  code="$(fetch SHA256SUMS)"
  case "$code" in
    200)
      want="$(awk -v f="$asset" '$2 == f || $2 == "*" f {print $1}' "$tmp/SHA256SUMS")"
      [ -n "$want" ] || die "the release's SHA256SUMS lists no $asset"
      [ "$(sha "$tmp/$asset")" = "$want" ] || die "$asset doesn't match the release's SHA256SUMS: not installed"
      ;;
    404) say "The release has no SHA256SUMS: $asset is unchecked." ;;
    *)   die "GitHub won't give SHA256SUMS now (HTTP $code): try again later" ;;
  esac
  mv "$tmp/$asset" "$tmp/illi"
  say "Downloaded the latest release of illimitable."
else
  say "Building illimitable from its source ($build)."
  command -v git >/dev/null || die "git is needed to build from the source"
  if ! command -v bun >/dev/null; then
    say "Installing Bun first (bun.sh)."
    curl -fsSL https://bun.sh/install | bash >/dev/null
    export PATH="$HOME/.bun/bin:$PATH"
  fi
  git clone --quiet --depth 1 "https://github.com/$REPO" "$tmp/repo"
  bun build --compile --minify "$tmp/repo/src/main.ts" "$tmp/repo/src/chat/Seeker.ts" --outfile "$tmp/illi" >/dev/null
fi

chmod 755 "$tmp/illi"
version="$("$tmp/illi" --version)" || die "the new illi won't run here"

# moved in whole, so an illi running from there goes on
mkdir -p "$BIN"
cp "$tmp/illi" "$BIN/.illi.new"
mv -f "$BIN/.illi.new" "$BIN/illi"
say "Installed $version in $BIN/illi"

# off the PATH: the line that puts it there, and how a shell open now
# gets it (fish_add_path reaches every fish at once; an rc file, a new
# terminal or the file sourced)
next="illi"
case ":$PATH:" in
  *":$BIN:"*) ;;
  *)
    case "$(basename "${SHELL:-}")" in
      fish) echo "Put it on your PATH:  fish_add_path $BIN" ;;
      zsh)  echo "Put it on your PATH:  echo 'export PATH=\"$BIN:\$PATH\"' >> ~/.zshrc"
            next="illi  (in a new terminal, or after: source ~/.zshrc)" ;;
      *)    echo "Put it on your PATH:  echo 'export PATH=\"$BIN:\$PATH\"' >> ~/.bashrc"
            next="illi  (in a new terminal, or after: source ~/.bashrc)" ;;
    esac
    ;;
esac
echo "Then run:  $next"
echo "In the chat, type /login to sign in with your ChatGPT plan, or see https://github.com/4our4ace/illimitable-chat/blob/main/docs/providers.md for your Claude plan or API keys."
