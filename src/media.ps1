# Now-playing bridge over Windows' media sessions (the same API the volume flyout uses).
# Writes one JSON object per line on change; reads commands from stdin:
#   toggle | play | pause | next | prev | seek <ms> | quit
# Windows PowerShell 5.1 only: PowerShell 7 dropped WinRT projection.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IInputStream, Windows.Storage.Streams, ContentType = WindowsRuntime]

$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Await($op, [Type]$type) {
  $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  if (-not $t.Wait(3000)) { throw 'timed out' }
  $t.Result
}

$Mgr = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
$Props = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
$Stream = [Windows.Storage.Streams.IRandomAccessStreamWithContentType]
$AsStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))
$manager = Await ($Mgr::RequestAsync()) $Mgr

function Emit($obj) {
  [Console]::Out.WriteLine(($obj | ConvertTo-Json -Compress -Depth 3))
  [Console]::Out.Flush()
}

# A playing session wins over the one Windows calls current, so a paused tab can't hide Spotify.
function Pick {
  $playing = $manager.GetSessions() | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq 'Playing' } | Select-Object -First 1
  if ($playing) { return $playing }
  $manager.GetCurrentSession()
}

function Art($props) {
  if (-not $props.Thumbnail) { return $null }
  $s = Await ($props.Thumbnail.OpenReadAsync()) $Stream
  # PowerShell sees the stream as a bare COM object; reflection makes the interface cast for us.
  $net = $AsStreamForRead.Invoke($null, @($s))
  try {
    $mem = [IO.MemoryStream]::new()
    $net.CopyTo($mem)
    if ($mem.Length -eq 0 -or $mem.Length -gt 8MB) { return $null }
    $bytes = $mem.ToArray()
    $type = if ($bytes[0] -eq 0x89) { 'image/png' } else { 'image/jpeg' }
    "data:$type;base64,$([Convert]::ToBase64String($bytes))"
  } finally { $net.Dispose() }
}

$epoch = [DateTimeOffset]::new(1970, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
$last = ''
$lastArtKey = $null
$session = $null
# Console.In reads synchronously even through ReadLineAsync; a raw stream reads on the thread pool.
$reader = [IO.StreamReader]::new([Console]::OpenStandardInput(), [Text.UTF8Encoding]::new($false))
$pending = $reader.ReadLineAsync()

while ($true) {
  if ($pending.IsCompleted) {
    $line = $pending.Result
    if ($null -eq $line -or $line -eq 'quit') { break }
    $pending = $reader.ReadLineAsync()
    $s = Pick
    if ($s) {
      try {
        $cmd, $arg = $line.Trim() -split ' ', 2
        $op = switch ($cmd) {
          'toggle' { $s.TryTogglePlayPauseAsync() }
          'play' { $s.TryPlayAsync() }
          'pause' { $s.TryPauseAsync() }
          'next' { $s.TrySkipNextAsync() }
          'prev' { $s.TrySkipPreviousAsync() }
          'seek' { $s.TryChangePlaybackPositionAsync([long]$arg * 10000) }
        }
        if ($op) { $null = Await $op ([bool]) }
      } catch { Emit @{ type = 'error'; message = "$cmd failed: $($_.Exception.Message)" } }
    }
  }

  try {
    $session = Pick
    if (-not $session) {
      if ($last -ne 'none') { Emit @{ type = 'none' }; $last = 'none' }
    } else {
      $p = Await ($session.TryGetMediaPropertiesAsync()) $Props
      $info = $session.GetPlaybackInfo()
      $tl = $session.GetTimelineProperties()
      $c = $info.Controls
      $state = [ordered]@{
        type = 'state'
        app = $session.SourceAppUserModelId
        title = $p.Title
        artist = $p.Artist
        album = $p.AlbumTitle
        status = "$($info.PlaybackStatus)"
        position = [long]$tl.Position.TotalMilliseconds
        duration = [long]$tl.EndTime.TotalMilliseconds
        updated = [long]($tl.LastUpdatedTime - $epoch).TotalMilliseconds
        canPrev = $c.IsPreviousEnabled
        canNext = $c.IsNextEnabled
        canSeek = $c.IsPlaybackPositionEnabled
        shuffle = $info.IsShuffleActive
      }
      $json = $state | ConvertTo-Json -Compress
      if ($json -ne $last) { [Console]::Out.WriteLine($json); [Console]::Out.Flush(); $last = $json }
      # Players often publish the cover a moment after the title, so keep asking for a few seconds.
      $artKey = "$($session.SourceAppUserModelId)|$($p.Title)|$($p.Artist)|$($p.AlbumTitle)"
      if ($artKey -ne $lastArtKey -and $p.Title) {
        $lastArtKey = $artKey
        $artTries = 0
        $gotArt = $false
        Emit @{ type = 'art'; key = $artKey; src = $null }
      }
      if (-not $gotArt -and $artTries -lt 20 -and $p.Title) {
        $artTries++
        try {
          $src = Art $p
          if ($src) { $gotArt = $true; Emit @{ type = 'art'; key = $artKey; src = $src } }
        } catch {}
      }
    }
  } catch {
    Emit @{ type = 'error'; message = $_.Exception.Message }
    Start-Sleep -Milliseconds 1500
  }
  Start-Sleep -Milliseconds 250
}
