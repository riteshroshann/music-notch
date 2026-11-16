# Music Notch

Whatever you're playing, hanging off the top of your screen, glowing to the beat.

A black island sits on the top edge of Windows. Hit play in Spotify, YouTube, Apple Music, TIDAL, VLC, anything that shows up in Windows' media controls, and it drops in with the cover art and the line being sung right now. Click it and it springs open into a full player: previous, pause, next, and a glowing scrubber you can drag. Behind it all, an aurora takes its colours from the album cover and listens to the actual sound, so every kick drum is a flash of light.

Nothing playing? It tucks itself away. It bloops when it opens. Nobody asked for that, and it's the best part.

**[Download for Windows](https://github.com/riteshroshann/music-notch/releases/latest/download/Music-Notch-win.exe)** · [Portable zip](https://github.com/riteshroshann/music-notch/releases/latest/download/Music-Notch-win.zip) · [Website](https://riteshroshann.github.io/music-notch/)

## Thirty-second setup

1. Run the installer. Windows will clutch its pearls ("Windows protected your PC") because the app isn't code-signed. Click **More info**, then **Run anyway**.
2. Play a song. That's it. No sign in, no settings.
3. Right-click the island (or the tray icon) to toggle the aurora, synced lyrics, sounds and start-at-login.

Keys when it's open: **Space** plays and pauses, **←** and **→** skip, **Esc** closes.

**Breaking up?** Settings → Apps → Music Notch → Uninstall. It takes everything with it.

## How it works

```
bun install
just dev      # run it
just check    # lint, types, unit tests
just player   # a fake music app for testing, no Spotify needed
just dist     # installer + zip
```

Plain JavaScript in one transparent Electron window. Now playing comes from Windows' own media session API through a tiny PowerShell sidecar, so there are no native modules to compile. The aurora hears your PC's sound through Chromium's loopback capture and an FFT; nothing is recorded. Synced lyrics come from [LRCLIB](https://lrclib.net), a free and open lyrics database, which gets the song's title, artist, album and length and nothing else. Turn lyrics off and the app never touches the network.

[Privacy](https://riteshroshann.github.io/music-notch/privacy.html) · [Terms](https://riteshroshann.github.io/music-notch/terms.html) · MIT licensed. Not affiliated with Spotify or any other music service.

Engineered by Ritesh Roshan.
