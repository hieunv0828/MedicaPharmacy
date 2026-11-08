<#
.SYNOPSIS
    Import dữ liệu từ file Excel KiotViet theo ngày tùy chọn (Append an toàn, chống trùng lặp)
.DESCRIPTION
    Hỗ trợ nạp đơn bán hàng (HD) và sổ quỹ (Thu/Chi), tự động nhận dạng loại file hoặc chỉ định qua -Type.
    Có thể lọc chỉ nạp 1 ngày cụ thể (ví dụ: -Date "2026-11-08" hoặc -Date "08/11/2026"),
    hoặc nạp toàn bộ file (để trống).
.EXAMPLE
    # Nạp hóa đơn bán hàng chỉ riêng ngày 08/11/2026:
    .\scripts\import_kiotviet_by_date.ps1 -FilePath "C:\Downloads\HoaDon_KiotViet.xlsx" -Date "2026-11-08"

    # Nạp sổ quỹ chỉ riêng ngày 08/11/2026:
    .\scripts\import_kiotviet_by_date.ps1 -FilePath "C:\Downloads\SoQuy_KiotViet.xlsx" -Date "2026-11-08"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath,

    [Parameter(Mandatory=$false)]
    [string]$Date = "", # Ví dụ: "2026-11-08" hoặc "08/11/2026". Để trống để nạp tất cả.

    [Parameter(Mandatory=$false)]
    [ValidateSet("auto", "orders", "vouchers", "stockin", "returns")]
    [string]$Type = "auto"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $FilePath)) {
    Write-Error "File không tồn tại: $FilePath"
    exit 1
}

Add-Type -AssemblyName System.IO.Compression.FileSystem

# 1. Chuẩn hóa tham số ngày về yyyy-MM-dd
$targetDateStr = ""
if ($Date -and $Date.Trim() -ne "" -and $Date.Trim().ToLower() -ne "all") {
    $d = $Date.Trim()
    if ($d -match '^(\d{1,2})/(\d{1,2})/(\d{4})') {
        $day = $matches[1].PadLeft(2, '0')
        $mon = $matches[2].PadLeft(2, '0')
        $yr  = $matches[3]
        $targetDateStr = "$yr-$mon-$day"
    } elseif ($d -match '^(\d{4})-(\d{1,2})-(\d{1,2})') {
        $yr  = $matches[1]
        $mon = $matches[2].PadLeft(2, '0')
        $day = $matches[3].PadLeft(2, '0')
        $targetDateStr = "$yr-$mon-$day"
    } else {
        Write-Warning "Không nhận dạng được định dạng ngày '$Date', sẽ nạp toàn bộ dữ liệu."
    }
}

if ($targetDateStr) {
    Write-Host ">>> CHẾ ĐỘ LỌC THEO NGÀY: $targetDateStr" -ForegroundColor Cyan
} else {
    Write-Host ">>> CHẾ ĐỘ NẠP TOÀN BỘ FILE (Tự động chống trùng lặp)" -ForegroundColor Cyan
}

# 2. Giải nén file Excel để đọc XML trực tiếp (tốc độ cao, không cần cài Excel/Office)
$tmpDir = Join-Path $env:TEMP ("kiotviet_import_" + (Get-Random))
New-Item -ItemType Directory -Path $tmpDir | Out-Null

try {
    [System.IO.Compression.ZipFile]::ExtractToDirectory($FilePath, $tmpDir)

    # Đọc sharedStrings.xml
    $ssFile = Join-Path $tmpDir "xl\sharedStrings.xml"
    $strings = @()
    if (Test-Path $ssFile) {
        [xml]$ss = Get-Content $ssFile -Encoding UTF8
        $strings = @($ss.sst.si | ForEach-Object {
            $si = $_
            if ($si.r) {
                ($si.r | ForEach-Object { $_.t } | Where-Object { $_ -ne $null }) -join ''
            } elseif ($si.t -ne $null) {
                $t = $si.t
                if ($t -is [System.Xml.XmlElement]) { $t.'#text' } else { $t }
            } else { '' }
        })
    }

    # Chọn sheet chứa dữ liệu lớn nhất
    $candidateSheets = Get-ChildItem (Join-Path $tmpDir "xl\worksheets") -Filter "sheet*.xml" | Sort-Object Length -Descending
    if ($candidateSheets.Count -eq 0) {
        Write-Error "Không tìm thấy sheet dữ liệu trong file Excel."
        exit 1
    }
    $sheetFile = $candidateSheets[0].FullName
    [xml]$ws = Get-Content $sheetFile -Encoding UTF8
    $rows = $ws.worksheet.sheetData.row

    function Get-CellValue($cell, $strArr) {
        if ($null -eq $cell) { return '' }
        $v = $cell.v
        if ($null -eq $v -or $v -eq '') { return '' }
        if ($cell.t -eq 's') { return $strArr[[int]$v] }
        return $v
    }

    function Convert-OADate($oaVal) {
        if ([string]::IsNullOrEmpty($oaVal)) { return '' }
        if ($oaVal -match '^(\d{1,2})/(\d{1,2})/(\d{4})') {
            try {
                $d = $matches[1].PadLeft(2, '0')
                $m = $matches[2].PadLeft(2, '0')
                $y = $matches[3]
                $timePart = if ($oaVal -match '\d{2}:\d{2}') { $matches[0] + ":00" } else { "08:00:00" }
                return "$y-$m-${d}T${timePart}+07:00"
            } catch {}
        }
        try {
            $dt = [DateTime]::FromOADate([double]$oaVal)
            return $dt.ToString('yyyy-MM-ddTHH:mm:ss+07:00')
        } catch { return '' }
    }

    # Tự động nhận diện loại file
    $detectedType = $Type
    if ($detectedType -eq "auto") {
        $sampleText = ($strings | Select-Object -First 100) -join " "
        if ($sampleText -match "Loại thu chi|Sổ quỹ|Người nộp/nhận") {
            $detectedType = "vouchers"
        } elseif ($sampleText -match "Hóa đơn|Mã hóa đơn|Bán hàng|Chi tiết hóa đơn") {
            $detectedType = "orders"
        } elseif ($sampleText -match "Trả hàng nhập|Mã trả hàng nhập") {
            $detectedType = "returns"
        } elseif ($sampleText -match "Nhập hàng|Mã nhập hàng") {
            $detectedType = "stockin"
        } else {
            $detectedType = "orders"
        }
    }
    Write-Host "Loại dữ liệu xác định: $detectedType" -ForegroundColor Green

    # ========================================================
    # XỬ LÝ 1: HÓA ĐƠN BÁN HÀNG (ORDERS)
    # ========================================================
    if ($detectedType -eq "orders") {
        $ordersPath = "f:\MedicaPharmacy\data\orders_2026.json"
        $vouchersPath = "f:\MedicaPharmacy\data\vouchers_2026.json"
        $medicinesPath = "f:\MedicaPharmacy\data\medicines.json"

        # Load thuốc để lấy tiền vốn
        $medMap = @{}
        if (Test-Path $medicinesPath) {
            $meds = Get-Content $medicinesPath -Raw -Encoding UTF8 | ConvertFrom-Json
            foreach ($m in $meds) {
                if ($m.id) { $medMap[$m.id] = $m }
                if ($m.barcode) { $medMap[$m.barcode] = $m }
            }
        }

        # Load danh sách đơn hiện có
        $existingOrders = @()
        if (Test-Path $ordersPath) {
            $existingOrders = Get-Content $ordersPath -Raw -Encoding UTF8 | ConvertFrom-Json
        }
        $existOrderMap = @{}
        foreach ($o in $existingOrders) { if ($o.id) { $existOrderMap[$o.id] = $true } }

        # Gom các dòng thành các đơn hàng
        $ordersDict = [System.Collections.Generic.Dictionary[string, object]]::new()
        $skipFirst = $true

        foreach ($row in $rows) {
            if ($skipFirst) { $skipFirst = $false; continue }
            $cells = @{}
            foreach ($c in $row.c) { $col = $c.r -replace '\d+', ''; $cells[$col] = $c }

            $invId = Get-CellValue $cells['B'] $strings
            if ([string]::IsNullOrEmpty($invId)) { continue }

            $timeRaw     = Get-CellValue $cells['C'] $strings
            $createdAt   = Convert-OADate $timeRaw

            # Lọc theo ngày nếu có chỉ định
            if ($targetDateStr -and (-not $createdAt.StartsWith($targetDateStr))) {
                continue
            }

            # Bỏ qua nếu đơn đã tồn tại trong hệ thống
            if ($existOrderMap.ContainsKey($invId)) {
                continue
            }

            $custId      = Get-CellValue $cells['G'] $strings
            $custName    = Get-CellValue $cells['H'] $strings
            $custPhone   = Get-CellValue $cells['J'] $strings
            $seller      = Get-CellValue $cells['P'] $strings
            $note        = Get-CellValue $cells['S'] $strings
            $finalAmt    = Get-CellValue $cells['V'] $strings
            $cashAmt     = Get-CellValue $cells['X'] $strings
            $transferAmt = Get-CellValue $cells['AA'] $strings

            $medCode     = Get-CellValue $cells['AE'] $strings
            $medName     = Get-CellValue $cells['AF'] $strings
            $unit        = Get-CellValue $cells['AG'] $strings
            $qty         = Get-CellValue $cells['AH'] $strings
            $price       = Get-CellValue $cells['AI'] $strings
            $itemTotal   = Get-CellValue $cells['AJ'] $strings

            # Xác định hình thức thanh toán
            $pMethod = 'cash'
            $cVal = 0.0; $tVal = 0.0
            if ($cashAmt) { try { $cVal = [double]$cashAmt } catch {} }
            if ($transferAmt) { try { $tVal = [double]$transferAmt } catch {} }
            if ($tVal -gt 0) { $pMethod = 'transfer' }

            if (-not $ordersDict.ContainsKey($invId)) {
                $ordersDict[$invId] = [PSCustomObject]@{
                    id            = $invId
                    customerId    = $custId
                    customerName  = if ($custName) { $custName } else { "Khách lẻ" }
                    customerPhone = $custPhone
                    pharmacist    = if ($seller) { $seller } else { "admin" }
                    note          = $note
                    totalAmount   = [Math]::Round([double]$finalAmt)
                    paymentMethod = $pMethod
                    status        = 'completed'
                    createdAt     = $createdAt
                    items         = [System.Collections.Generic.List[object]]::new()
                    returns       = @()
                    totalRefunded = 0
                }
            }

            # Tính giá vốn ước tính
            $unitCost = 0
            if ($medMap.ContainsKey($medCode)) {
                $m = $medMap[$medCode]
                $unitCost = if ($m.costPrice) { [Math]::Round([double]$m.costPrice) } else { 0 }
            }

            $itemObj = [PSCustomObject]@{
                medicineId   = $medCode
                medicineName = $medName
                unit         = if ($unit) { $unit } else { "Đơn vị" }
                quantity     = if ($qty) { [double]$qty } else { 1 }
                price        = if ($price) { [Math]::Round([double]$price) } else { 0 }
                costPrice    = $unitCost
                total        = if ($itemTotal) { [Math]::Round([double]$itemTotal) } else { 0 }
            }
            $ordersDict[$invId].items.Add($itemObj)
        }

        $newOrdersList = @($ordersDict.Values)
        if ($newOrdersList.Count -gt 0) {
            # Ghép vào danh sách đơn hàng
            $allOrders = $newOrdersList + @($existingOrders) | Sort-Object { [DateTime]$_.createdAt } -Descending
            [System.IO.File]::WriteAllText($ordersPath, ($allOrders | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)

            # Đồng thời tự động sinh phiếu thu TTHD tương ứng vào Sổ Quỹ
            if (Test-Path $vouchersPath) {
                $vouchers = Get-Content $vouchersPath -Raw -Encoding UTF8 | ConvertFrom-Json
                $vMap = @{}
                foreach ($v in $vouchers) { if ($v.id) { $vMap[$v.id] = $true } }

                $newVouchers = [System.Collections.Generic.List[object]]::new()
                foreach ($o in $newOrdersList) {
                    $vId = "TT" + $o.id
                    if (-not $vMap.ContainsKey($vId)) {
                        $newVouchers.Add([PSCustomObject]@{
                            id            = $vId
                            type          = 'receipt'
                            amount        = $o.totalAmount
                            category      = 'Tiền khách trả'
                            reason        = 'Phiếu thu Tiền khách trả'
                            person        = $o.customerName
                            paymentMethod = $o.paymentMethod
                            refId         = $o.id
                            createdAt     = $o.createdAt
                            isAccounting  = $true
                        })
                    }
                }
                if ($newVouchers.Count -gt 0) {
                    $allVouchers = @($newVouchers) + @($vouchers) | Sort-Object { [DateTime]$_.createdAt } -Descending
                    [System.IO.File]::WriteAllText($vouchersPath, ($allVouchers | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
                    Write-Host ">>> ĐÃ TỰ ĐỘNG SINH $($newVouchers.Count) PHIẾU THU TTHD VÀO SỔ QUỸ!" -ForegroundColor Green
                }
            }

            $totalRevNew = ($newOrdersList | Measure-Object totalAmount -Sum).Sum
            Write-Host "==========================================================" -ForegroundColor Green
            Write-Host ">>> THÀNH CÔNG: ĐÃ IMPORT $($newOrdersList.Count) ĐƠN HÀNG MỚI!" -ForegroundColor Green
            Write-Host ">>> TỔNG DOANH SỐ ĐƠN MỚI: $($totalRevNew.ToString('N0')) VNĐ" -ForegroundColor Green
            Write-Host "==========================================================" -ForegroundColor Green
        } else {
            Write-Host "Không có đơn hàng mới nào cần import (đã tồn tại hoặc không có đơn trong ngày $targetDateStr)." -ForegroundColor Yellow
        }
    }

    # ========================================================
    # XỬ LÝ 2: SỔ QUỸ THU CHI (VOUCHERS)
    # ========================================================
    elseif ($detectedType -eq "vouchers") {
        $dataPath = "f:\MedicaPharmacy\data\vouchers_2026.json"
        $existing = @()
        if (Test-Path $dataPath) {
            $existing = Get-Content $dataPath -Raw -Encoding UTF8 | ConvertFrom-Json
        }
        $existMap = @{}
        foreach ($v in $existing) { if ($v.id) { $existMap[$v.id] = $true } }

        $newVouchers = [System.Collections.Generic.List[object]]::new()
        $skipFirst = $true

        foreach ($row in $rows) {
            if ($skipFirst) { $skipFirst = $false; continue }
            $cells = @{}
            foreach ($c in $row.c) { $col = $c.r -replace '\d+', ''; $cells[$col] = $c }

            $vId     = Get-CellValue $cells['A'] $strings
            $timeRaw = Get-CellValue $cells['B'] $strings
            $loaiTC  = Get-CellValue $cells['C'] $strings
            $person  = Get-CellValue $cells['D'] $strings
            $amtRaw  = Get-CellValue $cells['E'] $strings

            if ([string]::IsNullOrEmpty($vId)) { continue }

            $createdAt = Convert-OADate $timeRaw
            if ($targetDateStr -and (-not $createdAt.StartsWith($targetDateStr))) {
                continue
            }

            if ($existMap.ContainsKey($vId)) {
                continue
            }

            $amt = [Math]::Abs([Math]::Round([double]$amtRaw))
            $vType = if ($vId -match '^(CTM|CNH|CTD|PC|PCPN)' -or $loaiTC -match 'Phiếu chi') { 'payment' } else { 'receipt' }
            $pMethod = if ($vId -match '^(CNH|TNH|CK)' -or $vId -match 'CK$') { 'transfer' } else { 'cash' }
            $cat = $loaiTC -replace '^Phiếu thu ', '' -replace '^Phiếu chi ', ''
            if ([string]::IsNullOrEmpty($cat)) { $cat = 'Khác' }

            $newVouchers.Add([PSCustomObject]@{
                id            = $vId
                type          = $vType
                amount        = $amt
                category      = $cat
                reason        = $loaiTC
                person        = $person
                paymentMethod = $pMethod
                refId         = ''
                createdAt     = $createdAt
                isAccounting  = $true
            })
            $existMap[$vId] = $true
        }

        if ($newVouchers.Count -gt 0) {
            $combined = @($newVouchers) + @($existing) | Sort-Object { [DateTime]$_.createdAt } -Descending
            [System.IO.File]::WriteAllText($dataPath, ($combined | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
            Write-Host "==========================================================" -ForegroundColor Green
            Write-Host ">>> THÀNH CÔNG: ĐÃ IMPORT $($newVouchers.Count) PHIẾU THU/CHI MỚI VÀO SỔ QUỸ!" -ForegroundColor Green
            Write-Host "==========================================================" -ForegroundColor Green
        } else {
            Write-Host "Không có phiếu thu chi mới nào cần import (đã tồn tại hoặc không khớp ngày)." -ForegroundColor Yellow
        }
    }
}
finally {
    if (Test-Path $tmpDir) {
        Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
