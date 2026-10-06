# Genera dist/climapi-hostgator.zip: solo lo necesario para publicar el sitio (sin docs, README, tools ni .git).
# Uso (desde cualquier carpeta):   powershell -ExecutionPolicy Bypass -File tools\build-zip.ps1
#
# Las rutas dentro del zip llevan "/" (no "\"): Compress-Archive de PowerShell 5 usa "\" y cPanel
# extrae esos zips con nombres rotos, por eso se arma con System.IO.Compression.
param([string]$Out)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $Out) { $Out = Join-Path $root 'dist\climapi-hostgator.zip' }
New-Item -ItemType Directory -Force -Path (Split-Path $Out) | Out-Null
if (Test-Path $Out) { Remove-Item $Out -Force }

# 1) Archivos del sitio
$entries = [ordered]@{}   # nombre dentro del zip -> ruta en disco
foreach ($f in 'index.html', 'manifest.webmanifest', 'assets/img/veleta.png') {
    $entries[$f] = Join-Path $root $f
}
Get-ChildItem (Join-Path $root 'src') -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
    $entries[$rel] = $_.FullName
}
$entries['.htaccess'] = Join-Path $root 'deploy\hostgator.htaccess'

# 2) Comprobar que todo lo que enlaza index.html esta incluido
$html = Get-Content (Join-Path $root 'index.html') -Raw -Encoding UTF8
$missing = [regex]::Matches($html, '(?:src|href)="((?!https?:|#|data:)[^"]+)"') |
    ForEach-Object { $_.Groups[1].Value -replace '\?v=\d+$', '' } | Sort-Object -Unique |
    Where-Object { -not $entries.Contains($_) }
if ($missing) { throw "index.html enlaza archivos que no estan en el zip: $($missing -join ', ')" }
foreach ($e in $entries.GetEnumerator()) { if (-not (Test-Path $e.Value)) { throw "No existe: $($e.Value)" } }

# 3) Crear el zip
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($Out, 'Create')
try {
    foreach ($e in $entries.GetEnumerator()) {
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $e.Value, $e.Key, 'Optimal')
    }
} finally { $zip.Dispose() }

$size = [math]::Round((Get-Item $Out).Length / 1KB)
Write-Host ("OK: {0} ({1} KB, {2} archivos)" -f $Out, $size, $entries.Count)
