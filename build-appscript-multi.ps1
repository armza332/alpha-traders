# ═══════════════════════════════════════════════════════
# BUILD APPS SCRIPT — MULTI-FILE EDITION
#   แยกแต่ละ script เป็นไฟล์ .html ของตัวเอง
#   ใช้ <?!= include('Name'); ?> ใน Index.html ดึงมารวม
#
#   วิธีนี้ Apps Script จะ inline แต่ละ script แบบ raw text
#   ไม่ผ่าน template scriptlet processing → JS เก่งครบ ไม่พัง
# ═══════════════════════════════════════════════════════

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$out  = "$root\appscript"

# Read js files as UTF-8
$market  = Get-Content "$root\js\market.js"  -Raw -Encoding UTF8
$agents  = Get-Content "$root\js\agents.js"  -Raw -Encoding UTF8
$ui      = Get-Content "$root\js\ui.js"      -Raw -Encoding UTF8
$extras  = Get-Content "$root\js\extras.js"  -Raw -Encoding UTF8
$app     = Get-Content "$root\js\app.js"     -Raw -Encoding UTF8

$css     = Get-Content "$root\css\style.css" -Raw -Encoding UTF8
$index   = Get-Content "$root\index.html"    -Raw -Encoding UTF8

# UTF-8 no BOM writer
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function WriteFile([string]$path, [string]$content) {
    [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

# ─── Write each JS as its own HTML file (just <script> wrapper) ───
$scripts = @{
    'Market'  = $market
    'Agents'  = $agents
    'Ui'      = $ui
    'Extras'  = $extras
    'App'     = $app
}

foreach ($name in $scripts.Keys) {
    $content = "<script>`n" + $scripts[$name] + "`n</script>"
    WriteFile "$out\$name.html" $content
}

# ─── Write Styles.html (CSS wrapped in <style>) ───
$stylesHtml = "<style>`n" + $css + "`n</style>"
WriteFile "$out\Styles.html" $stylesHtml

# ─── Write Index.html (HTML + include scriptlets) ───
$indexAppsScript = $index.Replace(
    '<link rel="stylesheet" href="css/style.css">',
    '<?!= include(''Styles''); ?>'
).Replace(
    '<script src="js/market.js"></script>',
    '<?!= include(''Market''); ?>'
).Replace(
    '<script src="js/agents.js"></script>',
    '<?!= include(''Agents''); ?>'
).Replace(
    '<script src="js/ui.js"></script>',
    '<?!= include(''Ui''); ?>'
).Replace(
    '<script src="js/extras.js"></script>',
    '<?!= include(''Extras''); ?>'
).Replace(
    '<script src="js/app.js"></script>',
    '<?!= include(''App''); ?>'
)

WriteFile "$out\Index.html" $indexAppsScript

# ─── Print summary ───
Write-Output ''
Write-Output 'Multi-file Apps Script build complete:'
Get-ChildItem $out -Filter '*.html' | Sort-Object Name | ForEach-Object {
    $kb = [math]::Round($_.Length / 1024, 1)
    Write-Output ('  ' + $_.Name.PadRight(20) + $kb.ToString() + ' KB')
}

Write-Output ''
Write-Output 'Files to paste into Apps Script editor:'
Write-Output '  Code.gs        (existing - already deployed)'
Write-Output '  Index.html     (main HTML with includes)'
Write-Output '  Styles.html    (CSS)'
Write-Output '  Market.html    (script: market engine)'
Write-Output '  Agents.html    (script: AI agents)'
Write-Output '  Ui.html        (script: UI rendering)'
Write-Output '  Extras.html    (script: telegram + settings)'
Write-Output '  App.html       (script: main controller)'
