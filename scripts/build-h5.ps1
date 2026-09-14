param([string]$VersionName = '1.0.2')
$ErrorActionPreference = 'Stop'
if ($VersionName -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version.' }
$projectRoot = Split-Path $PSScriptRoot -Parent
Push-Location $projectRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
    $outputDir = Join-Path $projectRoot 'releases'
    New-Item -ItemType Directory -Force $outputDir | Out-Null
    $artifact = Join-Path $outputDir "abysswait-h5-$VersionName.zip"
    # Keep index.html at the archive root for static hosting uploads.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $temporary = Join-Path $outputDir ("h5-" + [guid]::NewGuid().ToString('N') + '.zip')
    try {
        [IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $projectRoot 'dist'), $temporary)
        $archive = [IO.Compression.ZipFile]::Open($temporary, [IO.Compression.ZipArchiveMode]::Update)
        try {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $projectRoot 'docs/H5-RELEASE.txt'), 'H5-README.txt') | Out-Null
        } finally { $archive.Dispose() }
        Move-Item -LiteralPath $temporary -Destination $artifact -Force
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
    }
    $hash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash
    Set-Content -LiteralPath "$artifact.sha256" -Value "$hash  abysswait-h5-$VersionName.zip" -Encoding ascii
    Write-Host "H5 package: $artifact"
} finally { Pop-Location }
