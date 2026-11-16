# Music Notch

Windows desktop widget: whatever is playing (Spotify, browsers, any app in Windows' media controls) as a black island at the top of the screen, with controls, synced lyrics and an aurora that moves to the music. Good means it feels like hardware: springy, quiet, never in the way.

## Commands
- `just dev`: run it (clears ELECTRON_RUN_AS_NODE, which VS Code sets)
- `just check`: biome, tsc (checkJs on src/*.js), bun test
- `just player`: fake music app that registers with Windows media controls, for testing without Spotify
- `just dist`: installer + zip via Electron's bundled Node (electron-builder breaks under bun)
- `just site`: copy the renderer into docs/demo and redraw og.png, favicons and build/icon.png

## Layout
- `src/media.ps1`: Windows PowerShell 5.1 sidecar over GlobalSystemMediaTransportControlsSessionManager; JSON lines out, commands in. PowerShell 7 can't load WinRT.
- `src/media.js`, `src/lyrics.js`: bridge process and LRCLIB lyrics; pure parts are tested
- `src/main.js`: window, tray, settings, loopback audio handler
- `src/renderer/`: `ears.js` loopback FFT and beat, `aurora.js` bloom and halo canvases, `app.js` wiring
- `--shot=<png> --open=0|1 [--live=1]` captures the window and quits; without `--live` it uses the demo feed

## Conventions
- Islands are div role=button, never <button>.
- No sound files or fonts shipped; everything synthesised or system.
- WinRT objects reach PowerShell as bare COM objects: call .NET adapters through reflection (see AsStreamForRead).
