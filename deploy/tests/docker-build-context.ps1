$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$ignoreFile = Join-Path $repositoryRoot "apps/server/Dockerfile.dockerignore"

if (-not (Test-Path -LiteralPath $ignoreFile)) {
  throw "Dockerfile-specific ignore file is missing: $ignoreFile"
}

$patterns = Get-Content -LiteralPath $ignoreFile
foreach ($requiredPattern in @(".git", ".pnpm-store", "node_modules", "**/node_modules", "**/.next", "**/.env.*")) {
  if ($requiredPattern -notin $patterns) {
    throw "Docker build context ignore rule is missing: $requiredPattern"
  }
}

Write-Output "Docker build context policy passed"
