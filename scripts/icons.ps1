Add-Type -AssemblyName System.Drawing
foreach ($iconSize in @(192, 512)) {
  $bitmap = New-Object System.Drawing.Bitmap($iconSize, $iconSize)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = 'AntiAlias'
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#365b3d'))
  $graphics.ScaleTransform($iconSize / 64.0, $iconSize / 64.0)
  $pen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#d2ecb7'), 3.5)
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'
  foreach ($waveY in @(24,33,42)) {
    $graphics.DrawBezier($pen,15,$waveY,21,($waveY-7),26,($waveY+7),32,$waveY)
    $graphics.DrawBezier($pen,32,$waveY,38,($waveY-7),43,($waveY+7),49,$waveY)
  }
  $bitmap.Save((Join-Path $PSScriptRoot "../dist/icon-$iconSize.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $pen.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
