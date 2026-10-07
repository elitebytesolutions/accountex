# Concatenates src/ partials into a single self-contained index.html
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $root 'src'
$order = @(
  '00-head.html', '10-styles.css', '13-sales-docs.css', '14-purchase-docs.css', '15-polish.css', '16-studio.css', '17-coa.css', '18-books.css', '19-dash.css',
  '1A-company-plus.css', '1B-admin-plus.css', '1C-ess.css', '1D-mobile.css', '1E-cash-users.css', '1F-products.css', '1G-stock-ops.css', '1H-wholesale.css', '1I-distribution.css', '1J-flags.css', '1K-calc.css', '20-shell-open.html',
  '30-entry-admin.html', '3A-admin-plus.html', '3B-flags.html', '40-acc-core.html', '41-acc-trade.html', '42-acc-reports.html', '43-sales-docs.html', '44-purchase-docs.html',
  '45-studios.html', '46-coa.html', '47-books.html', '48-dash-stock.html', '49-cash-users.html', '4A-company-plus.html', '4B-products.html', '4C-stock-ops.html', '4D-wholesale.html', '4E-distribution.html',
  '50-hr-core.html', '51-hr-pay-talent.html', '60-settings-ess.html', '6A-ess.html', '70-mobile.html',
  '80-shell-close.html', '90-nav.js', '91-data.js', '95-ui.js', '92-dash.js', '93-sales-docs.js', '94-purchase-docs.js',
  '96-studio.js', '97-coa.js', '98-books.js', '9A-company-plus.js', '9B-admin-plus.js', '9C-ess.js', '9D-mobile.js', '9E-cash-users.js', '9F-products.js', '9G-stock-ops.js', '9H-wholesale.js', '9I-distribution.js', '9J-flags.js', '9K-calc.js', '99-app.js'
)
$sb = New-Object System.Text.StringBuilder
foreach ($f in $order) {
  $p = Join-Path $src $f
  if (-not (Test-Path $p)) { continue }
  $txt = [IO.File]::ReadAllText($p, [Text.Encoding]::UTF8)
  # each JS partial gets its own <script> so one error cannot take down the rest
  if ($f.EndsWith('.js')) { $txt = "<script>/* $f */`n" + $txt + "`n</script>" }
  [void]$sb.AppendLine($txt)
}
[void]$sb.AppendLine("</body>`n</html>")
$out = Join-Path $root 'index.html'
[IO.File]::WriteAllText($out, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
$lines = (Get-Content $out | Measure-Object -Line).Lines
Write-Output "Built $out ($lines lines, $([math]::Round((Get-Item $out).Length/1KB)) KB)"
