#!/usr/bin/env bash
set -euo pipefail

gtk_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
install_autostart=false

usage() {
    printf 'Usage: %s [--autostart]\n' "${0##*/}"
    printf 'Install a desktop launcher for the GTK frontend.\n'
    printf '  --autostart  Also launch it when the desktop session starts\n'
}

while (($#)); do
    case "$1" in
        --autostart) install_autostart=true ;;
        -h|--help) usage; exit 0 ;;
        *) printf 'Unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
    esac
    shift
done

if [[ ! -x "$gtk_root/run.sh" ]]; then
    printf 'GTK launcher is missing or not executable: %s/run.sh\n' "$gtk_root" >&2
    exit 1
fi

data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
config_home="${XDG_CONFIG_HOME:-$HOME/.config}"
applications_dir="$data_home/applications"
desktop_file="$applications_dir/dynamic-island-gtk.desktop"

# Desktop Exec uses quoted arguments, with percent signs escaped as field codes.
exec_root="${gtk_root//\\/\\\\}"
exec_root="${exec_root//\"/\\\"}"
exec_root="${exec_root//%/%%}"

mkdir -p "$applications_dir"
printf '[Desktop Entry]\nType=Application\nName=Dynamic Island (GTK)\nComment=System controls and notifications\nIcon=view-grid-symbolic\nTerminal=false\nCategories=Utility;\nStartupWMClass=dynamic-island-gtk\nExec="%s/run.sh"\nActions=Demo;\n\n[Desktop Action Demo]\nName=Preview\nExec="%s/run.sh" --demo --window\n' "$exec_root" "$exec_root" > "$desktop_file"
chmod 0644 "$desktop_file"

if [[ "$install_autostart" == true ]]; then
    autostart_dir="$config_home/autostart"
    mkdir -p "$autostart_dir"
    install -m 0644 "$desktop_file" "$autostart_dir/dynamic-island-gtk.desktop"
    printf 'Autostart enabled for this user.\n'
fi

printf 'Launcher installed: %s\n' "$desktop_file"
printf 'Run the preview directly with: %s/run.sh --demo --window\n' "$gtk_root"