$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
. (Join-Path $scriptDir "server-common.ps1")
$port = 8090
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)

function Get-ContentType($filePath) {
  switch ([IO.Path]::GetExtension($filePath).ToLowerInvariant()) {
    ".html" { return "text/html; charset=utf-8" }
    ".css" { return "text/css; charset=utf-8" }
    ".js" { return "text/javascript; charset=utf-8" }
    ".json" { return "application/json; charset=utf-8" }
    ".png" { return "image/png" }
    ".jpg" { return "image/jpeg" }
    ".jpeg" { return "image/jpeg" }
    ".svg" { return "image/svg+xml" }
    ".ico" { return "image/x-icon" }
    default { return "application/octet-stream" }
  }
}

function Get-RuntimeConfigBody {
  $envPath = Join-Path $root ".env"
  $config = [ordered]@{
    googleMapsApiKey = ""
    geocoding = ""
  }

  if (Test-Path $envPath -PathType Leaf) {
    foreach ($line in Get-Content -LiteralPath $envPath) {
      $trimmed = $line.Trim()
      if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
        continue
      }

      $parts = $trimmed.Split("=", 2)
      $name = $parts[0].Trim()
      $value = $parts[1].Trim().Trim('"').Trim("'")
      if ($name -in @("GOOGLE_MAPS_API_KEY", "GOOGLE_API_KEY", "GOOGLE_PLACES_API_KEY")) {
        $config.googleMapsApiKey = $value
      }
      if ($name -in @("geocoding", "GEOCODING_API_KEY")) {
        $config.geocoding = $value
      }
    }
  }

  return [Text.Encoding]::UTF8.GetBytes(($config | ConvertTo-Json -Compress))
}

function Send-Response($stream, $statusCode, $statusText, $contentType, [byte[]]$body) {
  $header = "HTTP/1.1 $statusCode $statusText`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
  $headerBytes = [Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($body.Length -gt 0) {
    $stream.Write($body, 0, $body.Length)
  }
  $stream.Flush()
}

$listener.Start()
Write-Host "Smart Parking website running at http://127.0.0.1:$port"

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()

    try {
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [Text.Encoding]::ASCII, $false, 4096, $true)
      $requestLine = $reader.ReadLine()

      if ([string]::IsNullOrWhiteSpace($requestLine)) {
        Send-Response $stream 400 "Bad Request" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Bad Request"))
        continue
      }

      $parts = $requestLine.Split(" ")
      $method = $parts[0]
      $rawPath = if ($parts.Length -gt 1) { $parts[1] } else { "/" }

      while ($true) {
        $line = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) { break }
      }

      if ($method -ne "GET") {
        Send-Response $stream 405 "Method Not Allowed" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Method Not Allowed"))
        continue
      }

      $relative = Get-SafeRelativePath $rawPath

      if ($relative -eq "runtime-config.json") {
        Send-Response $stream 200 "OK" "application/json; charset=utf-8" (Get-RuntimeConfigBody)
        continue
      }

      if (Test-HiddenRelativePath $relative) {
        Send-Response $stream 404 "Not Found" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Not found"))
        continue
      }

      $filePath = Resolve-StaticFilePath $root $relative

      if ($filePath -and (Test-Path $filePath -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($filePath)
        Send-Response $stream 200 "OK" (Get-ContentType $filePath) $bytes
      } else {
        Send-Response $stream 404 "Not Found" "text/plain; charset=utf-8" ([Text.Encoding]::UTF8.GetBytes("Not found"))
      }
    } catch {
      try {
        $message = [Text.Encoding]::UTF8.GetBytes("Internal Server Error")
        Send-Response $stream 500 "Internal Server Error" "text/plain; charset=utf-8" $message
      } catch {
      }
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
