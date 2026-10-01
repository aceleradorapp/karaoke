$ErrorActionPreference = 'Stop'

$workerDir = Join-Path $PSScriptRoot '..\worker'
Set-Location $workerDir

if (-not (Test-Path '.venv')) {
    py -3.11 -m venv .venv
}

$python = '.\.venv\Scripts\python.exe'

& $python -m pip install --upgrade pip
& $python -m pip install torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cu124
& $python -m pip install -r requirements.txt
& $python -c "import torch; print('CUDA available:', torch.cuda.is_available())"
