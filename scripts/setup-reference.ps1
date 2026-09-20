$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$phase1Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $phase1Root
$env:UV_CACHE_DIR = Join-Path $phase1Root '.uv-cache'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $phase1Root '.tools\python'
uv python install 3.12.12 --no-bin --no-registry --no-config --no-progress
if ($LASTEXITCODE -ne 0) { throw 'Project-local Python provisioning failed.' }
$phase1Python = Join-Path $env:UV_PYTHON_INSTALL_DIR 'cpython-3.12.12-windows-x86_64-none\python.exe'
uv sync --locked --python $phase1Python --no-python-downloads --no-progress
if ($LASTEXITCODE -ne 0) { throw 'Project virtual environment setup failed.' }
$phase1Archive = Join-Path $phase1Root '.tools\downloads\ffmpeg-9.0.1-essentials_build.zip'
New-Item -ItemType Directory -Path (Split-Path $phase1Archive) -Force | Out-Null
if (-not (Test-Path -LiteralPath $phase1Archive)) {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/GyanD/codexffmpeg/releases/download/9.0.1/ffmpeg-9.0.1-essentials_build.zip' -OutFile $phase1Archive -TimeoutSec 180
}
if ((Get-FileHash -LiteralPath $phase1Archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'fec81ae03971d9dd4be3ebe02e263bd2ec1d789483f931bdba5f5715e65da2e9') { throw 'FFmpeg archive checksum mismatch.' }
Expand-Archive -LiteralPath $phase1Archive -DestinationPath (Join-Path $phase1Root '.tools\ffmpeg') -Force
Write-Output 'Python 3.12.12, the project .venv, and GPLv3 FFmpeg 9.0.1 are ready. No model weights downloaded.'
