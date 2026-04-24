# vhs tape script for subagent-watch demo
# Run with: vhs demo/demo.tape
# Outputs: assets/demo.gif

Output assets/demo.gif

Set FontSize 14
Set Width 1400
Set Height 900
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms
Set Padding 20
Set FontFamily "JetBrains Mono"

# Seed fake subagent activity (hidden from recording)
Hide
Type "rm -rf /tmp/subwatch-demo && node demo/seed.mjs /tmp/subwatch-demo > /tmp/subwatch-demo.env"
Enter
Sleep 800ms
Type "export SUBAGENT_WATCH_PROJECTS_DIR=/tmp/subwatch-demo/projects"
Enter
Type "export SUBAGENT_WATCH_LINGER_MS=120000"
Enter
Type "export SUBAGENT_WATCH_IDLE_MS=60000"
Enter
Type "clear"
Enter
Show

# Run subagent-watch
Type "subwatch"
Enter

# Hold so the viewer can read the panels
Sleep 9s

# Quit cleanly
Type "q"
Sleep 500ms
