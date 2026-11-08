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
        if ($cell.is -and $cell.is.t) { return $cell.is.t }
        $v = $cell.v
        if ($null -eq $v -or $v -eq '') { return '' }
        if ($cell.t -eq 's' -and $strArr -and $strArr.Count -gt [int]$v) { return $strArr[[int]$v] }
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

    # Tự động nhận diện loại file (qua tên file, header cột và nội dung)
    $detectedType = $Type
    if ($detectedType -eq "auto") {
        $fileName = [System.IO.Path]::GetFileNameWithoutExtension($FilePath)
        $headerText = ""
        if ($rows.Count -gt 0) {
            $headerText = ($rows[0].c | ForEach-Object { Get-CellValue $_ $strings }) -join " "
        }
        $sampleText = ($strings | Select-Object -First 100) -join " "
        $allCheck = "$fileName $headerText $sampleText"

        if ($allCheck -match "SoQuy|Sổ quỹ|Mã phiếu|Loại thu chi|Người nộp/nhận") {
            $detectedType = "vouchers"
        } elseif ($allCheck -match "HoaDon|Hóa đơn|Mã hóa đơn|Bán hàng|Chi tiết hóa đơn") {
            $detectedType = "orders"
        } elseif ($allCheck -match "TraHang|Trả hàng nhập|Mã trả hàng nhập|THN") {
            $detectedType = "returns"
        } elseif ($allCheck -match "NhapHang|Nhập hàng|Mã nhập hàng") {
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

        # Build header mapping from Row 0
        $colMap = @{}
        if ($rows.Count -gt 0) {
            foreach ($c in $rows[0].c) {
                $col = $c.r -replace '\d+', ''
                $hName = (Get-CellValue $c $strings).Trim()
                if ($hName) { $colMap[$hName] = $col }
            }
        }

        function Get-ColVal($cells, $names, $fallbackCol, $strings) {
            foreach ($n in $names) {
                if ($colMap.ContainsKey($n)) {
                    $c = $cells[$colMap[$n]]
                    if ($null -ne $c) { return Get-CellValue $c $strings }
                }
            }
            return Get-CellValue $cells[$fallbackCol] $strings
        }

        # Gom các dòng thành các đơn hàng
        $ordersDict = [System.Collections.Generic.Dictionary[string, object]]::new()
        $skipFirst = $true

        foreach ($row in $rows) {
            if ($skipFirst) { $skipFirst = $false; continue }
            $cells = @{}
            foreach ($c in $row.c) { $col = $c.r -replace '\d+', ''; $cells[$col] = $c }

            $invId = Get-ColVal $cells @('Mã hóa đơn') 'B' $strings
            if ([string]::IsNullOrEmpty($invId) -or $invId -eq 'Mã hóa đơn') { continue }

            $timeRaw     = Get-ColVal $cells @('Thời gian', 'Thời gian tạo') 'C' $strings
            $createdAt   = Convert-OADate $timeRaw

            # Lọc theo ngày nếu có chỉ định
            if ($targetDateStr -and (-not $createdAt.StartsWith($targetDateStr))) {
                continue
            }

            # Bỏ qua nếu đơn đã tồn tại trong hệ thống
            if ($existOrderMap.ContainsKey($invId)) {
                continue
            }

            $custId      = Get-ColVal $cells @('Mã khách hàng') 'G' $strings
            $custName    = Get-ColVal $cells @('Tên khách hàng') 'H' $strings
            $custPhone   = Get-ColVal $cells @('Điện thoại', 'Số điện thoại') 'J' $strings
            $seller      = Get-ColVal $cells @('Người bán') 'P' $strings
            $note        = Get-ColVal $cells @('Ghi chú') 'S' $strings
            $finalAmt    = Get-ColVal $cells @('Khách cần trả', 'Tổng tiền hàng') 'V' $strings
            $cashAmt     = Get-ColVal $cells @('Tiền mặt') 'X' $strings
            $transferAmt = Get-ColVal $cells @('Chuyển khoản') 'AA' $strings

            $medCode     = Get-ColVal $cells @('Mã hàng') 'AE' $strings
            $medName     = Get-ColVal $cells @('Tên hàng') 'AG' $strings
            $unit        = Get-ColVal $cells @('ĐVT') 'AI' $strings
            $qty         = Get-ColVal $cells @('Số lượng') 'AK' $strings
            $price       = Get-ColVal $cells @('Đơn giá', 'Giá bán') 'AL' $strings
            $itemTotal   = Get-ColVal $cells @('Thành tiền') 'AP' $strings

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

            # Tính giá vốn ước tính chuẩn theo ĐVT bán
            $unitCost = 0
            if ($medMap.ContainsKey($medCode)) {
                $m = $medMap[$medCode]
                if ($m.costPrice) {
                    $cPrice = [double]$m.costPrice
                    $pRatio = if ($m.packRatio -and [double]$m.packRatio -gt 0) { [double]$m.packRatio } else { 1.0 }
                    $sRatio = if ($m.subRatio -and [double]$m.subRatio -gt 0) { [double]$m.subRatio } else { 1.0 }
                    $baseCost = $cPrice / $pRatio

                    if ($unit -and $unit -eq $m.packUnit) {
                        $unitCost = [Math]::Round($cPrice)
                    } elseif ($unit -and $unit -eq $m.subUnit -and $m.subUnit -ne $m.packUnit) {
                        $unitCost = [Math]::Round($baseCost * $sRatio)
                    } else {
                        $unitCost = [Math]::Round($baseCost)
                    }
                }
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
                            targetType    = 'customer'
                            targetName    = if ($o.customerName) { $o.customerName } else { 'Khách lẻ trực tiếp' }
                            recipientName = if ($o.customerName) { $o.customerName } else { 'Khách lẻ trực tiếp' }
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
        $ordersPath = "f:\MedicaPharmacy\data\orders_2026.json"

        # Load orders for payment method and customer matching
        $orderPayMap = @{}
        if (Test-Path $ordersPath) {
            $existingOrders = Get-Content $ordersPath -Raw -Encoding UTF8 | ConvertFrom-Json
            foreach ($o in $existingOrders) {
                if ($o.id) {
                    $orderPayMap[$o.id] = @{
                        paymentMethod = if ($o.paymentMethod) { $o.paymentMethod } else { 'cash' }
                        customerName  = if ($o.customerName) { $o.customerName } else { 'Khách lẻ trực tiếp' }
                    }
                }
            }
        }

        # Build header mapping from Row 0
        $colMap = @{}
        if ($rows.Count -gt 0) {
            foreach ($c in $rows[0].c) {
                $col = $c.r -replace '\d+', ''
                $hName = (Get-CellValue $c $strings).Trim()
                if ($hName) { $colMap[$hName] = $col }
            }
        }

        function Get-ColValV($cells, $names, $fallbackCol, $strings) {
            foreach ($n in $names) {
                if ($colMap.ContainsKey($n)) {
                    $c = $cells[$colMap[$n]]
                    if ($null -ne $c) { return Get-CellValue $c $strings }
                }
            }
            return Get-CellValue $cells[$fallbackCol] $strings
        }

        $existing = @()
        if (Test-Path $dataPath) {
            $existing = Get-Content $dataPath -Raw -Encoding UTF8 | ConvertFrom-Json
        }
        $existMap = @{}
        $vouchersList = [System.Collections.Generic.List[object]]::new()
        foreach ($v in $existing) {
            if ($v.id) {
                $existMap[$v.id] = $v
                $vouchersList.Add($v)
            }
        }

        $newAddedCount = 0
        $updatedCount = 0
        $skipFirst = $true

        foreach ($row in $rows) {
            if ($skipFirst) { $skipFirst = $false; continue }
            $cells = @{}
            foreach ($c in $row.c) { $col = $c.r -replace '\d+', ''; $cells[$col] = $c }

            $vId     = Get-ColValV $cells @('Mã phiếu') 'A' $strings
            $timeRaw = Get-ColValV $cells @('Thời gian') 'B' $strings
            $loaiTC  = Get-ColValV $cells @('Loại thu chi') 'C' $strings
            $person  = Get-ColValV $cells @('Người nộp/nhận') 'D' $strings
            $amtRaw  = Get-ColValV $cells @('Giá trị') 'E' $strings

            if ([string]::IsNullOrEmpty($vId) -or $vId -eq 'Mã phiếu') { continue }

            $createdAt = Convert-OADate $timeRaw
            if ($targetDateStr -and (-not $createdAt.StartsWith($targetDateStr))) {
                continue
            }

            $amt = [Math]::Abs([Math]::Round([double]$amtRaw))
            $vType = if ($vId -match '^(CTM|CNH|CTD|PC|PCPN|TTTH)' -or $loaiTC -match 'Phiếu chi') { 'payment' } else { 'receipt' }
            
            # Khớp mã chứng từ gốc (refId)
            $refId = ''
            if ($vId -match '^TT(HD\w+)') { $refId = $matches[1] }
            elseif ($vId -match '^PC(PN\w+)') { $refId = $matches[1] }
            elseif ($vId -match '^PT(THN\w+)') { $refId = $matches[1] }
            elseif ($vId -match '^TT(TH\w+)') { $refId = $matches[1] }

            # Xác định hình thức thanh toán
            $pMethod = 'cash'
            if ($refId -and $orderPayMap.ContainsKey($refId)) {
                $pMethod = $orderPayMap[$refId].paymentMethod
            } elseif ($vId -match '^(CNH|TNH|CK)' -or $vId -match 'CK$') {
                $pMethod = 'transfer'
            }

            # Xác định đối tượng nộp/nhận
            $targetType = 'other'
            $targetName = if ($person) { $person } else { '---' }
            $recipientName = $targetName

            if ($refId -and $refId.StartsWith('HD')) {
                $targetType = 'customer'
                if ($orderPayMap.ContainsKey($refId)) {
                    $targetName = $orderPayMap[$refId].customerName
                    $recipientName = $targetName
                } else {
                    $targetName = 'Khách lẻ trực tiếp'
                    $recipientName = 'Khách lẻ trực tiếp'
                }
            } elseif ($refId -and $refId.StartsWith('PN')) {
                $targetType = 'supplier'
            }

            $cat = $loaiTC -replace '^Phiếu thu ', '' -replace '^Phiếu chi ', ''
            if ([string]::IsNullOrEmpty($cat)) { $cat = 'Khác' }

            if ($existMap.ContainsKey($vId)) {
                # Cập nhật phiếu hiện có
                $existingVoucher = $existMap[$vId]
                $existingVoucher.type = $vType
                $existingVoucher.amount = $amt
                $existingVoucher.category = $cat
                $existingVoucher.reason = $loaiTC
                $existingVoucher.person = $person
                $existingVoucher.paymentMethod = $pMethod
                $existingVoucher.refId = $refId
                $existingVoucher.createdAt = $createdAt
                $existingVoucher.targetType = $targetType
                $existingVoucher.targetName = $targetName
                $existingVoucher.recipientName = $recipientName
                $updatedCount++
            } else {
                # Thêm phiếu mới
                $newObj = [PSCustomObject]@{
                    id            = $vId
                    type          = $vType
                    amount        = $amt
                    category      = $cat
                    reason        = $loaiTC
                    person        = $person
                    paymentMethod = $pMethod
                    refId         = $refId
                    createdAt     = $createdAt
                    targetType    = $targetType
                    targetName    = $targetName
                    recipientName = $recipientName
                    isAccounting  = $true
                }
                $vouchersList.Add($newObj)
                $existMap[$vId] = $newObj
                $newAddedCount++
            }
        }

        if ($newAddedCount -gt 0 -or $updatedCount -gt 0) {
            $sorted = @($vouchersList) | Sort-Object { [DateTime]$_.createdAt } -Descending
            [System.IO.File]::WriteAllText($dataPath, ($sorted | ConvertTo-Json -Depth 10), [System.Text.Encoding]::UTF8)
            Write-Host "==========================================================" -ForegroundColor Green
            Write-Host ">>> THÀNH CÔNG: ĐÃ IMPORT VÀO SỔ QUỸ!" -ForegroundColor Green
            Write-Host ">>> Số phiếu thêm mới: $newAddedCount" -ForegroundColor Green
            Write-Host ">>> Số phiếu cập nhật: $updatedCount" -ForegroundColor Green
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
