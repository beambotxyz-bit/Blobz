param(
  [switch]$SkipInstall,
  [switch]$SkipMigrate
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

$EnvFile = Join-Path $Root "servers/api/.env"
if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    $Line = $_.Trim()
    if (-not $Line -or $Line.StartsWith("#") -or -not $Line.Contains("=")) { return }
    $Key, $Value = $Line.Split("=", 2)
    if (-not [Environment]::GetEnvironmentVariable($Key)) {
      [Environment]::SetEnvironmentVariable($Key, $Value.Trim("'`""), "Process")
    }
  }
}

if (-not $SkipInstall) {
  npm install
  npm --prefix servers/api install --omit=dev
}

npm run api:check

if (-not $SkipMigrate) {
  npm run api:migrate
}

npx pm2 start ecosystem.config.cjs --env production
npx pm2 save
