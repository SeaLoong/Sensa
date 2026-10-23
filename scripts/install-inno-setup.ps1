$ErrorActionPreference = 'Stop'
# Official release, pinned bytes and publisher; never execute an unverified download.
$version = '6.7.3'
$expectedHash = '9c73c3bae7ed48d44112a0f48e66742c00090bdb5bef71d9d3c056c66e97b732'
$download = Join-Path $env:RUNNER_TEMP "innosetup-$version.exe"
$compilerRoot = Join-Path $env:RUNNER_TEMP "sensa-inno-$version"
Invoke-WebRequest "https://github.com/jrsoftware/issrc/releases/download/is-6_7_3/innosetup-$version.exe" -OutFile $download
if ((Get-FileHash $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
    throw 'Inno Setup checksum does not match the pinned official release.'
}
$signature = Get-AuthenticodeSignature $download
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -ne 'Pyrsys B.V.') {
    throw 'Inno Setup does not have the expected valid publisher signature.'
}
$process = Start-Process $download -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/CURRENTUSER', "/DIR=`"$compilerRoot`"") -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Inno Setup installation failed: $($process.ExitCode)" }
$compiler = Join-Path $compilerRoot 'ISCC.exe'
if (-not (Test-Path $compiler -PathType Leaf)) { throw 'The pinned Inno Setup compiler is missing.' }
"SENSA_ISCC=$compiler" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
