$ErrorActionPreference = "Stop"

$image = "kaifanla-tooling:local"
$output = & docker run --rm --entrypoint sh $image -lc "openssl version && pnpm --filter @ordering/server exec prisma --version" 2>&1
$exitCode = $LASTEXITCODE
$text = $output -join [Environment]::NewLine

if ($exitCode -ne 0) {
  throw "Tooling OpenSSL/Prisma check failed with exit code ${exitCode}:`n$text"
}
if ($text -match "failed to detect the libssl/openssl version") {
  throw "Prisma must detect the tooling image OpenSSL version:`n$text"
}
if ($text -notmatch "OpenSSL 3\.") {
  throw "Tooling image must provide OpenSSL 3:`n$text"
}
if ($text -notmatch "schema-engine-debian-openssl-3\.0\.x") {
  throw "Prisma must select its Debian OpenSSL 3 schema engine:`n$text"
}

Write-Output "Tooling OpenSSL policy passed"
