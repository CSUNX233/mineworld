param(
    [string]$VersionName = '1.0.4',
    [int]$VersionCode = 5,
    [string]$JavaPath = $env:JAVA_HOME,
    [string]$SdkPath = $env:ANDROID_HOME
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (-not $JavaPath) {
    $JavaPath = (Get-ChildItem 'D:/34229/tools/android-build/java' -Directory | Select-Object -First 1).FullName
}
if (-not $SdkPath) { $SdkPath = 'D:/34229/tools/android-build/sdk' }
if (-not (Test-Path -LiteralPath "$JavaPath/bin/java.exe")) { throw 'Provide JDK 21 using -JavaPath.' }
if (-not (Test-Path -LiteralPath "$SdkPath/platforms/android-36/android.jar")) { throw 'Provide Android SDK 36 using -SdkPath.' }
if (-not (Test-Path -LiteralPath "$projectRoot/android/signing.properties")) {
    throw 'Restore android/signing.properties from your private signing backup before building.'
}
if ($VersionName -notmatch '^\d+\.\d+\.\d+$' -or $VersionCode -lt 1) { throw 'Invalid release version.' }
$env:JAVA_HOME = $JavaPath
$env:ANDROID_HOME = $SdkPath
$sdkForwardPath = $SdkPath.Replace('\', '/')
Set-Content -LiteralPath "$projectRoot/android/local.properties" -Value "sdk.dir=$sdkForwardPath" -Encoding ascii
Push-Location $projectRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
    & npx.cmd cap sync android
    if ($LASTEXITCODE -ne 0) { throw 'Android sync failed.' }
    Push-Location "$projectRoot/android"
    try {
        & ./gradlew.bat assembleRelease --no-daemon --max-workers=2 "-PreleaseVersionCode=$VersionCode" "-PreleaseVersionName=$VersionName"
        if ($LASTEXITCODE -ne 0) { throw 'Android release build failed.' }
    } finally { Pop-Location }
    $artifact = "$projectRoot/releases/abysswait-$VersionName-release.apk"
    New-Item -ItemType Directory -Force "$projectRoot/releases" | Out-Null
    Copy-Item -LiteralPath "$projectRoot/android/app/build/outputs/apk/release/app-release.apk" -Destination $artifact
    & "$SdkPath/build-tools/36.0.0/apksigner.bat" verify --verbose --print-certs $artifact
    if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed.' }
    $hash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash
    Set-Content -LiteralPath "$artifact.sha256" -Value "$hash  abysswait-$VersionName-release.apk" -Encoding ascii
    Write-Host "Release APK: $artifact"
} finally { Pop-Location }
