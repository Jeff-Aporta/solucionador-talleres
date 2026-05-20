# Sincroniza site/sources/<slug>/{index.html,document.pdf} -> site/public/works/<slug>/

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$siteRoot = Resolve-Path (Join-Path $here "..")
$sourcesDir = Join-Path $siteRoot "sources"
$publicWorks = Join-Path $siteRoot "public\works"

if (-not (Test-Path $sourcesDir)) { Write-Error "No existe $sourcesDir"; exit 1 }
if (-not (Test-Path $publicWorks)) { New-Item -ItemType Directory -Path $publicWorks | Out-Null }

function Rewrite-AssetPaths {
	param([string]$Path)
	$bytes = [System.IO.File]::ReadAllBytes($Path)
	$utf8 = New-Object System.Text.UTF8Encoding($false)
	$text = $utf8.GetString($bytes)
	# Reescribe paths relativos `imgs/...` a `../../imgs/...` para que funcionen
	# tanto en raíz (/works/<slug>/index.html → /imgs/) como bajo un base path
	# (/estudio/works/<slug>/index.html → /estudio/imgs/) en GitHub Pages.
	$pattern = '(?i)(\b(?:src|href|poster)\s*=\s*)(["''])(imgs/)'
	$rewritten = [System.Text.RegularExpressions.Regex]::Replace($text, $pattern, '$1$2../../imgs/')
	if ($rewritten -ne $text) {
		[System.IO.File]::WriteAllBytes($Path, $utf8.GetBytes($rewritten))
		return $true
	}
	return $false
}

$copied = 0
$rewritten = 0
$missing = @()
$slugs = Get-ChildItem -Path $sourcesDir -Directory | Where-Object { $_.Name -notmatch '^_' }
foreach ($s in $slugs) {
	$slug = $s.Name
	$src = $s.FullName
	$dst = Join-Path $publicWorks $slug
	if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst | Out-Null }

	$htmlSrc = Join-Path $src "index.html"
	$pdfSrc  = Join-Path $src "document.pdf"
	$solHtmlSrc = Join-Path $src "solucionario.html"
	$solPdfSrc  = Join-Path $src "solucionario.pdf"

	if (Test-Path -LiteralPath $htmlSrc) {
		$dstHtml = Join-Path $dst "index.html"
		Copy-Item -LiteralPath $htmlSrc -Destination $dstHtml -Force
		if (Rewrite-AssetPaths -Path $dstHtml) { $rewritten++ }
		$copied++
	} else {
		$missing += "[$slug] index.html"
	}

	if (Test-Path -LiteralPath $pdfSrc) {
		Copy-Item -LiteralPath $pdfSrc -Destination (Join-Path $dst "document.pdf") -Force
		$copied++
	}

	if (Test-Path -LiteralPath $solHtmlSrc) {
		$dstSolHtml = Join-Path $dst "solucionario.html"
		Copy-Item -LiteralPath $solHtmlSrc -Destination $dstSolHtml -Force
		if (Rewrite-AssetPaths -Path $dstSolHtml) { $rewritten++ }
		$copied++
	}

	if (Test-Path -LiteralPath $solPdfSrc) {
		Copy-Item -LiteralPath $solPdfSrc -Destination (Join-Path $dst "solucionario.pdf") -Force
		$copied++
	}
}

Write-Host "HTML reescritos:   $rewritten"
Write-Host "Archivos copiados: $copied"
if ($missing.Count -gt 0) {
	Write-Warning "Faltantes:"
	$missing | ForEach-Object { Write-Warning "  $_" }
	exit 1
}
