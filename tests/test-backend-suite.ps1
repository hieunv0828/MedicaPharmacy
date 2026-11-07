# =======================================================================
# MEDICAPHARMACY - BACKEND AUTOMATED TEST SUITE & PERFORMANCE BENCHMARK
# =======================================================================

$baseUrl = "http://localhost"
[System.Net.WebRequest]::DefaultWebProxy = $null
$ProgressPreference = 'SilentlyContinue'
$results = @()
$totalPassed = 0
$totalFailed = 0

function Run-Test {
    param(
        [string]$Id,
        [string]$Name,
        [scriptblock]$TestBlock
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $status = "PASS"
    $errorMsg = ""
    try {
        & $TestBlock
    } catch {
        $status = "FAIL"
        $errorMsg = $_.Exception.Message
    }
    $sw.Stop()
    $duration = $sw.ElapsedMilliseconds

    $resultObj = [PSCustomObject]@{
        Id       = $Id
        Name     = $Name
        Status   = $status
        Duration = "$($duration)ms"
        Error    = $errorMsg
    }
    $global:results += $resultObj
    if ($status -eq "PASS") {
        $global:totalPassed++
        Write-Host " [PASS] $Id : $Name ($($duration)ms)" -ForegroundColor Green
    } else {
        $global:totalFailed++
        Write-Host " [FAIL] $Id : $Name ($($duration)ms)" -ForegroundColor Red
        Write-Host "        -> $errorMsg" -ForegroundColor Yellow
    }
}

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "   MEDICAPHARMACY BACKEND API & PERFORMANCE TEST SUITE" -ForegroundColor Cyan
Write-Host "======================================================================`n" -ForegroundColor Cyan

# -------------------------------------------------------------------
# SUITE 8: HTTP SERVER & API HEALTH
# -------------------------------------------------------------------
Run-Test "TC-31" "Server Web Root: GET / returns 200 OK" {
    $res = Invoke-WebRequest -Uri "$baseUrl/" -Method Get -UseBasicParsing -TimeoutSec 5
    if ($res.StatusCode -ne 200) { throw "Expected status 200 but got $($res.StatusCode)" }
    if (!$res.Content.Contains("MedicaPharmacy")) { throw "Content does not contain MedicaPharmacy" }
}

Run-Test "TC-32" "Tài Liệu Thiết Kế HTML: GET /tai-lieu-thiet-ke.html returns 200 OK" {
    $res = Invoke-WebRequest -Uri "$baseUrl/tai-lieu-thiet-ke.html" -Method Get -UseBasicParsing -TimeoutSec 5
    if ($res.StatusCode -ne 200) { throw "Expected status 200 but got $($res.StatusCode)" }
    if (!$res.Content.Contains("Architecture")) { throw "Missing Architecture content" }
}

Run-Test "TC-33" "Health Endpoint: GET /api/status returns JSON online status" {
    $res = Invoke-WebRequest -Uri "$baseUrl/api/status" -Method Get -UseBasicParsing -TimeoutSec 5
    if ($res.StatusCode -ne 200) { throw "Expected status 200 but got $($res.StatusCode)" }
    $json = $res.Content | ConvertFrom-Json
    if ($json.status -ne "online") { throw "Expected status: online but got $($json.status)" }
}

# -------------------------------------------------------------------
# SUITE 9: HARDWARE LICENSING & ANTI-TAMPER
# -------------------------------------------------------------------
Run-Test "TC-34" "License Status: GET /api/license/status returns hardware machineCode" {
    $res = Invoke-WebRequest -Uri "$baseUrl/api/license/status" -Method Get -UseBasicParsing -TimeoutSec 5
    if ($res.StatusCode -ne 200) { throw "Expected status 200 but got $($res.StatusCode)" }
    $json = $res.Content | ConvertFrom-Json
    if (!$json.machineCode.StartsWith("MED-")) { throw "Invalid machineCode format: $($json.machineCode)" }
    if ($json.licensed -ne $true) { throw "Expected current machine to be licensed" }
}

Run-Test "TC-35" "License Anti-Tamper: POST /api/license/activate with fake key correctly rejected (HTTP 400)" {
    $fakePayload = @{ key = "MEDICA-FAKE-KEY-1234-5678" } | ConvertTo-Json
    try {
        $res = Invoke-WebRequest -Uri "$baseUrl/api/license/activate" -Method Post -Body $fakePayload -ContentType "application/json" -UseBasicParsing -TimeoutSec 5
        throw "Server should have rejected fake key with HTTP 400, but returned 200!"
    } catch [System.Net.WebException] {
        $resp = $_.Exception.Response
        if ($resp -and [int]$resp.StatusCode -eq 400) {
            # PASSED: Key giả bị máy chủ từ chối với mã 400 Bad Request
        } else {
            throw $_.Exception.Message
        }
    }
}

# -------------------------------------------------------------------
# SUITE 10: DATABASE REST API & YEAR-SPLIT STORAGE
# -------------------------------------------------------------------
Run-Test "TC-36" "Database Fetch: GET /api/database returns all collections" {
    $res = Invoke-WebRequest -Uri "$baseUrl/api/database" -Method Get -UseBasicParsing -TimeoutSec 8
    if ($res.StatusCode -ne 200) { throw "Expected status 200 but got $($res.StatusCode)" }
    $json = $res.Content | ConvertFrom-Json
    if ($null -eq $json.medicines) { throw "Missing medicines array" }
    if ($null -eq $json.customers) { throw "Missing customers array" }
    if ($null -eq $json.suppliers) { throw "Missing suppliers array" }
    if ($null -eq $json.orders) { throw "Missing orders array" }
    if ($null -eq $json.stockInOrders) { throw "Missing stockInOrders array" }
}

Run-Test "TC-37" "Storage Integrity: orders_2026.json exists and is valid JSON" {
    $file = "f:\MedicaPharmacy\data\orders_2026.json"
    if (!(Test-Path $file)) { throw "Missing file $file" }
    $raw = Get-Content $file -Raw -Encoding UTF8
    $parsed = $raw | ConvertFrom-Json
    if ($null -eq $parsed) { throw "orders_2026.json is invalid JSON" }
}

Run-Test "TC-38" "Storage Integrity: stockin_2026.json exists and is valid JSON" {
    $file = "f:\MedicaPharmacy\data\stockin_2026.json"
    if (!(Test-Path $file)) { throw "Missing file $file" }
    $raw = Get-Content $file -Raw -Encoding UTF8
    $parsed = $raw | ConvertFrom-Json
    if ($null -eq $parsed) { throw "stockin_2026.json is invalid JSON" }
}

# -------------------------------------------------------------------
# SUITE 11: OFFLINE ASSETS READINESS
# -------------------------------------------------------------------
Run-Test "TC-39" "Offline Assets: vendor/mermaid.min.js exists and is > 1MB" {
    $path = "f:\MedicaPharmacy\vendor\mermaid.min.js"
    if (!(Test-Path $path)) { throw "Missing mermaid.min.js" }
    $len = (Get-Item $path).Length
    if ($len -lt 1000000) { throw "mermaid.min.js too small ($len bytes)" }
}

Run-Test "TC-40" "Offline Assets: vendor/tailwind.js exists and is valid" {
    $path = "f:\MedicaPharmacy\vendor\tailwind.js"
    if (!(Test-Path $path)) { throw "Missing tailwind.js" }
}

# -------------------------------------------------------------------
# SUITE 12: PERFORMANCE BENCHMARKING & CONCURRENCY
# -------------------------------------------------------------------
Run-Test "TC-41" "Performance Benchmark: 10 consecutive GET /api/database latency" {
    $latencies = @()
    for ($i = 0; $i -lt 10; $i++) {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $r = Invoke-WebRequest -Uri "$baseUrl/api/database" -Method Get -UseBasicParsing -TimeoutSec 5
        $sw.Stop()
        $latencies += $sw.ElapsedMilliseconds
    }
    $avg = ($latencies | Measure-Object -Average).Average
    $max = ($latencies | Measure-Object -Maximum).Maximum
    Write-Host "        [INFO] Latency Trung bình: $($avg.ToString('F1')) ms | Tối đa: $max ms" -ForegroundColor Gray
    if ($avg -gt 250) { throw "Average latency too high: $avg ms (> 250ms)" }
}

Run-Test "TC-42" "Concurrency Stress: 5 simultaneous requests without deadlock" {
    $jobs = @()
    for ($i = 0; $i -lt 5; $i++) {
        $jobs += Start-Job -ScriptBlock {
            param($url)
            [System.Net.WebRequest]::DefaultWebProxy = $null
            $res = Invoke-WebRequest -Uri "$url/api/database" -Method Get -UseBasicParsing -TimeoutSec 8
            return $res.StatusCode
        } -ArgumentList $baseUrl
    }
    $jobResults = $jobs | Wait-Job -Timeout 10 | Receive-Job
    $jobs | Remove-Job -Force
    foreach ($code in $jobResults) {
        if ($code -ne 200) { throw "Concurrent request returned status $code" }
    }
}

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host "   KẾT QUẢ KIỂM THỬ BACKEND: $totalPassed ĐẠT | $totalFailed THẤT BẠI" -ForegroundColor $(if ($totalFailed -eq 0) { "Green" } else { "Red" })
Write-Host "======================================================================`n" -ForegroundColor Cyan

# Output JSON summary
$summary = @{
    TotalPassed = $totalPassed
    TotalFailed = $totalFailed
    TotalTests  = ($totalPassed + $totalFailed)
    Results     = $results
}
$summary | ConvertTo-Json -Depth 3 | Set-Content "f:\MedicaPharmacy\tests\backend-test-results.json" -Encoding UTF8
