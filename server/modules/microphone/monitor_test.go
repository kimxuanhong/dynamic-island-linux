package microphone

import "testing"

func TestMonitorSources(t *testing.T) {
	sources, err := monitorSources([]byte(`[
      {"index":1,"monitor_of_sink":0},
      {"index":2,"monitor_of_sink":"alsa_output.monitor"},
      {"index":3,"monitor_of_sink":null},
      {"index":4,"monitor_of_sink":"n/a"},
      {"index":5,"monitor_of_sink":4294967295},
      {"index":6,"monitor_of_sink":"4294967295"},
      {"index":7}
    ]`))
	if err != nil {
		t.Fatal(err)
	}
	if len(sources) != 2 || !sources[1] || !sources[2] {
		t.Fatalf("wrong monitors: %v", sources)
	}
	if _, err := monitorSources([]byte(`invalid`)); err == nil {
		t.Fatal("malformed source data accepted")
	}
}

func TestCaptureIdentityAndSource(t *testing.T) {
	apps := parsePactlOutput(`Source Output #80
    Source: 42
    application.name = "Visualizer"
    application.id = "org.example.Visualizer"
    application.process.binary = "visualizer"
    application.process.id = "100"
Source Output #81
    Source: 7
    application.name = "Recorder"
    application.process.id = "101"
`)
	if len(apps) != 2 || apps[0].SourceIndex != 42 || apps[0].AppID != "org.example.Visualizer" ||
		apps[0].Process != "visualizer" || apps[1].SourceIndex != 7 {
		t.Fatalf("wrong captures: %+v", apps)
	}
}
