#!/usr/bin/env pwsh
# Don Edge headless bi ro sau moi lan audit + thu muc temp nova-*.
# CHI dung tien trinh co "headless" trong CommandLine — KHONG cham trinh duyet cua nguoi dung.
$headless = Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -match "headless" }
$killed = 0
foreach ($p in $headless) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; $killed++ } catch {} }

$t = "$env:LOCALAPPDATA\Temp"
$removed = 0
foreach ($d in (Get-ChildItem -LiteralPath $t -Directory -Filter "nova-*" -ErrorAction SilentlyContinue)) {
  try { Remove-Item -LiteralPath $d.FullName -Recurse -Force -ErrorAction Stop; $removed++ } catch {}
}

$v = Get-Volume -DriveLetter C
Write-Output ("dung {0} Edge headless | xoa {1} thu muc temp | C: trong {2:N1} GB" -f $killed, $removed, ($v.SizeRemaining/1GB))