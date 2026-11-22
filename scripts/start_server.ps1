$p = Start-Process -FilePath "F:\MedicaPharmacy\MedicaServer.exe" -ArgumentList "--lan-only" -PassThru
Write-Host "MedicaServer started with PID $($p.Id)"
$p.WaitForExit()
