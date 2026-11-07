# scripts/import_customers_kiotviet.ps1
# Script phân tích và import danh mục 2.651 khách hàng từ file KiotViet vào MedicaPharmacy

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "Stop"

$xlsxPath = "C:\Users\qoffe\.gemini\antigravity\brain\d37817d0-d77b-4e5e-85fe-68b9f7c78692\.user_uploaded\media_1794071889382_93ea95e4.xlsx"
$outputJsonPath = "f:\MedicaPharmacy\data\customers.json"

Write-Host "=========================================================="
Write-Host " BẮT ĐẦU IMPORT KHÁCH HÀNG TỪ KIOTVIET VÀO MEDICAPHARMACY"
Write-Host "=========================================================="
Write-Host "File Excel nguồn: $xlsxPath"

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($xlsxPath)

# 1. Đọc sharedStrings.xml
Write-Host "1. Đang nạp bảng chuỗi ký tự (sharedStrings.xml)..."
$ssEntry = $zip.GetEntry('xl/sharedStrings.xml')
$sst = [System.Xml.XmlDocument]::new()
$sst.Load($ssEntry.Open())

$strings = [System.Collections.Generic.List[string]]::new()
foreach ($si in $sst.GetElementsByTagName('si')) {
    $tNode = $si['t']
    if ($tNode) {
        $strings.Add($tNode.InnerText)
    } else {
        $sb = [System.Text.StringBuilder]::new()
        foreach ($r in $si.GetElementsByTagName('r')) {
            if ($r['t']) { [void]$sb.Append($r['t'].InnerText) }
        }
        $strings.Add($sb.ToString())
    }
}
Write-Host "  -> Đã nạp $($strings.Count) chuỗi."

# 2. Đọc sheet2.xml
Write-Host "2. Đang đọc bảng dữ liệu khách hàng (sheet2.xml)..."
$sEntry = $zip.GetEntry('xl/worksheets/sheet2.xml')
$sDoc = [System.Xml.XmlDocument]::new()
$sDoc.Load($sEntry.Open())
$rows = $sDoc.GetElementsByTagName('row')
Write-Host "  -> Tổng số dòng trong sheet: $($rows.Count) (gồm 1 dòng tiêu đề)"

# Hàm chuyển đổi Excel OADate sang ISO 8601 string
function Convert-ExcelDate {
    param([string]$val, [bool]$dateOnly = $false)
    if ([string]::IsNullOrWhiteSpace($val)) { return "" }
    $d = 0.0
    if ([double]::TryParse(($val -replace ',', '.'), [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$d)) {
        if ($d -gt 1000 -and $d -lt 100000) {
            try {
                $dt = [DateTime]::FromOADate($d)
                if ($dateOnly) {
                    return $dt.ToString("yyyy-MM-dd")
                } else {
                    return $dt.ToString("yyyy-MM-ddTHH:mm:ss+07:00")
                }
            } catch { }
        }
    }
    # Nếu đã là chuỗi ngày sẵn
    $dtParsed = [DateTime]::MinValue
    if ([DateTime]::TryParse($val, [ref]$dtParsed)) {
        if ($dateOnly) {
            return $dtParsed.ToString("yyyy-MM-dd")
        } else {
            return $dtParsed.ToString("yyyy-MM-ddTHH:mm:ss+07:00")
        }
    }
    return $val.Trim()
}

$customersList = [System.Collections.Generic.List[hashtable]]::new()
$nowIso = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss+07:00")

for ($i = 1; $i -lt $rows.Count; $i++) {
    $row = $rows[$i]
    $cells = @{}
    foreach ($c in $row.ChildNodes) {
        $ref = $c.Attributes['r'].Value -replace '[0-9]', ''
        $t = if ($c.Attributes['t']) { $c.Attributes['t'].Value } else { '' }
        $val = if ($c['v']) { $c['v'].InnerText } else { '' }
        if ($t -eq 's' -and $val -ne '') {
            $val = $strings[[int]$val]
        }
        $cells[$ref] = $val
    }

    $id = if ($cells['C']) { $cells['C'].Trim() } else { "KH" + $i.ToString("D4") }
    $name = if ($cells['D']) { $cells['D'].Trim() } else { "Khách hàng" }
    $phone = if ($cells['E']) { ($cells['E'].Trim() -replace '\s+', '') } else { "" }

    # Ghép địa chỉ
    $addrParts = @($cells['F'], $cells['H'], $cells['G']) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    $address = if ($addrParts.Count -gt 0) { ($addrParts -join ', ').Trim() } else { "" }

    $gender = if ($cells['J']) { $cells['J'].Trim() } else { "" }
    $birthday = Convert-ExcelDate $cells['I'] -dateOnly $true
    $email = if ($cells['K']) { $cells['K'].Trim() } else { "" }
    $note = if ($cells['N']) { $cells['N'].Trim() } else { "" }

    # Ngày tạo & GD cuối
    $createdAt = Convert-ExcelDate $cells['AC']
    if ([string]::IsNullOrWhiteSpace($createdAt)) { $createdAt = $nowIso }
    
    $lastVisit = Convert-ExcelDate $cells['AD']
    if ([string]::IsNullOrWhiteSpace($lastVisit)) { $lastVisit = $createdAt }

    # Điểm tích lũy (Cột AE: Điểm hiện tại, fallback AF: Tổng điểm)
    $points = 0
    $ptStr = if (-not [string]::IsNullOrWhiteSpace($cells['AE'])) { $cells['AE'] } else { $cells['AF'] }
    if (-not [string]::IsNullOrWhiteSpace($ptStr)) {
        $ptDbl = 0.0
        if ([double]::TryParse(($ptStr -replace ',', '.'), [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$ptDbl)) {
            $points = [Math]::Max(0, [int][Math]::Round($ptDbl))
        }
    }

    # Tổng chi tiêu (Cột AI: Tổng bán trừ trả hàng, fallback AH: Tổng bán)
    $totalSpent = 0
    $spentStr = if (-not [string]::IsNullOrWhiteSpace($cells['AI'])) { $cells['AI'] } else { $cells['AH'] }
    if (-not [string]::IsNullOrWhiteSpace($spentStr)) {
        $spentDbl = 0.0
        if ([double]::TryParse(($spentStr -replace ',', '.'), [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$spentDbl)) {
            $totalSpent = [Math]::Max(0, [int][Math]::Round($spentDbl))
        }
    }

    # Nợ cần thu (Cột AG)
    $debt = 0
    if (-not [string]::IsNullOrWhiteSpace($cells['AG'])) {
        $debtDbl = 0.0
        if ([double]::TryParse(($cells['AG'] -replace ',', '.'), [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$debtDbl)) {
            $debt = [int][Math]::Round($debtDbl)
        }
    }

    # ordersCount: nếu tổng chi tiêu > 0 thì tối thiểu 1 đơn
    $ordersCount = if ($totalSpent -gt 0) { 1 } else { 0 }

    # Thông tin bổ trợ (Công ty, MST nếu có)
    $company = if ($cells['P']) { $cells['P'].Trim() } else { "" }
    $taxCode = if ($cells['T']) { $cells['T'].Trim() } else { "" }

    $custObj = [ordered]@{
        id          = $id
        name        = $name
        phone       = $phone
        points      = $points
        totalSpent  = $totalSpent
        ordersCount = $ordersCount
        debt        = $debt
        address     = $address
        gender      = $gender
        birthday    = $birthday
        email       = $email
        note        = $note
        company     = $company
        taxCode     = $taxCode
        createdAt   = $createdAt
        lastVisit   = $lastVisit
    }

    $customersList.Add($custObj)
}

$zip.Dispose()

Write-Host "3. Đang ghi $($customersList.Count) khách hàng vào file $outputJsonPath..."
$jsonContent = ConvertTo-Json -InputObject @($customersList) -Depth 5 -Compress
[System.IO.File]::WriteAllText($outputJsonPath, $jsonContent, [System.Text.Encoding]::UTF8)

$fileSizeKb = [Math]::Round((Get-Item $outputJsonPath).Length / 1KB, 1)
Write-Host "  -> Thành công! Kích thước file: $fileSizeKb KB"
Write-Host "=========================================================="
