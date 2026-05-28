# ═══════════════════════════════════════════════════════
# BUILD APPS SCRIPT BUNDLE
#   - Read files as UTF-8 (PS 5.1 defaults to CP1252 → mojibake on emojis)
#   - Use String.Replace() (NOT -replace) → preserves $ chars
#   - Write UTF-8 without BOM
# ═══════════════════════════════════════════════════════

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# CRITICAL: -Encoding UTF8 — without this, emojis (4-byte UTF-8) get corrupted
$css     = Get-Content "$root\css\style.css" -Raw -Encoding UTF8
$market  = Get-Content "$root\js\market.js"  -Raw -Encoding UTF8
$agents  = Get-Content "$root\js\agents.js"  -Raw -Encoding UTF8
$ui      = Get-Content "$root\js\ui.js"      -Raw -Encoding UTF8
$extras  = Get-Content "$root\js\extras.js"  -Raw -Encoding UTF8
$app     = Get-Content "$root\js\app.js"     -Raw -Encoding UTF8
$index   = Get-Content "$root\index.html"    -Raw -Encoding UTF8

# Use .Replace() (string method, NOT regex) — preserves $ in template literals
$bundled = $index.Replace(
    '<link rel="stylesheet" href="css/style.css">',
    "<style>`n$css`n</style>"
).Replace(
    '<script src="js/market.js"></script>',
    "<script>`n$market`n</script>"
).Replace(
    '<script src="js/agents.js"></script>',
    "<script>`n$agents`n</script>"
).Replace(
    '<script src="js/ui.js"></script>',
    "<script>`n$ui`n</script>"
).Replace(
    '<script src="js/extras.js"></script>',
    "<script>`n$extras`n</script>"
).Replace(
    '<script src="js/app.js"></script>',
    "<script>`n$app`n</script>"
)

$bundled = $bundled.Replace('<title>TRADING WAR ROOM — AI Agent System</title>',
                            '<title>Trading War Room — Apps Script</title>')

# Write UTF-8 WITHOUT BOM
$outPath = "$root\appscript\Index.html"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($outPath, $bundled, $utf8NoBom)

$size = (Get-Item $outPath).Length
Write-Output "Built: $outPath"
Write-Output "Size: $size bytes ($([math]::Round($size / 1024, 1)) KB)"

# Sanity check — string + emoji integrity
$check = Get-Content $outPath -Raw -Encoding UTF8
$hasWaveTpl  = $check.Contains('`Wave ${waveNum}`')
$hasArrowTpl = $check.Contains('${arrow}')
$hasGoldEmoji   = $check.Contains([char]::ConvertFromUtf32(0x1F947))  # 🥇
$hasMoneyEmoji  = $check.Contains([char]::ConvertFromUtf32(0x1F4B0))  # 💰
$hasCrownEmoji  = $check.Contains([char]::ConvertFromUtf32(0x1F451))  # 👑
$hasThai = $check.Contains([char]0x0E14) -or $check.Contains([char]0x0E32)  # ด or า

Write-Output ''
Write-Output 'Sanity checks:'
Write-Output ('  Template literal Wave/waveNum survived: ' + $hasWaveTpl)
Write-Output ('  Template literal arrow        survived: ' + $hasArrowTpl)
Write-Output ('  Emoji gold-medal              survived: ' + $hasGoldEmoji)
Write-Output ('  Emoji money-bag               survived: ' + $hasMoneyEmoji)
Write-Output ('  Emoji crown                   survived: ' + $hasCrownEmoji)
Write-Output ('  Thai characters               survived: ' + $hasThai)

$ok = $hasWaveTpl -and $hasArrowTpl -and $hasGoldEmoji -and $hasMoneyEmoji -and $hasCrownEmoji -and $hasThai
if ($ok) { Write-Output ''; Write-Output '  Bundle integrity OK - ready to paste into Apps Script' }
else     { Write-Warning 'Bundle integrity FAILED - re-run or report' }
