# Compose saved MCP screenshots into an inspection sheet; no model/image generation.
Add-Type -AssemblyName System.Drawing
$heroDirectory = Join-Path $PSScriptRoot '../../art/sunlit-actors/starfire-hero'
$heroDirectory = [System.IO.Path]::GetFullPath($heroDirectory)
$font = New-Object System.Drawing.Font('Segoe UI',16)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(238,225,198))
function Write-ReviewSheet($name, $views, $labels) {
    $canvas = New-Object System.Drawing.Bitmap 1600,740
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.Clear([System.Drawing.Color]::FromArgb(45,49,51))
    for ($i=0; $i -lt $views.Count; $i++) {
        $source = [System.Drawing.Image]::FromFile((Join-Path $heroDirectory ('review/final/'+$views[$i]+'.png')))
        # Fit each captured character without stretching its proportions.
        $minX=$source.Width; $minY=$source.Height; $maxX=0; $maxY=0
        for ($y=0; $y -lt $source.Height; $y+=4) {
            for ($x=0; $x -lt $source.Width; $x+=4) {
                $pixel=$source.GetPixel($x,$y)
                $high=[Math]::Max($pixel.R,[Math]::Max($pixel.G,$pixel.B))
                $low=[Math]::Min($pixel.R,[Math]::Min($pixel.G,$pixel.B))
                if (($high-$low) -gt 15 -or $high -gt 120) {
                    $minX=[Math]::Min($minX,$x); $maxX=[Math]::Max($maxX,$x)
                    $minY=[Math]::Min($minY,$y); $maxY=[Math]::Max($maxY,$y)
                }
            }
        }
        # Keep a shared vertical frame and common scale, so side view is not taller.
        $crop = New-Object System.Drawing.Rectangle(($minX-22),130,($maxX-$minX+44),760)
        $scale=[Math]::Min(.82,390.0/$crop.Width)
        $width=[int]($crop.Width*$scale); $height=[int]($crop.Height*$scale)
        $target = New-Object System.Drawing.Rectangle(($i*400+[int]((400-$width)/2)),(60+[int]((650-$height)/2)),$width,$height)
        $graphics.DrawImage($source,$target,$crop,[System.Drawing.GraphicsUnit]::Pixel)
        $graphics.DrawString($labels[$i],$font,$brush,([float]($i*400+18)),([float]18))
        $source.Dispose()
    }
    $canvas.Save((Join-Path $heroDirectory $name),[System.Drawing.Imaging.ImageFormat]::Png)
    $graphics.Dispose(); $canvas.Dispose()
}
Write-ReviewSheet 'stage-a-views.png' @('front','side','back','three_quarter') @('FRONT','SIDE','BACK','THREE-QUARTER')
Write-ReviewSheet 'stage-a-rig.png' @('flex_half','flex_full','skeleton_flex','staff') @('HALF FLEX','FULL FLEX','SKELETON','RIGHT-HAND STAFF')
$font.Dispose(); $brush.Dispose()
