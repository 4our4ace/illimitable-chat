#!/usr/bin/env bash
# illimitable's installer: `illi`, one file, into ~/.local/bin (or
# $ILLI_INSTALL). The latest release's binary for this system, checked
# against that release's SHA256SUMS (the release found once, so both
# files are of it); with no release yet (or ILLI_SOURCE=1), built from
# the source with Bun 1.4.3 or later (installed first if missing), the
# release's tag if there is one, its libraries as bun.lock pins them. A
# download that fails (offline, a rate limit, one stalled for a minute)
# stops it. The new file is put beside where it goes and run there
# (--version) before it takes the old one's place, whole. Run again, it
# replaces the one there; illi updates itself from then on (`illi
# upgrade` at once). All of it is one function, run on the last line, so
# a download of this script cut short runs nothing.
#
#   curl -fsSL https://raw.githubusercontent.com/4our4ace/illimitable-chat/main/install.sh | bash

set -euo pipefail

main() {
  local REPO="4our4ace/illimitable-chat"
  local BIN="${ILLI_INSTALL:-$HOME/.local/bin}"
  local os arch tag asset build="" code want version next
  # tmp, new and release are the script's own, not main's: the trap and
  # fetch read them, the trap after main is gone

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
  new="$BIN/.illi.new.$$"
  trap 'rm -rf "$tmp"; rm -f "$new"' EXIT

  # the latest release's tag, where GitHub's latest page redirects (to
  # the releases' page: no release yet), so the binary and its sums come
  # from one release; any other answer (a rate limit, an error, a
  # redirect elsewhere: a moved repo, a sign-in page) stops it, never
  # building what no release holds
  local got where
  got="$(curl -sS --connect-timeout 15 --max-time 60 -o /dev/null -w '%{http_code} %{redirect_url}' "https://github.com/$REPO/releases/latest")" || die "can't reach GitHub (offline?): try again later"
  case "${got%% *}" in
    301 | 302 | 303 | 307 | 308) ;;
    *) die "GitHub won't say which release is the latest now (HTTP ${got%% *}): try again later" ;;
  esac
  where="${got#* }"
  case "$where" in
    "https://github.com/$REPO/releases/tag/v"[0-9]*)
      tag="${where##*/releases/tag/}"
      case "$tag" in
        *[!A-Za-z0-9._-]*) die "GitHub named the latest release oddly ($tag): try again later" ;;
      esac
      ;;
    "https://github.com/$REPO/releases") tag="" ;;
    *) die "GitHub sent the latest release's page elsewhere (${where:-nowhere}): try again later, or build from the source with ILLI_SOURCE=1" ;;
  esac

  asset="illi-$os-$arch"
  release="https://github.com/$REPO/releases/download/$tag"
  if [ -n "${ILLI_SOURCE:-}" ]; then
    build="ILLI_SOURCE is set"
  elif [ -z "$tag" ]; then
    build="no release yet"
  else
    say "Downloading illi ${tag#v} for $os-$arch."
    code="$(fetch "$asset" progress)"
    case "$code" in
      200) ;;
      404) die "the release $tag has no $asset yet (it may still be uploading): try again in a minute" ;;
      *)   die "GitHub won't give $asset now (HTTP $code): try again later" ;;
    esac
    code="$(fetch SHA256SUMS)"
    case "$code" in
      200)
        want="$(awk -v f="$asset" '$2 == f || $2 == "*" f {print $1}' "$tmp/SHA256SUMS")"
        [ -n "$want" ] || die "the release's SHA256SUMS lists no $asset"
        [ "$(sha "$tmp/$asset")" = "$want" ] || die "$asset doesn't match the release's SHA256SUMS: not installed"
        ;;
      404) die "the release has no SHA256SUMS, so $asset can't be checked: not installed" ;;
      *)   die "GitHub won't give SHA256SUMS now (HTTP $code): try again later" ;;
    esac
    mv "$tmp/$asset" "$tmp/illi"
  fi

  if [ -n "$build" ]; then
    say "Building illimitable from its source ($build)."
    command -v git >/dev/null || die "git is needed to build from the source"
    if ! command -v bun >/dev/null; then
      say "Installing Bun first (bun.sh)."
      curl -fsSL https://bun.sh/install | bash >/dev/null
      export PATH="$HOME/.bun/bin:$PATH"
    fi
    # Bun 1.4.3 at least: 1.3's spawnSync could spin forever (bun#34069)
    local have
    have="$(bun --version)"
    later "$have" 1.4.3 || die "building illi needs Bun 1.4.3 or later, and this is $have: run bun upgrade, then this again"
    # the release's own source where there is one, else the newest
    git clone --quiet --depth 1 ${tag:+--branch "$tag"} "https://github.com/$REPO" "$tmp/repo"
    (cd "$tmp/repo" && bun install --frozen-lockfile --production >/dev/null)
    # never reading a project's bunfig.toml or .env as it runs (src/main.ts)
    bun build --compile --no-compile-autoload-bunfig --no-compile-autoload-dotenv --minify "$tmp/repo/src/main.ts" "$tmp/repo/src/chat/Seeker.ts" --outfile "$tmp/illi" >/dev/null
  fi

  # beside where it goes (a /tmp that runs nothing, noexec, can't stop
  # it), run there, then moved in whole, so an illi running from there
  # goes on
  mkdir -p "$BIN"
  cp "$tmp/illi" "$new"
  chmod 755 "$new"
  version="$("$new" --version)" || die "the new illi won't run here ($(uname -s) $(uname -m)$(musl))"
  mv -f "$new" "$BIN/illi"
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
}

say() { printf '\033[1m%s\033[0m\n' "$*"; }
die() { printf 'illi: %s\n' "$*" >&2; exit 1; }
# whether version $1 is $2 or later (x.y.z, a -suffix left out)
later() { local IFS=. i; local -a a=(${1%%-*}) b=(${2%%-*}); for i in 0 1 2; do (( ${a[i]:-0} != ${b[i]:-0} )) && { (( ${a[i]:-0} > ${b[i]:-0} )); return; }; done; return 0; }

# a release's file into $tmp (with progress, a bar on a terminal);
# prints its HTTP status (404: none), fails when GitHub can't be reached
# or the download stalls (under 1 KB/s for a minute)
fetch() {
  local bar=(-sS)
  [ "${2:-}" = progress ] && [ -t 2 ] && bar=(--progress-bar)
  curl "${bar[@]}" -L --retry 2 --connect-timeout 15 --speed-limit 1024 --speed-time 60 -o "$tmp/$1" -w '%{http_code}' "$release/$1" || die "can't download $1 from GitHub (offline, or it stalled): try again later"
}

# ", musl: not supported" on a system whose C library is musl (Alpine
# and the like: illi's builds are for glibc's); its ldd says so on its
# --version and fails, so the words are read whole, no pipe's status
# (pipefail) in the way; no ldd (macOS) says nothing
musl() {
  case "$(ldd --version 2>&1 || true)" in
    *[Mm][Uu][Ss][Ll]*) echo ", musl: not supported" ;;
  esac
}

# a file's SHA-256
sha() {
  if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | awk '{print $1}'
}

main "$@"
