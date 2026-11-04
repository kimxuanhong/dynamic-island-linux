#!/usr/bin/env bash
set -euo pipefail
island_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$island_root"
if [[ " ${*} " != *" --demo "* && " ${*} " != *" --quit "* ]]; then
    mkdir -p bin
    if [[ ! -x bin/dynamic-island-server ]] || find ../server -name '*.go' -newer bin/dynamic-island-server -print -quit | read -r _; then
        printf 'Building Dynamic Island backend…\n'
        (cd ../server && go build -o "$island_root/bin/dynamic-island-server" .)
    fi
fi
export GDK_BACKEND="${GDK_BACKEND:-wayland}"
exec /usr/bin/python3 -m island "$@"
