# Tạo ảnh phái sinh từ ảnh gốc 2560x1440 trong public/image-styles/.
# Bộ mã hoá duy nhất có sẵn trên máy này là .NET System.Drawing (ghi JPEG/PNG).
# Không có cwebp / ImageMagick / ffmpeg — xem media.css phần 1 để biết vì sao
# đường dẫn là JPEG chứ không phải WebP.
param(
  [string]$Source = 'public\image-styles',
  [string]$OutDir = 'public\img',
  [int[]]$Widths = @(512, 1024)
)

Add-Type -AssemblyName System.Drawing
$quality = 82

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

function Save-Derivative {
  param([string]$Path, [int]$TargetWidth)

  $src = [System.Drawing.Image]::FromFile($Path)
  try {
    if ($src.Width -le $TargetWidth) { return $null }

    $ratio = $TargetWidth / $src.Width
    $w = $TargetWidth
    $h = [int][Math]::Round($src.Height * $ratio)

    # Vẽ vào bitmap 24bpp: ảnh gốc là 24bppRgb nên không cần xử lý alpha,
    # và tránh Format32bppArgb làm tệp JPEG nặng thêm một kênh.
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    try {
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.Clear([System.Drawing.Color]::Black)
        $g.DrawImage($src, 0, 0, $w, $h)
      } finally {
        $g.Dispose()
      }

      $name = [System.IO.Path]::GetFileNameWithoutExtension($Path)
      $target = Join-Path $OutDir "$name-$TargetWidth.jpg"

      $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
        Where-Object { $_.MimeType -eq 'image/jpeg' }
      $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
      $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
        [System.Drawing.Imaging.Encoder]::Quality, [long]$quality)
      $bmp.Save($target, $codec, $ep)

      return (Get-Item $target)
    } finally {
      $bmp.Dispose()
    }
  } finally {
    $src.Dispose()
  }
}

$rows = @()
Get-ChildItem $Source -Filter *.jpg | Sort-Object Name | ForEach-Object {
  $orig = $_
  foreach ($w in $Widths) {
    $out = Save-Derivative -Path $orig.FullName -TargetWidth $w
    if ($out) {
      $rows += [pscustomobject]@{
        file   = $out.Name
        width  = $w
        kb     = [math]::Round($out.Length / 1KB, 1)
      }
    }
  }
}
$rows | Format-Table -AutoSize | Out-String -Width 60
"Tong so anh moi: $($rows.Count)"
"Tong dung luong: $([math]::Round(($rows | Measure-Object kb -Sum).Sum,1)) KB"
