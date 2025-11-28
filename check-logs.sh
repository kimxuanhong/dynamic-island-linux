#!/bin/bash
# Script to check GNOME Shell extension logs for dynamic-island extension

echo "=== Checking GNOME Shell Extension Logs ==="
echo ""
echo "1. Recent GNOME Shell errors (last 50 lines):"
echo "--------------------------------------------"
journalctl /usr/bin/gnome-shell -n 50 --no-pager 2>&1 | grep -i "error\|js error\|dynamic\|island" | tail -20

echo ""
echo "2. All GNOME Shell logs with DynamicIsland tags:"
echo "--------------------------------------------"
journalctl /usr/bin/gnome-shell --no-pager 2>&1 | grep -i "DynamicIsland" | tail -30

echo ""
echo "3. To view live logs, run:"
echo "   journalctl /usr/bin/gnome-shell -f"
echo ""
echo "4. To view only errors:"
echo "   journalctl /usr/bin/gnome-shell -f | grep -i error"
echo ""
echo "5. Extension location:"
echo "   ~/.local/share/gnome-shell/extensions/dynamic-island@xuanhong"
echo ""

