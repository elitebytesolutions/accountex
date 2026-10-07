<#
.SYNOPSIS
  Builds the Finsoft interactive ERD viewer (index.html) from the edition's SQL
  and entity docs. PowerShell 5.1 compatible; no Node, no Docker.

.DESCRIPTION
  Layout (relative to this script, $PSScriptRoot = <edition>\erd):
    ..\database\schema\*.sql   (sorted)   -> embedded DDL
    ..\database\fk\*.sql       (sorted)   -> embedded DDL (after schema files)
    ..\database\views\*.sql    (sorted)   -> embedded DDL (views, report functions)
    ..\database\api\*.sql      (sorted)   -> embedded DDL (save / get / action functions)
    ..\database\views\*.sql    (sorted)   -> embedded DDL (views, report functions)
    ..\database\api\*.sql      (sorted)   -> embedded DDL (save / get / action functions)
    ..\entities\*.md                      -> screen map (table -> screens)
    .\erd-template.html                   -> template containing <!--DDL-->
    .\index.html                          -> output (UTF-8, no BOM)

.PARAMETER Edition
  basic | full. Default: detected from the parent folder name (erp-basic / erp-full).
  When given and a sibling folder erp-<edition> exists, that edition is built.

.PARAMETER SqlDir
  Ad-hoc: read *.sql from this folder (and its fk\, views\ and api\ subfolders if present) instead.

.PARAMETER EntitiesDir
  Override the entities folder.

.PARAMETER OutFile
  Override the output path.

.EXAMPLE
  powershell -NoProfile -File build-erd.ps1
  powershell -NoProfile -File build-erd.ps1 -Edition basic
  powershell -NoProfile -File build-erd.ps1 -SqlDir C:\tmp\sql -OutFile C:\tmp\test.html
#>
[CmdletBinding()]
param(
  [ValidateSet('basic', 'full')][string]$Edition,
  [string]$SqlDir,
  [string]$EntitiesDir,
  [string]$OutFile,
  [string]$Template
)
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
if (-not $here) { $here = Split-Path -Parent $MyInvocation.MyCommand.Path }
$editionRoot = Split-Path -Parent $here

if ($Edition) {
  $sib = Join-Path (Split-Path -Parent $editionRoot) ('erp-' + $Edition)
  if (Test-Path -LiteralPath $sib) { $editionRoot = (Resolve-Path -LiteralPath $sib).Path }
} else {
  $leaf = Split-Path -Leaf $editionRoot
  if ($leaf -match 'basic') { $Edition = 'basic' } else { $Edition = 'full' }
}

if (-not $Template) {
  $Template = Join-Path $editionRoot 'erd\erd-template.html'
  if (-not (Test-Path -LiteralPath $Template)) { $Template = Join-Path $here 'erd-template.html' }
}
if (-not $OutFile) { $OutFile = Join-Path $editionRoot 'erd\index.html' }
if (-not $EntitiesDir) { $EntitiesDir = Join-Path $editionRoot 'entities' }

$utf8 = New-Object System.Text.UTF8Encoding($false)

# ---------------------------------------------------------------- SQL files
$sqlFiles = New-Object 'System.Collections.Generic.List[object]'   # @{ Name; Path }
function Add-SqlFolder([string]$dir, [string]$prefix) {
  if (-not (Test-Path -LiteralPath $dir)) { return }
  Get-ChildItem -LiteralPath $dir -Filter '*.sql' | Where-Object { -not $_.PSIsContainer } |
    Sort-Object Name | ForEach-Object { $sqlFiles.Add(@{ Name = ($prefix + $_.Name); Path = $_.FullName }) }
}
if ($SqlDir) {
  $SqlDir = (Resolve-Path -LiteralPath $SqlDir).Path
  Add-SqlFolder $SqlDir ''
  Add-SqlFolder (Join-Path $SqlDir 'fk') 'fk/'
  Add-SqlFolder (Join-Path $SqlDir 'views') 'views/'
  Add-SqlFolder (Join-Path $SqlDir 'api') 'api/'
} else {
  Add-SqlFolder (Join-Path $editionRoot 'database\schema') ''
  Add-SqlFolder (Join-Path $editionRoot 'database\fk') 'fk/'
  Add-SqlFolder (Join-Path $editionRoot 'database\views') 'views/'
  Add-SqlFolder (Join-Path $editionRoot 'database\api') 'api/'
}

function HtmlAttr([string]$s) {
  return $s.Replace('&', '&amp;').Replace('"', '&quot;').Replace('<', '&lt;').Replace('>', '&gt;')
}

$sb = New-Object System.Text.StringBuilder
$tableCount = 0
$funcCount = 0
foreach ($f in $sqlFiles) {
  $text = [System.IO.File]::ReadAllText($f.Path, [System.Text.Encoding]::UTF8)
  if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }
  $tableCount += ([regex]::Matches($text, '(?im)^\s*CREATE\s+TABLE\s+(?!.*\bPARTITION\s+OF\b)')).Count
  if ($f.Name -like 'api/*') { $funcCount += ([regex]::Matches($text, '(?im)^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s')).Count }
  # keep the raw-text <script> element intact; the viewer reverses both escapes
  $text = [regex]::Replace($text, '</(script)', '<\/$1', 'IgnoreCase')
  $text = $text.Replace('<!--', '<\!--')
  [void]$sb.Append('<script type="text/plain" class="ddl" data-file="' + (HtmlAttr $f.Name) + '">')
  [void]$sb.Append($text)
  [void]$sb.Append("</script>`n")
}

# ---------------------------------------------------------------- screen map
function JStr([string]$s) {
  $s = $s.Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n').Replace("`t", '\t')
  $s = $s.Replace('<', '\u003c').Replace('>', '\u003e').Replace('&', '\u0026')
  return '"' + $s + '"'
}
$dash = [string][char]0x2014
$ndash = [string][char]0x2013
# Schema.Table tokens in backticks (case-sensitive PascalCase names, e.g. `Sales.SalesInvoices`,
# `Sales.SalesInvoices.customerId`). Functions / views (camelCase second part) are not tables.
$schemas = 'Platform|Company|Accounting|BankCash|FixedAssets|Tax|Sales|Purchases|Inventory|Distribution|HumanResources|Payroll|EmployeeSelfService|Reports|Lookups'
$headRx = New-Object System.Text.RegularExpressions.Regex ('^###\s+(.+?)\s+(?:' + $dash + '|' + $ndash + '|-{1,2})\s+`([^`]+)`\s*$')
$endRx = New-Object System.Text.RegularExpressions.Regex '^#{1,3}\s'
$spanRx = New-Object System.Text.RegularExpressions.Regex '`([^`]+)`'
$tokRx = New-Object System.Text.RegularExpressions.Regex ('(?<![\w.])(' + $schemas + ')\.([A-Z][A-Za-z0-9]*)(?![A-Za-z0-9_])')
$fnLineRx = New-Object System.Text.RegularExpressions.Regex '^\*\*Functions\.\*\*'
$fnTokRx = New-Object System.Text.RegularExpressions.Regex ('^(' + $schemas + ')\.([a-z][A-Za-z0-9]*)$')

$map = New-Object 'System.Collections.Generic.Dictionary[string,System.Collections.Generic.List[string]]'
$tableOrder = New-Object 'System.Collections.Generic.List[string]'
$routes = New-Object 'System.Collections.Generic.HashSet[string]'
$fnMap = New-Object 'System.Collections.Generic.Dictionary[string,System.Collections.Generic.List[string]]'
$fnOrder = New-Object 'System.Collections.Generic.List[string]'
$fnMap = New-Object 'System.Collections.Generic.Dictionary[string,System.Collections.Generic.List[string]]'
$fnOrder = New-Object 'System.Collections.Generic.List[string]'
$screenCount = 0
if (Test-Path -LiteralPath $EntitiesDir) {
  $mdFiles = Get-ChildItem -LiteralPath $EntitiesDir -Filter '*.md' | Where-Object { -not $_.PSIsContainer } | Sort-Object Name
  foreach ($md in $mdFiles) {
    $lines = [System.IO.File]::ReadAllLines($md.FullName, [System.Text.Encoding]::UTF8)
    $cur = $null
    foreach ($line in $lines) {
      $h = $headRx.Match($line)
      if ($h.Success) {
        $title = $h.Groups[1].Value.Trim()
        $route = $h.Groups[2].Value.Trim()
        $cur = @{ json = ('{"route":' + (JStr $route) + ',"title":' + (JStr $title) + ',"file":' + (JStr $md.Name) + '}'); seen = @{} }
        $screenCount++
        [void]$routes.Add($route)
        continue
      }
      if ($endRx.IsMatch($line)) { $cur = $null; continue }
      if ($null -eq $cur) { continue }
      if ($fnLineRx.IsMatch($line)) {
        # **Functions.** Save -> `Sales.salesInvoiceAddUpdate` ... : function -> screens
        foreach ($sp in $spanRx.Matches($line)) {
          $fm = $fnTokRx.Match($sp.Groups[1].Value.Trim())
          if (-not $fm.Success) { continue }
          $fn = $fm.Value
          if (-not $fnMap.ContainsKey($fn)) { $fnMap[$fn] = New-Object 'System.Collections.Generic.List[string]'; $fnOrder.Add($fn) }
          if (-not $fnMap[$fn].Contains($cur.json)) { $fnMap[$fn].Add($cur.json) }
        }
        continue
      }
      foreach ($sp in $spanRx.Matches($line)) {
        foreach ($tk in $tokRx.Matches($sp.Groups[1].Value)) {
          $tbl = $tk.Groups[1].Value + '.' + $tk.Groups[2].Value
          if ($cur.seen.ContainsKey($tbl)) { continue }
          $cur.seen[$tbl] = 1
          if (-not $map.ContainsKey($tbl)) {
            $map[$tbl] = New-Object 'System.Collections.Generic.List[string]'
            $tableOrder.Add($tbl)
          }
          if (-not $map[$tbl].Contains($cur.json)) { $map[$tbl].Add($cur.json) }
        }
      }
    }
  }
}
$js = New-Object System.Text.StringBuilder
[void]$js.Append('{')
$first = $true
foreach ($k in $tableOrder) {
  if (-not $first) { [void]$js.Append(",`n") }
  $first = $false
  [void]$js.Append((JStr $k) + ':[' + ($map[$k] -join ',') + ']')
}
[void]$js.Append('}')
[void]$sb.Append('<script type="application/json" id="screens">' + $js.ToString() + "</script>`n")
$fj = New-Object System.Text.StringBuilder
[void]$fj.Append('{')
$first = $true
foreach ($k in $fnOrder) {
  if (-not $first) { [void]$fj.Append(",`n") }
  $first = $false
  [void]$fj.Append((JStr $k) + ':[' + ($fnMap[$k] -join ',') + ']')
}
[void]$fj.Append('}')
[void]$sb.Append('<script type="application/json" id="docfuncs">' + $fj.ToString() + "</script>`n")
$fj = New-Object System.Text.StringBuilder
[void]$fj.Append('{')
$first = $true
foreach ($k in $fnOrder) {
  if (-not $first) { [void]$fj.Append(",`n") }
  $first = $false
  [void]$fj.Append((JStr $k) + ':[' + ($fnMap[$k] -join ',') + ']')
}
[void]$fj.Append('}')
[void]$sb.Append('<script type="application/json" id="docfuncs">' + $fj.ToString() + "</script>`n")

# ---------------------------------------------------------------- assemble
if (-not (Test-Path -LiteralPath $Template)) { throw "Template not found: $Template" }
$tpl = [System.IO.File]::ReadAllText($Template, [System.Text.Encoding]::UTF8)
if ($tpl.Length -gt 0 -and $tpl[0] -eq [char]0xFEFF) { $tpl = $tpl.Substring(1) }
if ($tpl.IndexOf('<!--DDL-->') -lt 0) { throw "Template has no <!--DDL--> placeholder: $Template" }
$built = (Get-Date).ToString('yyyy-MM-dd HH:mm')
$html = $tpl.Replace('<!--DDL-->', $sb.ToString())
$html = $html.Replace('data-edition="__EDITION__"', 'data-edition="' + $Edition.ToUpper() + '"')
$html = $html.Replace('data-built="__BUILT__"', 'data-built="' + $built + '"')

$outDir = Split-Path -Parent $OutFile
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
[System.IO.File]::WriteAllText($OutFile, $html, $utf8)

Write-Host ('ERD built: ' + $OutFile)
Write-Host ('  edition    : ' + $Edition.ToUpper())
Write-Host ('  sql files  : ' + $sqlFiles.Count + '  (~' + $tableCount + ' CREATE TABLE, ~' + $funcCount + ' api functions)')
Write-Host ('  screens    : ' + $screenCount + ' headings, ' + $routes.Count + ' routes, ' + $tableOrder.Count + ' tables mapped, ' + $fnOrder.Count + ' functions named in docs')
Write-Host ('  size       : ' + [math]::Round((Get-Item -LiteralPath $OutFile).Length / 1KB) + ' KB')
