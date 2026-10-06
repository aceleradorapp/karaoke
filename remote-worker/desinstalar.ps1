$ErrorActionPreference = 'Stop'

$appName = 'Processador do Karaokê'
$installDir = Join-Path $env:LOCALAPPDATA 'ProcessadorKaraoke'
$shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) "$appName.lnk"

if (Test-Path $shortcut) { Remove-Item -Force $shortcut }
if (Test-Path $installDir) { Remove-Item -Recurse -Force $installDir }

Write-Host "$appName removido." -ForegroundColor Green
Write-Host 'No karaokê, remova a máquina em Configurações › Máquinas de processamento.'
Write-Host 'O Python e o FFmpeg continuam instalados (podem ser removidos pelo Windows, se quiser).'
