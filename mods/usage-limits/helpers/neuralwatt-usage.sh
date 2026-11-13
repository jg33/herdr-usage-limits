#!/bin/sh
# Prints NeuralWatt's quota as one JSON line and exits:
#   {"snapshot_at":…,"balance":{…},"limits":{…},"subscription":null,"daily_free_energy":{…},"key":{…}}
# GET https://api.neuralwatt.com/v1/quota with a bearer key, first hit wins:
#   1. $NEURALWATT_API_KEY;
#   2. the login shell's environment (zsh -lic, else bash -lc) — this helper is
#      run by the app with launchd's env, so a shell-only export still counts.
#      Only the text after a __ULKEY__ sentinel counts, so a chatty rc (banner,
#      version notice) can't slip junk in as the key, and the shell is polled
#      with a ~5 s bound so a hanging rc can't hang the fetch;
#   3. the "neuralwatt" entry of opencode's auth.json.
# The key is never echoed; it passes only through a private temp dir that is
# deleted before this helper exits.
#
# Exit: 0 = printed the reply, 127 = no key found anywhere (the mod hides the
# row: you don't use the service), 1 = the request failed, printed nothing, or
# curl is missing.

key=${NEURALWATT_API_KEY:-}
if [ -z "$key" ]; then
  # stdin/stderr off so a noisy shell can't stall or pollute; nothing the shell
  # prints is taken at face value — only what follows the sentinel.
  if command -v zsh >/dev/null 2>&1; then
    login=zsh
  elif command -v bash >/dev/null 2>&1; then
    login=bash
  else
    login=
  fi
  dir=
  [ -n "$login" ] && dir=$(mktemp -d "${TMPDIR:-/tmp}/herdr-ulkey.XXXXXX" 2>/dev/null)
  if [ -n "$dir" ]; then
    out="$dir/out"
    # No portable `timeout` on macOS: run in the background, poll for the
    # sentinel, then kill — the same pattern as claude-usage.sh.
    "$login" -lic 'printf "__ULKEY__%s\n" "$NEURALWATT_API_KEY"' </dev/null >"$out" 2>/dev/null &
    pid=$!
    i=0
    while [ "$i" -lt "${HERDR_USAGE_SHELL_TRIES:-25}" ]; do
      grep -q '__ULKEY__' "$out" 2>/dev/null && break
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.2
      i=$((i + 1))
    done
    kill "$pid" 2>/dev/null
    wait "$pid" 2>/dev/null
    # first line carrying the sentinel, CR and padding stripped; none = no key
    key=$(tr -d '\r' <"$out" | sed -n -e '/__ULKEY__/!d' -e 's/.*__ULKEY__//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/./{p;q;}')
    rm -rf "$dir" # $out held the key: gone on every path from here
  fi
fi
if [ -z "$key" ]; then
  auth=${XDG_DATA_HOME:-$HOME/.local/share}/opencode/auth.json
  if [ -r "$auth" ]; then
    # shortcut: assumes a flat {"type":…,"key":"…"} entry; switch to node if opencode ever nests it
    key=$(tr -d '\n' <"$auth" | sed -n 's/.*"neuralwatt"[[:space:]]*:[[:space:]]*{[^}]*"key"[[:space:]]*:[[:space:]]*"\([^"\\]*\)".*/\1/p')
  fi
fi
[ -n "$key" ] || exit 127
command -v curl >/dev/null 2>&1 || exit 1

body=$(curl -s --max-time 10 -H "Authorization: Bearer $key" \
  https://api.neuralwatt.com/v1/quota 2>/dev/null) || exit 1
[ -n "$body" ] || exit 1
printf '%s\n' "$body"
