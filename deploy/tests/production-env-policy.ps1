$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$scriptPath = Join-Path $repositoryRoot "deploy/scripts/create-production-env.sh"
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Production environment script is missing: $scriptPath"
}

$text = Get-Content -Raw -LiteralPath $scriptPath
foreach ($required in @(
  'SOURCE_ENV=/etc/kaifanla/source.env.upload',
  'OUTPUT_ENV=/etc/kaifanla/production.env',
  'test ! -e "$OUTPUT_ENV"',
  'openssl rand -hex 32',
  'chmod 0600 "$temp_env"',
  'tr -d',
  'ADMIN_PASSWORD_HASH',
  'MYSQL_ROOT_PASSWORD',
  'RESTIC_PASSWORD',
  'WECHAT_APP_SECRET',
  'rm -f -- "$SOURCE_ENV"'
)) {
  if (-not $text.Contains($required)) {
    throw "Production environment policy is missing: $required"
  }
}

if ($text -match '(?m)^\s*set\s+-x') { throw "Production environment script must not enable xtrace" }
if ($text -match 'cat\s+.*source\.env') { throw "Production environment script must not print the source env" }

$runtimeProbe = @'
set -euo pipefail
mkdir -p /etc/kaifanla
printf '%s\n' \
  'WECHAT_APP_ID=wx0006792d6129b164' \
  'WECHAT_APP_SECRET=test-wechat-secret' \
  'ADMIN_USERNAME=admin' \
  '$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHQ$YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYQ' \
  'ACME_EMAIL=1725137488@qq.com' \
  > /etc/kaifanla/source.env.upload
sed -i '4s/^/ADMIN_PASSWORD_HASH=/' /etc/kaifanla/source.env.upload
chmod 0600 /etc/kaifanla/source.env.upload
bash /input/create-production-env.sh >/tmp/create-production-env.status
if ! grep -qx 'ACME_EMAIL=configured' /tmp/create-production-env.status; then echo 'ACME_EMAIL status missing'; exit 42; fi
if ! grep -qx 'ACME_EMAIL=1725137488@qq.com' /etc/kaifanla/production.env; then echo 'ACME_EMAIL missing from production.env'; exit 41; fi
test "$(stat -c '%a' /etc/kaifanla/production.env)" = '600'
test ! -e /etc/kaifanla/source.env.upload
grep '^ADMIN_PASSWORD_HASH=' /etc/kaifanla/production.env
'@
$runtimeProbe = $runtimeProbe.Replace("`r`n", "`n").Replace("`r", "`n") + "`n# end"

$dockerOutput = $runtimeProbe | & docker run --rm -i --user 0:0 `
  --entrypoint bash `
  --mount "type=bind,source=$scriptPath,target=/input/create-production-env.sh,readonly" `
  kaifanla-tooling:local 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "Production environment runtime behavior failed: $dockerOutput"
}

$generatedHashLine = @($dockerOutput) |
  Where-Object { $_ -is [string] -and $_.StartsWith('ADMIN_PASSWORD_HASH=', [StringComparison]::Ordinal) } |
  Select-Object -Last 1
if ([string]::IsNullOrWhiteSpace($generatedHashLine)) {
  throw "Production environment runtime probe did not return the generated admin hash line"
}

$composeProbeRoot = Join-Path ([IO.Path]::GetTempPath()) ('kaifanla-env-policy-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $composeProbeRoot | Out-Null
$composeProbeProject = 'kaifanla_env_policy_' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$composeProbePath = Join-Path $composeProbeRoot 'compose.yml'
$composeProbeEnvPath = Join-Path $composeProbeRoot 'probe.env'
$composeProbeErrorPath = Join-Path $composeProbeRoot 'compose.err'
try {
  $composeProbeText = "services:`n  probe:`n    image: kaifanla-tooling:local`n    environment:`n      ADMIN_PASSWORD_HASH: `${ADMIN_PASSWORD_HASH:?required}`n"
  [IO.File]::WriteAllText($composeProbePath, $composeProbeText, [Text.UTF8Encoding]::new($false))
  [IO.File]::WriteAllText($composeProbeEnvPath, $generatedHashLine + [char]10, [Text.UTF8Encoding]::new($false))

  $runtimeHash = & docker compose --project-name $composeProbeProject `
    --env-file $composeProbeEnvPath `
    -f $composeProbePath `
    run --rm --no-deps --pull never --entrypoint printenv probe ADMIN_PASSWORD_HASH `
    2>$composeProbeErrorPath
  if ($LASTEXITCODE -ne 0) {
    throw "Compose admin hash runtime probe failed"
  }

  $expectedHash = '$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHQ$YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYQ'
  if (($runtimeHash -join "`n").Trim() -cne $expectedHash) {
    throw "Compose did not preserve the generated Argon2id hash at container runtime"
  }

  $composeWarnings = [IO.File]::ReadAllText($composeProbeErrorPath)
  if ($composeWarnings -match 'variable is not set') {
    throw "Compose attempted to interpolate the generated Argon2id hash"
  }
}
finally {
  & docker compose --project-name $composeProbeProject -f $composeProbePath down --remove-orphans 2>$null | Out-Null
  $resolvedProbeRoot = [IO.Path]::GetFullPath($composeProbeRoot)
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($resolvedProbeRoot.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and
      [IO.Path]::GetFileName($resolvedProbeRoot).StartsWith('kaifanla-env-policy-', [StringComparison]::Ordinal)) {
    Remove-Item -LiteralPath $resolvedProbeRoot -Recurse -Force
  }
  else {
    throw "Refused to delete unexpected Compose probe directory"
  }
}

Write-Output "Production environment policy passed"
