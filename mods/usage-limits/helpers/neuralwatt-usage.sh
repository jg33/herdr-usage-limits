#!/bin/sh
# Prints NeuralWatt's quota as one JSON line and exits:
#   {"snapshot_at":…,"balance":{…},"limits":{…},"subscription":null,"daily_free_energy":{…},"key":{…}}
# GET https://api.neuralwatt.com/v1/quota with a bearer key, first hit wins:
#   1. $NEURALWATT_API_KEY;
#   2. the login shell's environment (zsh -lic, else bash -lc) — this helper is
#      run by the app with launchd's env, so a shell-only export still counts;
#   3. the "neuralwatt" entry of opencode's auth.json.
# The key is never echoed and never written to disk.
#
# Exit: 0 = printed the reply, 127 = no key found anywhere (the mod hides the
# row: you don't use the service), 1 = the request failed, printed nothing, or
# curl is missing.

key=${NEURALWATT_API_KEY:-}
if [ -z "$key" ]; then
  # stdin/stderr off so a noisy or prompt-hung shell can't stall the helper;
  # empty output means "not found", never an empty success.
  if command -v zsh >/dev/null 2>&1; then
    out=$(zsh -lic 'printenv NEURALWATT_API_KEY' </dev/null 2>/dev/null)
  elif command -v bash >/dev/null 2>&1; then
    out=$(bash -lc 'printenv NEURALWATT_API_KEY' </dev/null 2>/dev/null)
  else
    out=
  fi
  # first non-empty line, whitespace/CR stripped
  key=$(printf '%s\n' "$out" | sed -n -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e '/./{p;q;}')
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
