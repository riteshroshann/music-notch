; Clean uninstall: stop the app, remove the start-at-login entry, then say goodbye.
!macro customUnInstall
  nsExec::Exec 'taskkill /IM "Music Notch.exe" /F'
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Music Notch"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Music Notch"
  IfSilent +2
    MessageBox MB_OK|MB_ICONINFORMATION "The music stops here, for now.$\r$\n$\r$\nMusic Notch is gone, and so is everything it kept on this PC. Your playlists never noticed; they were always yours.$\r$\n$\r$\nThe top of your screen will always have room for the next song.$\r$\n$\r$\nRitesh Roshan$\r$\nLead engineer, Music Notch"
!macroend
