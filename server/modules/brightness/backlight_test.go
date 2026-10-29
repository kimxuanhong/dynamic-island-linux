package brightness

import (
	"github.com/godbus/dbus/v5"
	"os"
	"testing"
)

func TestParseBacklight(t *testing.T) {
	output := func(name string, active bool, min, max, value int32) map[string]dbus.Variant {
		return map[string]dbus.Variant{"connector": dbus.MakeVariant(name), "active": dbus.MakeVariant(active), "min": dbus.MakeVariant(min), "max": dbus.MakeVariant(max), "value": dbus.MakeVariant(value)}
	}
	for _, tc := range []struct {
		name    string
		outputs []map[string]dbus.Variant
		want    string
		percent int
		fail    bool
	}{
		{"panel preference", []map[string]dbus.Variant{output("HDMI-1", true, 0, 100, 20), output("eDP-1", true, 153, 15360, 13959)}, "eDP-1", 91, false},
		{"minimum", []map[string]dbus.Variant{output("eDP-1", true, 153, 15360, 153)}, "eDP-1", 0, false},
		{"maximum", []map[string]dbus.Variant{output("eDP-1", true, 153, 15360, 15360)}, "eDP-1", 100, false},
		{"inactive", []map[string]dbus.Variant{output("eDP-1", false, 0, 100, 50)}, "", 0, true},
		{"invalid range", []map[string]dbus.Variant{output("eDP-1", true, 0, 0, 0)}, "", 0, true},
		{"unsupported", []map[string]dbus.Variant{{"connector": dbus.MakeVariant("HDMI-1")}}, "", 0, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// Use the representation decoded from a D-Bus struct.
			got, err := parseBacklight(dbus.MakeVariant([]interface{}{uint32(2), tc.outputs}))
			if tc.fail {
				if err == nil {
					t.Fatal("expected unsupported backlight error")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got.Serial != 2 || got.Connector != tc.want || got.percent() != tc.percent {
				t.Fatalf("unexpected backlight: %+v (%d%%)", got, got.percent())
			}
		})
	}
}

func TestLiveBacklightRead(t *testing.T) {
	if os.Getenv("DYNAMIC_ISLAND_TEST_LIVE_BACKLIGHT") != "1" {
		t.Skip("requires desktop session; read only")
	}
	conn, err := dbus.ConnectSessionBus()
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	state, err := readBacklight(conn)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("%s: %d%% (raw %d, range %d–%d)", state.Connector, state.percent(), state.Value, state.Min, state.Max)
}
