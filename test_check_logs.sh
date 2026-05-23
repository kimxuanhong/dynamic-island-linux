#!/bin/bash
# Script để xem logs của GNOME Shell
echo "=== Xem logs của Dynamic Island Extension ==="
echo "Nhấn Ctrl+C để thoát"
echo ""
journalctl -f -o cat /usr/bin/gnome-shell | grep -i "WindowManager"
