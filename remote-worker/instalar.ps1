$ErrorActionPreference = 'Stop'

$appName = 'Processador do Karaokê'
$installDir = Join-Path $env:LOCALAPPDATA 'ProcessadorKaraoke'
$appDir = Join-Path $installDir 'app'
$venvDir = Join-Path $installDir 'venv'
$python = Join-Path $venvDir 'Scripts\python.exe'
$launcher = Join-Path $installDir 'Processador do Karaoke.cmd'
$torchIndex = 'https://download.pytorch.org/whl/cu124'

function Step($text) { Write-Host ''; Write-Host "==> $text" -ForegroundColor Cyan }
function Has($command) { return [bool](Get-Command $command -ErrorAction SilentlyContinue) }

function Find-Python311 {
    if (Has 'py') {
        $found = & py -3.11 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $found) { return $found.Trim() }
    }
    $default = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe'
    if (Test-Path $default) { return $default }
    return $null
}

function Find-FfmpegDir {
    $onPath = Get-Command 'ffmpeg' -ErrorAction SilentlyContinue
    if ($onPath) { return Split-Path $onPath.Source }
    $bases = @($env:LOCALAPPDATA, (Join-Path $env:USERPROFILE 'AppData\Local'), [Environment]::GetFolderPath('LocalApplicationData'))
    foreach ($base in ($bases | Where-Object { $_ } | Select-Object -Unique)) {
        $packages = Join-Path $base 'Microsoft\WinGet\Packages'
        $found = Get-ChildItem -Path $packages -Filter 'ffmpeg.exe' -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -like '*Gyan.FFmpeg*\bin\ffmpeg.exe' } | Select-Object -First 1
        if ($found) { return $found.DirectoryName }
    }
    return $null
}

Write-Host "Instalando o $appName em $installDir" -ForegroundColor Green
Write-Host 'A primeira vez baixa uns 3 GB (bibliotecas de IA). Pode levar alguns minutos.'

Step 'Procurando o Python 3.11'
$basePython = Find-Python311
if (-not $basePython) {
    if (-not (Has 'winget')) { throw 'Instale o Python 3.11 (python.org) e rode este instalador de novo.' }
    winget install -e --id Python.Python.3.11 --scope user --accept-package-agreements --accept-source-agreements
    $basePython = Find-Python311
    if (-not $basePython) { throw 'O Python foi instalado, mas não achei. Feche esta janela e rode o Instalar.cmd de novo.' }
}
Write-Host "Python: $basePython"

Step 'Procurando o FFmpeg'
$ffmpegDir = Find-FfmpegDir
if (-not $ffmpegDir) {
    if (-not (Has 'winget')) { throw 'Instale o FFmpeg (winget install Gyan.FFmpeg) e rode este instalador de novo.' }
    winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
    $ffmpegDir = Find-FfmpegDir
    if (-not $ffmpegDir) { throw 'O FFmpeg foi instalado, mas não achei. Feche esta janela e rode o Instalar.cmd de novo.' }
}
Write-Host "FFmpeg: $ffmpegDir"

Step 'Copiando o programa'
New-Item -ItemType Directory -Force $installDir | Out-Null
if (Test-Path $appDir) { Remove-Item -Recurse -Force $appDir }
New-Item -ItemType Directory -Force $appDir | Out-Null
Copy-Item -Recurse (Join-Path $PSScriptRoot 'caraoke_worker') $appDir
Copy-Item (Join-Path $PSScriptRoot 'requirements.txt') $installDir -Force

Step 'Preparando o ambiente do Python'
if (-not (Test-Path $python)) { & $basePython -m venv $venvDir }
& $python -m pip install --upgrade pip --quiet

Step 'Instalando o PyTorch com suporte à placa NVIDIA (o download maior)'
& $python -m pip install torch==2.5.1 torchaudio==2.5.1 --index-url $torchIndex
if ($LASTEXITCODE -ne 0) { throw 'Falhou ao instalar o PyTorch (veja a mensagem acima). Confira a internet e rode o Instalar.cmd de novo.' }

Step 'Instalando as bibliotecas de IA do karaokê'
& $python -m pip install -r (Join-Path $installDir 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Falhou ao instalar as bibliotecas (veja a mensagem acima). Confira a internet e rode o Instalar.cmd de novo.' }

Step 'Conferindo a placa de vídeo'
& $python -c "import torch; print('Placa NVIDIA:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'não encontrada (vai usar o processador)')"

Step 'Criando o atalho na área de trabalho'
$launcherText = "@echo off`r`nchcp 65001 >nul`r`ntitle $appName`r`nset `"PATH=$ffmpegDir;%PATH%`"`r`ncd /d `"$appDir`"`r`n`"$python`" -X utf8 -u -m caraoke_worker.remote_app`r`necho.`r`npause`r`n"
[System.IO.File]::WriteAllText($launcher, $launcherText, (New-Object System.Text.UTF8Encoding $false))
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut((Join-Path $desktop "$appName.lnk"))
$shortcut.TargetPath = $launcher
$shortcut.WorkingDirectory = $appDir
$shortcut.Description = 'Processa músicas para o karaokê da família'
$shortcut.Save()

Write-Host ''
Write-Host 'Instalado!' -ForegroundColor Green
Write-Host "Abra o atalho '$appName' na área de trabalho e informe o endereço do karaokê e o código de pareamento."
