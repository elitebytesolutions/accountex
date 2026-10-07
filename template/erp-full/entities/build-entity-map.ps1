<#
.SYNOPSIS
  Builds the Finsoft "Entity Map" viewer (index.html) from the edition's entity
  docs and SQL. PowerShell 5.1 compatible; no Node, no Docker.

.DESCRIPTION
  Layout (relative to this script, $PSScriptRoot = <edition>\entities):
    .\*.md (except README.md)        -> <script class="md">        (sorted)
    ..\database\schema\*.sql         -> <script class="ddl">       (sorted)
    ..\database\fk\*.sql             -> <script class="ddl">       (sorted)
    ..\database\views\*.sql          -> <script class="ddl">       (sorted)
    ..\database\api\*.sql            -> <script class="ddl">       (sorted; save / get / action functions)
    ..\..\erp-full\database\...      -> <script class="fulltables"> (Basic only)
    .\entity-map-template.html       -> template containing <!--DATA-->
    .\index.html                     -> output (UTF-8, no BOM)

  Text is embedded raw inside <script type="text/plain"> elements with two
  escapes the viewer reverses: "</script" -> "<\/script" and "<!--" -> "<\!--".

.PARAMETER Template
  Template path. Default: .\entity-map-template.html next to this script.

.PARAMETER OutFile
  Output path. Default: .\index.html next to this script.

.EXAMPLE
  powershell -NoProfile -File build-entity-map.ps1
  powershell -NoProfile -File build-entity-map.ps1 -Template C:\tmp\t.html -OutFile C:\tmp\out.html
#>
[CmdletBinding()]
param(
  [string]$Template,
  [string]$OutFile
)
$ErrorActionPreference = 'Stop'

$here = $PSScriptRoot
if (-not $here) { $here = Split-Path -Parent $MyInvocation.MyCommand.Path }
$editionRoot = Split-Path -Parent $here

$leaf = Split-Path -Leaf $editionRoot
if ($leaf -match 'basic') { $Edition = 'basic' } else { $Edition = 'full' }

if (-not $Template) { $Template = Join-Path $here 'entity-map-template.html' }
if (-not $OutFile) { $OutFile = Join-Path $here 'index.html' }

$utf8 = New-Object System.Text.UTF8Encoding($false)

function HtmlAttr([string]$s) {
  return $s.Replace('&', '&amp;').Replace('"', '&quot;').Replace('<', '&lt;').Replace('>', '&gt;')
}
function Read-Text([string]$path) {
  $t = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  if ($t.Length -gt 0 -and $t[0] -eq [char]0xFEFF) { $t = $t.Substring(1) }
  return $t
}
function Escape-Raw([string]$t) {
  # keep the raw-text <script> element intact; the viewer reverses both escapes
  $t = [regex]::Replace($t, '</(script)', '<\/$1', 'IgnoreCase')
  return $t.Replace('<!--', '<\!--')
}

$sb = New-Object System.Text.StringBuilder

# ---------------------------------------------------------------- entity docs
$dash = [string][char]0x2014
$ndash = [string][char]0x2013
$bt = [string][char]0x60
$headRx = New-Object System.Text.RegularExpressions.Regex (
  '^#{2,4}\s+.+?\s+(?:' + $dash + '|' + $ndash + '|-{1,2})\s+' + $bt + '[^' + $bt + ']+' + $bt + '\s*$'),
  ([System.Text.RegularExpressions.RegexOptions]::Multiline)

$mdFiles = @(Get-ChildItem -LiteralPath $here -Filter '*.md' |
  Where-Object { -not $_.PSIsContainer -and $_.Name -ine 'README.md' } | Sort-Object Name)
$headingCount = 0
foreach ($md in $mdFiles) {
  $text = Read-Text $md.FullName
  # per-line match: normalise CRLF so '$' anchors at line ends
  $headingCount += $headRx.Matches($text.Replace("`r`n", "`n")).Count
  [void]$sb.Append('<script type="text/plain" class="md" data-file="' + (HtmlAttr $md.Name) + '">')
  [void]$sb.Append((Escape-Raw $text))
  [void]$sb.Append("</script>`n")
}

# ---------------------------------------------------------------- SQL
$tableRx = '(?im)^\s*CREATE\s+TABLE\s+(?!.*\bPARTITION\s+OF\b)'
$viewRx = '(?im)^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+'
$funcRx = '(?im)^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+'
$sqlCounts = [ordered]@{ schema = 0; fk = 0; views = 0; api = 0 }
$tableCount = 0
$viewCount = 0
$funcCount = 0
foreach ($folder in @('schema', 'fk', 'views', 'api')) {
  $dir = Join-Path $editionRoot ('database\' + $folder)
  if (-not (Test-Path -LiteralPath $dir)) { continue }
  $files = @(Get-ChildItem -LiteralPath $dir -Filter '*.sql' | Where-Object { -not $_.PSIsContainer } | Sort-Object Name)
  foreach ($f in $files) {
    $text = Read-Text $f.FullName
    $sqlCounts[$folder]++
    $tableCount += ([regex]::Matches($text, $tableRx)).Count
    $viewCount += ([regex]::Matches($text, $viewRx)).Count
    if ($folder -eq 'api') { $funcCount += ([regex]::Matches($text, $funcRx)).Count }
    [void]$sb.Append('<script type="text/plain" class="ddl" data-file="' + (HtmlAttr ($folder + '/' + $f.Name)) + '">')
    [void]$sb.Append((Escape-Raw $text))
    [void]$sb.Append("</script>`n")
  }
}

# ---------------------------------------------------------------- Full-edition table list (Basic only)
$fullCount = -1
if ($Edition -eq 'basic') {
  $fullRoot = Join-Path (Split-Path -Parent $editionRoot) 'erp-full'
  $fullSchema = Join-Path $fullRoot 'database\schema'
  if (Test-Path -LiteralPath $fullSchema) {
    $names = New-Object 'System.Collections.Generic.SortedSet[string]' ([System.StringComparer]::Ordinal)
    # quoted, case-preserving names: CREATE TABLE "Sales"."SalesInvoices" -> Sales.SalesInvoices
    # (unquoted names are folded to lower case, as PostgreSQL does)
    $ident = '(?:"((?:[^"]|"")+)"|([A-Za-z_][A-Za-z0-9_$]*))'
    $fullTableRx = '(?im)^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?' + $ident + '\s*\.\s*' + $ident
    $fullViewRx = '(?im)^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?' + $ident + '\s*\.\s*' + $ident
    $sources = @(
      @{ Dir = $fullSchema; Rx = $fullTableRx },
      @{ Dir = (Join-Path $fullRoot 'database\views'); Rx = $fullViewRx }
    )
    foreach ($src in $sources) {
      if (-not (Test-Path -LiteralPath $src.Dir)) { continue }
      Get-ChildItem -LiteralPath $src.Dir -Filter '*.sql' | Where-Object { -not $_.PSIsContainer } | Sort-Object Name | ForEach-Object {
        $text = Read-Text $_.FullName
        foreach ($m in [regex]::Matches($text, $src.Rx)) {
          if ($m.Groups[1].Success) { $sch = $m.Groups[1].Value.Replace('""', '"') } else { $sch = $m.Groups[2].Value.ToLowerInvariant() }
          if ($m.Groups[3].Success) { $tbl = $m.Groups[3].Value.Replace('""', '"') } else { $tbl = $m.Groups[4].Value.ToLowerInvariant() }
          [void]$names.Add($sch + '.' + $tbl)
        }
      }
    }
    $fullCount = $names.Count
    [void]$sb.Append('<script type="text/plain" class="fulltables">')
    [void]$sb.Append((Escape-Raw ((@($names) -join "`n"))))
    [void]$sb.Append("</script>`n")
  }
}

# ---------------------------------------------------------------- assemble
if (-not (Test-Path -LiteralPath $Template)) { throw "Template not found: $Template" }
$tpl = Read-Text $Template
if ($tpl.IndexOf('<!--DATA-->') -lt 0) { throw "Template has no <!--DATA--> placeholder: $Template" }
$built = (Get-Date).ToString('yyyy-MM-dd HH:mm')
$html = $tpl.Replace('<!--DATA-->', $sb.ToString())
$html = $html.Replace('data-edition="__EDITION__"', 'data-edition="' + $Edition.ToUpper() + '"')
$html = $html.Replace('data-built="__BUILT__"', 'data-built="' + $built + '"')

$outDir = Split-Path -Parent $OutFile
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
[System.IO.File]::WriteAllText($OutFile, $html, $utf8)

Write-Host ('Entity map built: ' + $OutFile)
Write-Host ('  edition    : ' + $Edition.ToUpper())
Write-Host ('  md files   : ' + $mdFiles.Count + '  (' + $headingCount + ' screen headings)')
Write-Host ('  sql files  : schema ' + $sqlCounts['schema'] + ', fk ' + $sqlCounts['fk'] + ', views ' + $sqlCounts['views'] + ', api ' + $sqlCounts['api'] +
  '  (~' + $tableCount + ' CREATE TABLE, ' + $viewCount + ' CREATE VIEW, ' + $funcCount + ' api functions)')
if ($Edition -eq 'basic') {
  if ($fullCount -ge 0) { Write-Host ('  full list  : ' + $fullCount + ' Full-edition tables/views') }
  else { Write-Host '  full list  : (erp-full not found; skipped)' }
}
Write-Host ('  size       : ' + [math]::Round((Get-Item -LiteralPath $OutFile).Length / 1KB) + ' KB')
