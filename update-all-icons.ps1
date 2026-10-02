Add-Type -AssemblyName System.Drawing

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceFile = Join-Path $baseDir "icon android.png"

if (!(Test-Path $sourceFile)) {
    Write-Error "Source file 'icon android.png' not found!"
    exit 1
}

$srcImage = [System.Drawing.Image]::FromFile($sourceFile)

function Ensure-Directory {
    param([string]$path)
    $dir = Split-Path $path
    if ($dir -and !(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

function Create-RoundedRectangleGraphicsPath {
    param(
        [System.Drawing.Rectangle]$rect,
        [int]$radius
    )
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = $radius * 2
    $arc = New-Object System.Drawing.Rectangle $rect.X, $rect.Y, $diameter, $diameter

    $path.AddArc($arc, 180, 90)
    $arc.X = $rect.Right - $diameter
    $path.AddArc($arc, 270, 90)
    $arc.Y = $rect.Bottom - $diameter
    $path.AddArc($arc, 0, 90)
    $arc.X = $rect.Left
    $path.AddArc($arc, 90, 90)
    $path.CloseFigure()
    return $path
}

# 1. Adaptive Foreground (108dp base, scaled ~72% centered on pure white canvas)
function Save-AdaptiveForeground {
    param([int]$size, [string]$dest)
    Ensure-Directory $dest
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    $g.Clear([System.Drawing.Color]::White)
    
    $scaledSize = [int][Math]::Round($size * 0.72)
    $offset = [int][Math]::Round(($size - $scaledSize) / 2)
    $g.DrawImage($srcImage, $offset, $offset, $scaledSize, $scaledSize)
    
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created Foreground: $dest ($size x $size)"
}

# 2. Legacy Launcher (Rounded Rectangle on transparent background)
function Save-LegacyLauncher {
    param([int]$size, [string]$dest)
    Ensure-Directory $dest
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    $g.Clear([System.Drawing.Color]::Transparent)
    
    $radius = [int][Math]::Round($size * 0.18)
    $rect = New-Object System.Drawing.Rectangle 0, 0, ($size - 1), ($size - 1)
    $path = Create-RoundedRectangleGraphicsPath $rect $radius
    
    $whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $g.FillPath($whiteBrush, $path)
    $g.SetClip($path)
    $g.DrawImage($srcImage, 0, 0, $size, $size)
    
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $whiteBrush.Dispose()
    $path.Dispose()
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created Launcher: $dest ($size x $size)"
}

# 3. Legacy Round Icon (Circle on transparent background)
function Save-LegacyRound {
    param([int]$size, [string]$dest)
    Ensure-Directory $dest
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    $g.Clear([System.Drawing.Color]::Transparent)
    
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(0, 0, ($size - 1), ($size - 1))
    
    $whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $g.FillPath($whiteBrush, $path)
    $g.SetClip($path)
    
    $scaled = [int][Math]::Round($size * 0.82)
    $offset = [int][Math]::Round(($size - $scaled) / 2)
    $g.DrawImage($srcImage, $offset, $offset, $scaled, $scaled)
    
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $whiteBrush.Dispose()
    $path.Dispose()
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created Round: $dest ($size x $size)"
}

# 4. Square Icon (for web/PWA)
function Save-SquareIcon {
    param([int]$size, [string]$dest)
    Ensure-Directory $dest
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    $g.Clear([System.Drawing.Color]::White)
    $g.DrawImage($srcImage, 0, 0, $size, $size)
    
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created Web Icon: $dest ($size x $size)"
}

# 5. Splash Screen (Centered on white)
function Save-Splash {
    param([int]$width, [int]$height, [string]$dest)
    Ensure-Directory $dest
    $bmp = New-Object System.Drawing.Bitmap $width, $height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    $g.Clear([System.Drawing.Color]::White)
    
    $minDim = [Math]::Min($width, $height)
    $logoSize = [int][Math]::Round($minDim * 0.40)
    if ($logoSize -lt 120) { $logoSize = [Math]::Min(120, $minDim) }
    
    $offsetX = [int][Math]::Round(($width - $logoSize) / 2)
    $offsetY = [int][Math]::Round(($height - $logoSize) / 2)
    $g.DrawImage($srcImage, $offsetX, $offsetY, $logoSize, $logoSize)
    
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created Splash: $dest ($width x $height)"
}

Write-Host "=== 1. Updating Web & PWA Icons ==="
Copy-Item $sourceFile (Join-Path $baseDir "icon.png") -Force
Copy-Item $sourceFile (Join-Path $baseDir "assets\icon.png") -Force
Save-SquareIcon 192 (Join-Path $baseDir "assets\icon-192.png")
Save-SquareIcon 512 (Join-Path $baseDir "assets\icon-512.png")

Write-Host "`n=== 2. Updating Android Launcher & Adaptive Icons ==="
$androidRes = Join-Path $baseDir "android\app\src\main\res"

$densities = @(
    @{ name = "mdpi"; launcher = 48; foreground = 108 },
    @{ name = "hdpi"; launcher = 72; foreground = 162 },
    @{ name = "xhdpi"; launcher = 96; foreground = 216 },
    @{ name = "xxhdpi"; launcher = 144; foreground = 324 },
    @{ name = "xxxhdpi"; launcher = 192; foreground = 432 }
)

foreach ($d in $densities) {
    $folder = Join-Path $androidRes "mipmap-$($d.name)"
    Save-LegacyLauncher $d.launcher (Join-Path $folder "ic_launcher.png")
    Save-LegacyRound $d.launcher (Join-Path $folder "ic_launcher_round.png")
    Save-AdaptiveForeground $d.foreground (Join-Path $folder "ic_launcher_foreground.png")
}

Write-Host "`n=== 3. Cleaning leftover unused vectors in drawable folders ==="
$leftoverForegroundXml = Join-Path $androidRes "drawable-v24\ic_launcher_foreground.xml"
if (Test-Path $leftoverForegroundXml) {
    Remove-Item $leftoverForegroundXml -Force
    Write-Host "Removed leftover: $leftoverForegroundXml"
}

$leftoverBgXml = Join-Path $androidRes "drawable\ic_launcher_background.xml"
if (Test-Path $leftoverBgXml) {
    Remove-Item $leftoverBgXml -Force
    Write-Host "Removed leftover: $leftoverBgXml"
}

Write-Host "`n=== 4. Updating Android Splash Screens ==="
$splashes = @(
    @{ path = "drawable\splash.png"; w = 480; h = 320 },
    @{ path = "drawable-port-mdpi\splash.png"; w = 320; h = 480 },
    @{ path = "drawable-port-hdpi\splash.png"; w = 480; h = 800 },
    @{ path = "drawable-port-xhdpi\splash.png"; w = 720; h = 1280 },
    @{ path = "drawable-port-xxhdpi\splash.png"; w = 960; h = 1600 },
    @{ path = "drawable-port-xxxhdpi\splash.png"; w = 1280; h = 1920 },
    @{ path = "drawable-land-mdpi\splash.png"; w = 480; h = 320 },
    @{ path = "drawable-land-hdpi\splash.png"; w = 800; h = 480 },
    @{ path = "drawable-land-xhdpi\splash.png"; w = 1280; h = 720 },
    @{ path = "drawable-land-xxhdpi\splash.png"; w = 1600; h = 960 },
    @{ path = "drawable-land-xxxhdpi\splash.png"; w = 1920; h = 1280 }
)

foreach ($s in $splashes) {
    $fullPath = Join-Path $androidRes $s.path
    Save-Splash $s.w $s.h $fullPath
}

$srcImage.Dispose()
Write-Host "`n🎉 ALL ICONS AND SPLASH SCREENS SUCCESSFULLY UPDATED!"
