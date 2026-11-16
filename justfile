set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

default: check

# Run the notch
dev:
    $env:ELECTRON_RUN_AS_NODE=$null; bun x electron .

# Format check, lint, types, tests
check:
    bun x biome check .
    bun x tsc --noEmit
    bun test

# Fix formatting and autofixable lint
fmt:
    bun x biome check --write .

# Installer and portable zip into dist/
dist:
    $env:ELECTRON_RUN_AS_NODE="1"; node_modules/electron/dist/electron.exe scripts/dist.js

# A fake music player that shows up in Windows' media controls, for testing without Spotify
player:
    $env:ELECTRON_RUN_AS_NODE=$null; node_modules/electron/dist/electron.exe test/player.js

# Refresh docs/ demo, OG image, favicons and the app icon
site:
    Copy-Item src/renderer/* docs/demo/ -Force
    $env:ELECTRON_RUN_AS_NODE=$null; node_modules/electron/dist/electron.exe scripts/site-assets.js
