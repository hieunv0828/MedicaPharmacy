# do_import_vouchers.ps1
# Import So Quy (Vouchers) tu 2 file: chuyen khoan va tien mat
param(
    [string]$projectDir = "F:\MedicaPharmacy"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$importsDir = Join-Path $projectDir "imports"
$outputPath = Join-Path $projectDir "data\vouchers_2026.json"

Write-Host "=========================================================="
Write-Host " IMPORT SO QUY (VOUCHERS) TU KIOTVIET"
Write-Host "=========================================================="

$sources = @(
    @{
        File = "SoQuy_KV19112026-033409-041_chuyen_khoan.xlsx"
        DefaultPayment = "transfer"
    },
    @{
        File = "SoQuy_KV19112026-033457-075_tien_mat.xlsx"
        DefaultPayment = "cash"
    }
)

function Convert-OADate($oaVal) {
    if ([string]::IsNullOrEmpty($oaVal)) { return '' }
    try {
        $dt = [DateTime]::FromOADate([double]$oaVal)
        return $dt.ToString('yyyy-MM-ddTHH:mm:ss+07:00')
    } catch { return '' }
}

function Get-VoucherType($loaiTC, $vId) {
    if ($vId -match '^(CTM|CNH|CTD|PC|PCPN)') { return 'payment' }
    if ($vId -match '^(TTM|TNH|TTD|PT|PTTHN|TTHD|TTHDO)') { return 'receipt' }
    if ($loaiTC -match 'Phiếu thu') { return 'receipt' }
    if ($loaiTC -match 'Phiếu chi' -or $loaiTC -match 'Tiền trả khách') { return 'payment' }
    return 'receipt'
}

function Get-Category($loaiTC) {
    $cat = $loaiTC -replace '^Phiếu thu\s*', '' -replace '^Phiếu chi\s*', ''
    if ([string]::IsNullOrEmpty($cat)) { return 'Khác' }
    return $cat.Trim()
}

$voucherMap = [System.Collections.Generic.Dictionary[string, PSCustomObject]]::new()

foreach ($src in $sources) {
    $filePath = Join-Path $importsDir $src.File
    if (-not (Test-Path $filePath)) {
        Write-Host "Khong tim thay file: $($src.File)"
        continue
    }

    Write-Host "Doc file: $($src.File)..."
    $tmpDir = Join-Path $env:TEMP ("sq_imp_" + (Get-Random))
    $tmpZip = Join-Path $env:TEMP ("sq_zip_" + (Get-Random) + ".zip")
    $stream = [System.IO.File]::Open($filePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $outStream = [System.IO.File]::Create($tmpZip)
    $stream.CopyTo($outStream)
    $stream.Close(); $outStream.Close()
    [System.IO.Compression.ZipFile]::ExtractToDirectory($tmpZip, $tmpDir)
    Remove-Item $tmpZip -Force

    $strings = @()
    $ssFile = Join-Path $tmpDir "xl\sharedStrings.xml"
    if (Test-Path $ssFile) {
        [xml]$ssXml = Get-Content $ssFile -Encoding UTF8
        $strings = @($ssXml.sst.si | ForEach-Object {
            $si = $_
            if ($si.r) { ($si.r | ForEach-Object { $_.t } | Where-Object { $_ -ne $null }) -join '' }
            elseif ($si.t -ne $null) { $t = $si.t; if ($t -is [System.Xml.XmlElement]) { $t.'#text' } else { $t } }
            else { '' }
        })
    }

    $sheetFile = (Get-ChildItem (Join-Path $tmpDir "xl\worksheets") -Filter "*.xml" | Sort-Object Length -Descending)[0].FullName
    [xml]$ws = Get-Content $sheetFile -Encoding UTF8
    $rows = $ws.worksheet.sheetData.row

    function Get-Val($cell) {
        if ($null -eq $cell) { return '' }
        $v = $cell.v
        if ($null -eq $v -or $v -eq '') { return '' }
        if ($cell.t -eq 's' -and $strings -and [int]$v -lt $strings.Count) { return $strings[[int]$v] }
        return $v
    }

    # Map header
    $headerRow = $rows[0]
    $colMap = @{}
    foreach ($c in $headerRow.c) {
        $letter = $c.r -replace '\d+', ''
        $name = (Get-Val $c).Trim()
        $colMap[$name] = $letter
    }

    $colId     = $colMap['Mã phiếu']
    $colTime   = $colMap['Thời gian']
    $colType   = $colMap['Loại thu chi']
    $colPerson = $colMap['Người nộp/nhận']
    $colAmount = $colMap['Giá trị']

    $fileCount = 0
    for ($i = 1; $i -lt $rows.Count; $i++) {
        $r = $rows[$i]
        $cells = @{}
        foreach ($c in $r.c) { $cells[$c.r -replace '\d+', ''] = $c }

        $vId = (Get-Val $cells[$colId]).Trim()
        if ([string]::IsNullOrEmpty($vId)) { continue }

        $timeRaw = Get-Val $cells[$colTime]
        $loaiTC  = (Get-Val $cells[$colType]).Trim()
        $person  = (Get-Val $cells[$colPerson]).Trim()
        $amountStr = Get-Val $cells[$colAmount]

        $amountNum = 0.0
        if (-not [string]::IsNullOrEmpty($amountStr)) {
            try { $amountNum = [Math]::Abs([Math]::Round([double]$amountStr)) } catch {}
        }

        $createdAt = Convert-OADate $timeRaw
        $vtype = Get-VoucherType $loaiTC $vId
        $category = Get-Category $loaiTC
        $payMethod = $src.DefaultPayment

        # RefId matching
        $refId = ''
        if ($vId -match '^TT(HD\w+)') {
            $refId = $matches[1]
        } elseif ($vId -match '^PC(PN\w+)') {
            $refId = $matches[1]
        } elseif ($vId -match '^PT(THN\w+)') {
            $refId = $matches[1]
        } elseif ($vId -match '^TT(TH\d+)') {
            $refId = $matches[1]
        }

        $vObj = [PSCustomObject]@{
            id            = $vId
            type          = $vtype
            amount        = $amountNum
            category      = $category
            reason        = $loaiTC
            person        = $person
            paymentMethod = $payMethod
            refId         = $refId
            createdAt     = $createdAt
            isCancelled   = $false
        }

        $voucherMap[$vId] = $vObj
        $fileCount++
    }

    Write-Host "  -> Doc duoc $fileCount phieu."
    Remove-Item $tmpDir -Recurse -Force
}

Write-Host "Tong so phieu unique: $($voucherMap.Count)"
$sortedVouchers = @($voucherMap.Values | Sort-Object { [DateTime]$_.createdAt } -Descending)

$jsonOut = $sortedVouchers | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($outputPath, $jsonOut, [System.Text.Encoding]::UTF8)

$sizeMB = [Math]::Round(([System.IO.FileInfo]$outputPath).Length / 1MB, 2)
Write-Host "Ghi file thanh cong: $outputPath ($sizeMB MB)"
Write-Host "=========================================================="
