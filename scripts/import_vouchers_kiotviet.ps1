# Import So Quy (Vouchers) from KiotViet XLSX
# Columns: Mã phiếu | Thời gian | Loại thu chi | Người nộp/nhận | Giá trị

$xlsxPath = "C:\Users\qoffe\.gemini\antigravity\brain\d37817d0-d77b-4e5e-85fe-68b9f7c78692\.user_uploaded\media_1794073867230_ef986da1.xlsx"
$outputPath = "f:\MedicaPharmacy\data\vouchers_2026.json"

Write-Host "=== Import So Quy from KiotViet ==="

# Extract XLSX
$tmpDir = "$env:TEMP\sq_import_$(Get-Random)"
New-Item -ItemType Directory -Path $tmpDir | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($xlsxPath, $tmpDir)

# Load shared strings
[xml]$ss = Get-Content "$tmpDir\xl\sharedStrings.xml" -Encoding UTF8
$strings = @($ss.sst.si | ForEach-Object {
    $si = $_
    if ($si.r) {
        ($si.r | ForEach-Object { $_.t } | Where-Object { $_ -ne $null }) -join ''
    } elseif ($si.t -ne $null) {
        $t = $si.t
        if ($t -is [System.Xml.XmlElement]) { $t.'#text' } else { $t }
    } else { '' }
})

# Load worksheet
$sheetFile = "$tmpDir\xl\worksheets\sheet2.xml"
[xml]$ws = Get-Content $sheetFile -Encoding UTF8
$rows = $ws.worksheet.sheetData.row

Write-Host "Total rows (incl header): $($rows.Count)"

function Get-CellValue($cell, $stringsArr) {
    if ($null -eq $cell) { return '' }
    $v = $cell.v
    if ($null -eq $v -or $v -eq '') { return '' }
    if ($cell.t -eq 's') { return $stringsArr[[int]$v] }
    return $v
}

function Convert-OADate($oaVal) {
    if ([string]::IsNullOrEmpty($oaVal)) { return '' }
    try {
        $dt = [DateTime]::FromOADate([double]$oaVal)
        $dtVN = $dt.AddHours(7)
        return $dtVN.ToString('yyyy-MM-ddTHH:mm:ss+07:00')
    } catch { return '' }
}

function Escape-Json($s) {
    if ($null -eq $s) { return '' }
    $s -replace '\\', '\\' -replace '"', '\"' -replace "`r", '' -replace "`n", '\n'
}

# Categorize voucher type from KiotViet "Loại thu chi" text
function Get-VoucherType($loaiThuChi) {
    if ($loaiThuChi -match 'Phiếu thu') { return 'receipt' }
    if ($loaiThuChi -match 'Phiếu chi') { return 'payment' }
    return 'receipt'
}

function Get-Category($loaiThuChi) {
    # Extract category after "Phiếu thu " or "Phiếu chi "
    $cat = $loaiThuChi -replace '^Phiếu thu ', '' -replace '^Phiếu chi ', ''
    if ([string]::IsNullOrEmpty($cat)) { return 'Khác' }
    return $cat
}

$vouchers = New-Object System.Collections.Generic.List[string]
$skipFirst = $true
$idx = 0

foreach ($row in $rows) {
    if ($skipFirst) { $skipFirst = $false; continue }

    $cells = @{}
    foreach ($c in $row.c) {
        $colRef = $c.r -replace '\d+', ''
        $cells[$colRef] = $c
    }

    $vId      = Get-CellValue $cells['A'] $strings
    $timeRaw  = Get-CellValue $cells['B'] $strings
    $loaiTC   = Get-CellValue $cells['C'] $strings
    $person   = Get-CellValue $cells['D'] $strings
    $amount   = Get-CellValue $cells['E'] $strings

    if ([string]::IsNullOrEmpty($vId)) { continue }

    $createdAt = Convert-OADate $timeRaw
    $vtype     = Get-VoucherType $loaiTC
    $category  = Get-Category $loaiTC
    $amountNum = 0
    if (-not [string]::IsNullOrEmpty($amount)) {
        try { $amountNum = [Math]::Round([double]$amount) } catch {}
    }

    # Determine paymentMethod based on voucher ID prefix
    # TTHD = Thu hoa don (cash by default), PTTHN = Phieu thu NCC, PCHI = Phieu chi
    $paymentMethod = 'cash'
    if ($vId -match '^CK' -or $vId -match 'CK$') { $paymentMethod = 'transfer' }

    $refId = ''
    if ($vId -match '^TT(HD\w+)') { $refId = $matches[1] }
    elseif ($vId -match '^PC(PN\w+)') { $refId = $matches[1] }
    elseif ($vId -match '^PT(THN\w+)') { $refId = $matches[1] }

    $vId_e     = Escape-Json $vId
    $cat_e     = Escape-Json $category
    $person_e  = Escape-Json $person
    $loaiTC_e  = Escape-Json $loaiTC
    $refId_e   = Escape-Json $refId

    $vouchers.Add("  {`"id`":`"$vId_e`",`"type`":`"$vtype`",`"amount`":$amountNum,`"category`":`"$cat_e`",`"reason`":`"$loaiTC_e`",`"person`":`"$person_e`",`"paymentMethod`":`"$paymentMethod`",`"refId`":`"$refId_e`",`"createdAt`":`"$createdAt`"}")
    $idx++
    if ($idx % 2000 -eq 0) { Write-Host "  Processed $idx vouchers..." }
}

Write-Host "Parsed $($vouchers.Count) vouchers"

$content = "[$($vouchers -join ",`n")]"
[System.IO.File]::WriteAllText($outputPath, $content, [System.Text.Encoding]::UTF8)

Write-Host "Written to: $outputPath ($(([System.IO.FileInfo]$outputPath).Length / 1MB -as [int]) MB)"
Write-Host "=== DONE: $($vouchers.Count) vouchers imported ==="

Remove-Item $tmpDir -Recurse -Force
