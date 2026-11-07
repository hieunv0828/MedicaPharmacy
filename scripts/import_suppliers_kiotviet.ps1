# Import Nha Cung Cap from KiotViet XLSX
# Columns: Mã NCC | Tên NCC | Email | Điện thoại | Địa chỉ | Khu vực | Phường/Xã | Tổng mua | Nợ cần trả | Mã số thuế | Số CMND | Ghi chú | Nhóm NCC | Trạng thái | Tổng mua trừ trả | Công ty | Người tạo | Ngày tạo

$xlsxPath = "C:\Users\qoffe\.gemini\antigravity\brain\d37817d0-d77b-4e5e-85fe-68b9f7c78692\.user_uploaded\media_1794073867226_f94956d0.xlsx"
$outputPath = "f:\MedicaPharmacy\data\suppliers.json"

Write-Host "=== Import Nha Cung Cap from KiotViet ==="

# Extract XLSX
$tmpDir = "$env:TEMP\ncc_import_$(Get-Random)"
New-Item -ItemType Directory -Path $tmpDir | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($xlsxPath, $tmpDir)

# Load shared strings
[xml]$ss = Get-Content "$tmpDir\xl\sharedStrings.xml" -Encoding UTF8
$strings = @($ss.sst.si | ForEach-Object {
    $si = $_
    if ($si.r) {
        # rich text - concatenate all 't' values
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
        return $dt.ToString('yyyy-MM-ddTHH:mm:ss+07:00')
    } catch { return '' }
}

$suppliers = New-Object System.Collections.Generic.List[object]
$skipFirst = $true

foreach ($row in $rows) {
    if ($skipFirst) { $skipFirst = $false; continue }

    $cells = @{}
    foreach ($c in $row.c) {
        # Extract column letter from cell reference (e.g., A2 -> A, AB2 -> AB)
        $colRef = $c.r -replace '\d+', ''
        $cells[$colRef] = $c
    }

    $id      = Get-CellValue $cells['A'] $strings
    $name    = Get-CellValue $cells['B'] $strings
    $email   = Get-CellValue $cells['C'] $strings
    $phone   = Get-CellValue $cells['D'] $strings
    $addr    = Get-CellValue $cells['E'] $strings
    $area    = Get-CellValue $cells['F'] $strings
    $ward    = Get-CellValue $cells['G'] $strings
    $totalBuy= Get-CellValue $cells['H'] $strings
    $debt    = Get-CellValue $cells['I'] $strings
    $taxCode = Get-CellValue $cells['J'] $strings
    $note    = Get-CellValue $cells['L'] $strings
    $status  = Get-CellValue $cells['N'] $strings
    $company = Get-CellValue $cells['P'] $strings
    $createdRaw = Get-CellValue $cells['R'] $strings

    if ([string]::IsNullOrEmpty($id)) { continue }

    # Build full address
    $fullAddr = @($addr, $ward, $area) | Where-Object { -not [string]::IsNullOrEmpty($_) }
    $fullAddr = $fullAddr -join ', '

    # Parse numbers
    $debtNum = 0.0
    if (-not [string]::IsNullOrEmpty($debt)) { try { $debtNum = [double]$debt } catch {} }
    $totalBuyNum = 0.0
    if (-not [string]::IsNullOrEmpty($totalBuy)) { try { $totalBuyNum = [double]$totalBuy } catch {} }

    # Status: 1 = active
    $isActive = ($status -eq '1' -or $status -eq 'Đang hoạt động')

    $createdAt = Convert-OADate $createdRaw

    $supplier = [ordered]@{
        id        = $id
        name      = $name
        email     = $email
        phone     = $phone
        address   = $fullAddr
        taxCode   = $taxCode
        debt      = [Math]::Round($debtNum)
        totalBuy  = [Math]::Round($totalBuyNum)
        company   = $company
        note      = $note
        isActive  = $isActive
        createdAt = $createdAt
    }
    $suppliers.Add($supplier)
}

Write-Host "Parsed $($suppliers.Count) suppliers"

# Serialize to JSON
$jsonLines = $suppliers | ForEach-Object {
    $s = $_
    $id       = $s.id       -replace '"', '\"'
    $name     = $s.name     -replace '"', '\"'
    $email    = $s.email    -replace '"', '\"'
    $phone    = $s.phone    -replace '"', '\"'
    $addr     = $s.address  -replace '"', '\"'
    $tax      = $s.taxCode  -replace '"', '\"'
    $company  = $s.company  -replace '"', '\"'
    $note     = $s.note     -replace '"', '\"'
    $created  = $s.createdAt
    $active   = if ($s.isActive) { 'true' } else { 'false' }
    $debt     = $s.debt
    $totalBuy = $s.totalBuy

    "  {`"id`":`"$id`",`"name`":`"$name`",`"email`":`"$email`",`"phone`":`"$phone`",`"address`":`"$addr`",`"taxCode`":`"$tax`",`"debt`":$debt,`"totalBuy`":$totalBuy,`"company`":`"$company`",`"note`":`"$note`",`"isActive`":$active,`"createdAt`":`"$created`"}"
}

$json = "[$($jsonLines -join ',\n')]"

[System.IO.File]::WriteAllText($outputPath, "[$($jsonLines -join ",`n")]", [System.Text.Encoding]::UTF8)

Write-Host "Written to: $outputPath"
Write-Host "=== DONE: $($suppliers.Count) nha cung cap imported ==="

# Cleanup
Remove-Item $tmpDir -Recurse -Force
