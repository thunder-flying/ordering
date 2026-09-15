$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$bootstrapTemplate = Join-Path $repositoryRoot "deploy/nginx/templates/bootstrap.conf.template"
$tlsTemplate = Join-Path $repositoryRoot "deploy/nginx/templates/default.conf.template"
$securitySnippet = Join-Path $repositoryRoot "deploy/nginx/snippets/security-headers.conf"
$nginxImage = "nginx:stable@sha256:1e0bd91de37893cc71edf5eb3e56c918efae309a81db0afe4b9698809676d071"
$domain = "api.guziyi.cn"

foreach ($requiredFile in @($bootstrapTemplate, $tlsTemplate, $securitySnippet)) {
  if (-not (Test-Path -LiteralPath $requiredFile)) {
    throw "Required Nginx policy file is missing: $requiredFile"
  }
}

function Assert-PolicyMatch {
  param(
    [Parameter(Mandatory)] [string] $Text,
    [Parameter(Mandatory)] [string] $Pattern,
    [Parameter(Mandatory)] [string] $Message
  )

  if ($Text -notmatch $Pattern) {
    throw $Message
  }
}

function Invoke-DockerChecked {
  param(
    [Parameter(Mandatory)] [string[]] $Arguments,
    [Parameter(Mandatory)] [string] $FailureMessage
  )

  $output = & docker @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "${FailureMessage}:`n$($output -join [Environment]::NewLine)"
  }
  return $output -join [Environment]::NewLine
}

$bootstrapText = (Get-Content -Raw -LiteralPath $bootstrapTemplate).Replace('${APP_DOMAIN}', $domain)
$tlsText = (Get-Content -Raw -LiteralPath $tlsTemplate).Replace('${APP_DOMAIN}', $domain)
$securityText = Get-Content -Raw -LiteralPath $securitySnippet

Assert-PolicyMatch $bootstrapText 'location\s+\^~\s+/\.well-known/acme-challenge/' "Bootstrap must expose only the ACME challenge path"
Assert-PolicyMatch $bootstrapText 'location\s+/\s*\{\s*return\s+503;' "Bootstrap must reject application traffic with 503"
if ($bootstrapText -match 'proxy_pass') { throw "Bootstrap must not proxy unencrypted application traffic" }

foreach ($requiredPattern in @(
  'server_tokens\s+off;',
  'limit_req_zone\s+\$binary_remote_addr\s+zone=api_per_ip:10m\s+rate=10r/s;',
  'limit_req_zone\s+\$binary_remote_addr\s+zone=login_per_ip:10m\s+rate=5r/m;',
  'limit_req_zone\s+\$binary_remote_addr\s+zone=wechat_auth_per_ip:10m\s+rate=10r/m;',
  'ssl_protocols\s+TLSv1\.2\s+TLSv1\.3;',
  'return\s+301\s+https://\$host\$request_uri;',
  'client_max_body_size\s+512k;',
  'proxy_set_header\s+X-Forwarded-Proto\s+https;',
  'proxy_set_header\s+X-Request-ID\s+\$request_id;'
)) {
  Assert-PolicyMatch $tlsText $requiredPattern "TLS Nginx policy is missing: $requiredPattern"
}

Assert-PolicyMatch $tlsText '(?s)location\s+=\s+/api/v1/profile/avatar\s*\{.*?client_max_body_size\s+3m;' "Avatar upload limit must be 3 MiB"
Assert-PolicyMatch $tlsText '(?s)location\s+=\s+/api/v1/admin/uploads/dish-image\s*\{.*?client_max_body_size\s+6m;' "Dish upload limit must be 6 MiB"
Assert-PolicyMatch $tlsText '(?s)location\s+\^~\s+/admin.*?Cache-Control\s+"no-store"' "Admin pages must be no-store"
Assert-PolicyMatch $tlsText '(?s)location\s+\^~\s+/media/avatars/.*?Cache-Control\s+"private, no-store"' "Avatar media must be private and no-store"
Assert-PolicyMatch $tlsText '(?s)location\s+~\s+"?\^/media/dishes/\[a-f0-9\]\{64\}.*?immutable' "Only SHA-256 dish media URLs may be immutable"
Assert-PolicyMatch $tlsText '(?s)location\s+/media/dishes/.*?Cache-Control\s+"no-store"' "Non-hash dish media URLs must be no-store"

foreach ($requiredHeader in @(
  'X-Content-Type-Options "nosniff" always;',
  'Referrer-Policy "strict-origin-when-cross-origin" always;',
  'Content-Security-Policy',
  'frame-ancestors ''none'''
)) {
  if (-not $securityText.Contains($requiredHeader)) {
    throw "Security header snippet is missing: $requiredHeader"
  }
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("kaifanla-nginx-policy-" + [Guid]::NewGuid().ToString("N"))
$renderedRoot = Join-Path $tempRoot "rendered"
$certLive = Join-Path $tempRoot "letsencrypt/live/$domain"
$networkName = "kaifanla_nginx_policy_" + [Guid]::NewGuid().ToString("N")
$backendName = "kaifanla-nginx-policy-backend-" + [Guid]::NewGuid().ToString("N")
$backendStarted = $false
$networkCreated = $false

try {
  New-Item -ItemType Directory -Path $renderedRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $certLive -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $renderedRoot "bootstrap.conf") -Value $bootstrapText -Encoding utf8 -NoNewline
  Set-Content -LiteralPath (Join-Path $renderedRoot "default.conf") -Value $tlsText -Encoding utf8 -NoNewline

  Invoke-DockerChecked -Arguments @(
    "run", "--rm", "--entrypoint", "openssl",
    "--mount", "type=bind,source=$certLive,target=/certs",
    $nginxImage,
    "req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1",
    "-subj", "/CN=$domain", "-keyout", "/certs/privkey.pem", "-out", "/certs/fullchain.pem"
  ) -FailureMessage "Failed to generate an ephemeral Nginx policy certificate" | Out-Null

  Invoke-DockerChecked -Arguments @("network", "create", $networkName) -FailureMessage "Failed to create the Nginx policy network" | Out-Null
  $networkCreated = $true

  Invoke-DockerChecked -Arguments @(
    "run", "-d", "--name", $backendName,
    "--network", $networkName, "--network-alias", "server",
    $nginxImage
  ) -FailureMessage "Failed to start the disposable Nginx policy backend" | Out-Null
  $backendStarted = $true

  $bootstrapOutput = Invoke-DockerChecked -Arguments @(
    "run", "--rm", "--network", $networkName, "--entrypoint", "nginx",
    "--mount", "type=bind,source=$(Join-Path $renderedRoot 'bootstrap.conf'),target=/etc/nginx/conf.d/default.conf,readonly",
    $nginxImage, "-t"
  ) -FailureMessage "Bootstrap nginx -t failed"

  $tlsOutput = Invoke-DockerChecked -Arguments @(
    "run", "--rm", "--network", $networkName, "--entrypoint", "nginx",
    "--mount", "type=bind,source=$(Join-Path $renderedRoot 'default.conf'),target=/etc/nginx/conf.d/default.conf,readonly",
    "--mount", "type=bind,source=$(Split-Path -Parent $securitySnippet),target=/etc/nginx/snippets,readonly",
    "--mount", "type=bind,source=$(Join-Path $tempRoot 'letsencrypt'),target=/etc/letsencrypt,readonly",
    $nginxImage, "-t"
  ) -FailureMessage "TLS nginx -t failed"

  if (($bootstrapOutput + $tlsOutput) -match '(?i)\[warn\]|warning') {
    throw "nginx -t must not emit warnings:`n$bootstrapOutput`n$tlsOutput"
  }

  Write-Output "Nginx policy passed"
} finally {
  if ($backendStarted) {
    & docker rm -f $backendName 2>&1 | Out-Null
  }
  if ($networkCreated) {
    & docker network rm $networkName 2>&1 | Out-Null
  }
  if (Test-Path -LiteralPath $tempRoot) {
    $resolvedTemp = (Resolve-Path -LiteralPath $tempRoot).Path
    $systemTemp = ([IO.Path]::GetFullPath([IO.Path]::GetTempPath())).TrimEnd([IO.Path]::DirectorySeparatorChar)
    if (-not $resolvedTemp.StartsWith($systemTemp + [IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to clean Nginx policy files outside the system temp directory: $resolvedTemp"
    }
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
  }
}
