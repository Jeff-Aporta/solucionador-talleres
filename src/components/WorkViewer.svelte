<script lang="ts">
	import { onMount, tick } from "svelte";
	import { marked } from "marked";
	import renderMathInElement from "katex/contrib/auto-render";
	import PdfViewer from "./PdfViewer.svelte";

	export let slug: string = "";
	export let title: string = "";
	export let htmlPath: string = "";
	export let pdfPath: string = "";
	export let hasPdf: boolean = true;
	export let student: string = "";

	type View = "html" | "pdf" | "split";
	type DocKind = "documento" | "solucionario";
	type HtmlKind = "documento" | "solucionario" | "originales" | "markdown";
	let view: View = hasPdf ? "split" : "html";

	type Manifest = { slug: string; originals: string[]; markdown: string[] };
	let originals: string[] = [];
	let markdownFiles: string[] = [];
	let markdownActive: string = "";
	let markdownContent: string = "";
	let markdownLoading: boolean = false;
	let originalLightbox: string = "";

	let iframeDocEl: HTMLIFrameElement;
	let iframeSolEl: HTMLIFrameElement;
	let ready: boolean = false;
	let confirmed: boolean = false;
	let generating: boolean = false;

	// Paths efectivos por tipo (se reemplazan por URLs del sidecar tras generar).
	let documentoPath: string = pdfPath;
	let solucionarioPath: string = "";
	let documentoHtmlPath: string = htmlPath;
	let solucionarioHtmlPath: string = "";
	let pdfKind: DocKind = "documento";
	let htmlKind: HtmlKind = "documento";
	$: displayedPdfPath = pdfKind === "solucionario" ? solucionarioPath : documentoPath;
	$: pdfAvailable = !!documentoPath;
	$: solucionarioAvailable = !!solucionarioPath;
	$: anyPdf = pdfAvailable || solucionarioAvailable;
	$: solucionarioHtmlAvailable = !!solucionarioHtmlPath;
	$: originalsAvailable = originals.length > 0;
	$: markdownAvailable = markdownFiles.length > 0;
	$: displayedHtmlPath = htmlKind === "solucionario" && solucionarioHtmlAvailable
		? solucionarioHtmlPath
		: documentoHtmlPath;

	function worksBaseFromHtml(p: string): string {
		// /estudio/works/<slug>/index.html?... -> /estudio/works/<slug>/
		const clean = p.split("?")[0];
		return clean.replace(/index\.html$/, "");
	}

	function siteBaseFromHtml(p: string): string {
		// /estudio/works/<slug>/index.html -> /estudio
		const clean = p.split("?")[0];
		const idx = clean.indexOf("/works/");
		return idx >= 0 ? clean.slice(0, idx) : "";
	}

	$: htmlEndpoint = (() => {
		const sb = siteBaseFromHtml(htmlPath);
		if (htmlKind === "solucionario") return solucionarioHtmlPath;
		if (htmlKind === "originales") return `${sb}/originales/${slug}`;
		if (htmlKind === "markdown") {
			const file = markdownActive || markdownFiles[0] || "";
			const q = file ? `?file=${encodeURIComponent(file)}` : "";
			return `${sb}/markdown/${slug}${q}`;
		}
		return documentoHtmlPath;
	})();

	marked.setOptions({ gfm: true, breaks: false });

	function renderMarkdown(src: string): string {
		if (!src) return "";
		return marked.parse(src) as string;
	}

	let mdBodyEl: HTMLDivElement | undefined;
	async function renderMathIn(el: HTMLElement | undefined): Promise<void> {
		if (!el) return;
		await tick();
		try {
			renderMathInElement(el, {
				delimiters: [
					{ left: "$$", right: "$$", display: true },
					{ left: "$", right: "$", display: false },
					{ left: "\\(", right: "\\)", display: false },
					{ left: "\\[", right: "\\]", display: true },
				],
				throwOnError: false,
			});
		} catch {
			/* katex error: ignorar */
		}
	}

	async function loadMarkdown(name: string): Promise<void> {
		if (!name) return;
		markdownActive = name;
		markdownLoading = true;
		try {
			const base = worksBaseFromHtml(htmlPath);
			const r = await fetch(`${base}${name}?v=${CACHE_BUST}`);
			markdownContent = r.ok ? await r.text() : `# Error\nNo se pudo cargar ${name}.`;
		} catch (e) {
			markdownContent = `# Error\n${e instanceof Error ? e.message : String(e)}`;
		} finally {
			markdownLoading = false;
		}
	}

	$: markdownHtml = renderMarkdown(markdownContent);
	$: if (markdownHtml) renderMathIn(mdBodyEl);

	// Base de Astro (p. ej. "/estudio/"). Las rutas de PDF viven en el mismo servidor
	// de Astro durante `astro dev` vía integración; en `astro build` (gh-pages) no
	// existen y el cliente cae a un toast informativo en vez de un error rojo.
	const SITE_BASE = import.meta.env.BASE_URL || "/";
	const PDF_API_URL = `${SITE_BASE}api/generate-pdf`;
	const PDF_FILE_BASE = `${SITE_BASE}pdf`;
	// Cache-bust por carga: evita que el navegador sirva versiones viejas del iframe
	// o del PDF cuando se regeneró el documento por fuera de esta pestaña.
	const CACHE_BUST = Date.now();

	// La generación dinámica de PDF sólo existe en `astro dev`. En producción (GitHub
	// Pages) ocultamos la barra de generación; los PDFs ya commiteados se sirven como
	// estáticos desde public/works/<slug>/.
	let isLocal: boolean = false;

	let toastMsg: string = "";
	let toastTimer: ReturnType<typeof setTimeout> | null = null;
	function showToast(msg: string, ms = 4500): void {
		toastMsg = msg;
		if (toastTimer) clearTimeout(toastTimer);
		toastTimer = setTimeout(() => { toastMsg = ""; }, ms);
	}

	function withCacheBust(url: string): string {
		if (!url) return url;
		if (url.includes("?")) return url;
		return `${url}?v=${CACHE_BUST}`;
	}

	function deriveSolucionarioLocalPath(documentoLocal: string): string {
		// /works/<slug>/document.pdf -> /works/<slug>/solucionario.pdf
		return documentoLocal.replace(/document\.pdf(\?.*)?$/, "solucionario.pdf$1");
	}

	function deriveSolucionarioHtmlPath(documentoHtml: string): string {
		// /works/<slug>/index.html -> /works/<slug>/solucionario.html
		return documentoHtml.replace(/index\.html(\?.*)?$/, "solucionario.html$1");
	}

	async function probePdf(url: string): Promise<boolean> {
		try {
			const r = await fetch(url, { method: "HEAD" });
			return r.ok;
		} catch {
			return false;
		}
	}

	async function resolvePdfUrl(localPath: string, sidecarPath: string): Promise<string> {
		if (localPath && await probePdf(localPath)) return localPath;
		if (await probePdf(sidecarPath)) return sidecarPath;
		return "";
	}

	// Resuelve documento.pdf y solucionario.pdf desde estático o sidecar, y muestra split si hay.
	onMount(async () => {
		const host = typeof window !== "undefined" ? window.location.hostname : "";
		isLocal = host === "localhost" || host === "127.0.0.1" || host === "";
		const docSidecar = isLocal && slug ? `${PDF_FILE_BASE}/${slug}` : "";
		const solLocal = pdfPath ? deriveSolucionarioLocalPath(pdfPath) : "";
		const solSidecar = isLocal && slug ? `${PDF_FILE_BASE}/${slug}/solucionario` : "";
		const solHtmlLocal = htmlPath ? deriveSolucionarioHtmlPath(htmlPath) : "";

		const [docResolved, solResolved, solHtmlOk] = await Promise.all([
			resolvePdfUrl(pdfPath, docSidecar),
			resolvePdfUrl(solLocal, solSidecar),
			solHtmlLocal ? probePdf(solHtmlLocal) : Promise.resolve(false),
		]);

		documentoPath = withCacheBust(docResolved);
		solucionarioPath = withCacheBust(solResolved);
		if (solHtmlOk) solucionarioHtmlPath = withCacheBust(solHtmlLocal);
		documentoHtmlPath = withCacheBust(htmlPath);
		if (documentoPath || solucionarioPath) view = "split";
		if (!documentoPath && solucionarioPath) pdfKind = "solucionario";

		// Carga del manifest (originales + markdown)
		if (htmlPath) {
			try {
				const base = worksBaseFromHtml(htmlPath);
				const r = await fetch(`${base}manifest.json?v=${CACHE_BUST}`);
				if (r.ok) {
					const m: Manifest = await r.json();
					originals = Array.isArray(m.originals) ? m.originals : [];
					markdownFiles = Array.isArray(m.markdown) ? m.markdown : [];
				}
			} catch {
				/* manifest ausente: ignorar */
			}
		}
	});

	function setView(v: View): void {
		view = v;
	}

	function openExternal(path: string): void {
		window.open(path, "_blank", "noopener");
	}

	let shareOpen: boolean = false;
	let copied: boolean = false;
	let copyError: string = "";

	function toAbsolute(path: string): string {
		if (!path) return "";
		const clean = path.split("?")[0];
		if (/^https?:\/\//i.test(clean)) return clean;
		if (typeof window === "undefined") return clean;
		return new URL(clean, window.location.origin).href;
	}

	$: imgsEndpoint = `${SITE_BASE}originales/${slug}`;
	$: mdEndpoint = (() => {
		const file = markdownActive || markdownFiles[0] || "";
		const q = file ? `?file=${encodeURIComponent(file)}` : "";
		return `${SITE_BASE}markdown/${slug}${q}`;
	})();

	$: shareLines = (() => {
		const lines: string[] = [];
		const pageUrl = typeof window !== "undefined" ? window.location.href.split("#")[0] : "";
		if (pageUrl) lines.push(`${title} — Página: ${pageUrl}`);
		if (pdfAvailable) lines.push(`${title} — Documento: ${toAbsolute(documentoPath)}`);
		if (solucionarioAvailable) lines.push(`${title} — Solucionario: ${toAbsolute(solucionarioPath)}`);
		if (originalsAvailable) lines.push(`${title} — Imgs: ${toAbsolute(imgsEndpoint)}`);
		if (markdownAvailable) lines.push(`${title} — Markdown: ${toAbsolute(mdEndpoint)}`);
		return lines;
	})();
	$: shareText = shareLines.join("\n");

	async function copyShare(): Promise<void> {
		copyError = "";
		try {
			await navigator.clipboard.writeText(shareText);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch (e) {
			copyError = e instanceof Error ? e.message : String(e);
		}
	}

	async function openShare(): Promise<void> {
		shareOpen = true;
		copied = false;
		copyError = "";
		await copyShare();
	}

	function closeShare(): void {
		shareOpen = false;
	}

	function handleIframeLoad(): void {
		ready = true;
	}

	async function generatePdf(): Promise<void> {
		if (!slug) return;
		generating = true;
		try {
			const res = await fetch(PDF_API_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ slug }),
			});
			if (res.status === 404) {
				showToast("Generador de PDF no disponible (modo estático). Mostrando PDFs precompilados.");
				return;
			}
			const data = await res.json();
			if (!res.ok || !data.ok) {
				throw new Error(data.error || data.stderr || `HTTP ${res.status}`);
			}
			const ts = Date.now();
			const toAbs = (u: string): string => (u.startsWith("http") || u.startsWith("/")) ? u : `${SITE_BASE}${u}`;
			documentoPath = data.pdfUrl ? `${toAbs(data.pdfUrl)}?t=${ts}` : documentoPath;
			solucionarioPath = data.solucionarioUrl ? `${toAbs(data.solucionarioUrl)}?t=${ts}` : solucionarioPath;
			view = "split";
			showToast("PDF generado correctamente.");
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
				showToast("No hay servidor de PDF disponible. Ejecuta el sitio con `npm run dev` para regenerar.");
			} else {
				showToast(`Error generando PDF: ${msg}`);
			}
		} finally {
			generating = false;
		}
	}
</script>

<svelte:head>
	<link rel="stylesheet" href={`${SITE_BASE}katex/katex.min.css`} />
</svelte:head>

<div class="viewer">
	<div class="viewer-toolbar">
		<div class="viewer-title">
			<span class="back"><a href="../">← Volver</a></span>
			<h1>{title}</h1>
			{#if student}
				<span class="student">👤 {student}</span>
			{/if}
		</div>
		<div class="viewer-actions">
			<div class="seg">
				<button class="btn ghost" class:active={view === "html"} on:click={() => setView("html")}>HTML</button>
				{#if anyPdf}
					<button class="btn ghost" class:active={view === "split"} on:click={() => setView("split")}>HTML + PDF</button>
					<button class="btn ghost" class:active={view === "pdf"} on:click={() => setView("pdf")}>PDF</button>
				{/if}
			</div>
			{#if shareLines.length > 0}
				<button class="btn" on:click={openShare} title="Ver y copiar enlaces de PDF" aria-label="Ver enlaces">👁</button>
			{/if}
		</div>
	</div>

	<div class="gen-bar" class:hidden={!isLocal}>
		<label class="chk" class:disabled={!ready}>
			<input type="checkbox" bind:checked={confirmed} disabled={!ready} />
			<span>El HTML quedó correcto</span>
		</label>
		<button
			class="btn primary"
			on:click={generatePdf}
			disabled={!confirmed || generating || !ready}
			title="Genera el PDF en el servidor de desarrollo"
		>
			{generating ? "Generando PDF…" : "🖨 Generar PDF"}
		</button>
		<span class="hint">{ready ? "Marca el check y genera el PDF." : "Cargando HTML…"}</span>
	</div>

	<div class="viewer-panes" class:split={view === "split"}>
		{#if view === "html" || view === "split"}
			<div class="pane">
				<div class="pane-header">
					<span class="tag">HTML</span>
					<div class="seg sm">
						<button class="btn ghost" class:active={htmlKind === "documento"} on:click={() => (htmlKind = "documento")}>Documento</button>
						{#if solucionarioHtmlAvailable}
							<button class="btn ghost" class:active={htmlKind === "solucionario"} on:click={() => (htmlKind = "solucionario")}>Solucionario</button>
						{/if}
						{#if originalsAvailable}
							<button class="btn ghost" class:active={htmlKind === "originales"} on:click={() => (htmlKind = "originales")}>Imgs ({originals.length})</button>
						{/if}
						{#if markdownAvailable}
							<button
								class="btn ghost"
								class:active={htmlKind === "markdown"}
								on:click={() => { htmlKind = "markdown"; if (!markdownActive) loadMarkdown(markdownFiles[0]); }}
							>Markdown</button>
						{/if}
					</div>
					<button
						class="btn ghost sm pane-open"
						title="Abrir en una pestaña nueva"
						aria-label="Abrir en pestaña nueva"
						on:click={() => openExternal(htmlEndpoint)}
						disabled={!htmlEndpoint}
					><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13 3v2h4.59l-7.3 7.29 1.42 1.42 7.29-7.3V11h2V3zM19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7z"/></svg></button>
				</div>
				<div class="html-stack">
					<iframe
						bind:this={iframeDocEl}
						src={documentoHtmlPath}
						title={`HTML — ${title}`}
						class:hidden={htmlKind !== "documento"}
						on:load={handleIframeLoad}
					></iframe>
					{#if solucionarioHtmlAvailable}
						<iframe
							bind:this={iframeSolEl}
							src={solucionarioHtmlPath}
							title={`Solucionario — ${title}`}
							class:hidden={htmlKind !== "solucionario"}
						></iframe>
					{/if}
					{#if originalsAvailable}
						<div class="originals" class:hidden={htmlKind !== "originales"}>
							{#each originals as fname}
								<figure class="orig-item">
									<button class="orig-btn" on:click={() => (originalLightbox = `${worksBaseFromHtml(htmlPath)}originals/${fname}`)} title={fname}>
										<img src={`${worksBaseFromHtml(htmlPath)}originals/${fname}`} alt={fname} loading="lazy" />
									</button>
									<figcaption>{fname}</figcaption>
								</figure>
							{/each}
						</div>
					{/if}
					{#if markdownAvailable}
						<div class="markdown-pane" class:hidden={htmlKind !== "markdown"}>
							{#if markdownFiles.length > 1}
								<div class="md-tabs">
									{#each markdownFiles as mf}
										<button class="btn ghost sm" class:active={markdownActive === mf} on:click={() => loadMarkdown(mf)}>{mf}</button>
									{/each}
								</div>
							{/if}
							<div class="md-body" bind:this={mdBodyEl}>
								{#if markdownLoading}
									<p class="hint">Cargando…</p>
								{:else}
									{@html markdownHtml}
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}
		{#if anyPdf && (view === "pdf" || view === "split")}
			<div class="pane">
				<div class="pane-header">
					<span class="tag">PDF</span>
					{#if pdfAvailable && solucionarioAvailable}
						<div class="seg sm">
							<button class="btn ghost" class:active={pdfKind === "documento"} on:click={() => (pdfKind = "documento")}>Documento</button>
							<button class="btn ghost" class:active={pdfKind === "solucionario"} on:click={() => (pdfKind = "solucionario")}>Solucionario</button>
						</div>
					{:else}
						<code>{displayedPdfPath.split("/").pop()?.split("?")[0]}</code>
					{/if}
					<button
						class="btn ghost sm pane-open"
						title="Abrir PDF en una pestaña nueva"
						aria-label="Abrir PDF en pestaña nueva"
						on:click={() => openExternal(displayedPdfPath)}
						disabled={!displayedPdfPath}
					><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13 3v2h4.59l-7.3 7.29 1.42 1.42 7.29-7.3V11h2V3zM19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7z"/></svg></button>
				</div>
				{#key displayedPdfPath}
					<PdfViewer src={displayedPdfPath} title={`${title} — ${pdfKind === "solucionario" ? "Solucionario" : "Documento"}`} />
				{/key}
			</div>
		{/if}
	</div>
</div>

{#if toastMsg}
	<div class="toast" role="status" aria-live="polite">{toastMsg}</div>
{/if}

{#if originalLightbox}
	<div class="lightbox" on:click={() => (originalLightbox = "")} role="presentation">
		<img src={originalLightbox} alt="Original" />
		<button class="btn ghost lb-close" on:click|stopPropagation={() => (originalLightbox = "")} aria-label="Cerrar">✕</button>
	</div>
{/if}

{#if shareOpen}
	<div class="share-overlay" on:click={closeShare} role="presentation">
		<div class="share-modal" on:click|stopPropagation role="dialog" aria-modal="true" aria-label="Enlaces de PDF">
			<div class="share-head">
				<h3>Enlaces de PDF</h3>
				<button class="btn ghost share-close" on:click={closeShare} aria-label="Cerrar">✕</button>
			</div>
			<ul class="share-list">
				{#each shareLines as line}
					<li><code>{line}</code></li>
				{/each}
			</ul>
			<div class="share-foot">
				{#if copyError}
					<span class="hint err">⚠ {copyError}</span>
				{:else if copied}
					<span class="hint ok">✓ Copiado al portapapeles</span>
				{:else}
					<span class="hint">Listo para copiar.</span>
				{/if}
				<button class="btn primary" on:click={copyShare}>{copied ? "✓ Copiado" : "📋 Copiar"}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.viewer {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 0;
		height: calc(100dvh - 110px);
	}

	.viewer-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: var(--is-bg-secondary);
		border-bottom: 1px solid var(--is-b-color);
	}

	.viewer-title {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.viewer-title h1 {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
	}
	.back a {
		font-size: 0.75rem;
		color: var(--is-color-muted);
	}
	.student {
		font-size: 0.75rem;
		color: var(--is-color-muted);
	}

	.viewer-actions {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.seg {
		display: inline-flex;
		gap: 0;
		background: var(--is-bg-readonly);
		border: 1px solid var(--is-b-color);
		border-radius: var(--is-radius-sm);
		overflow: hidden;
	}
	.seg .btn { border-radius: 0; border: none; background: transparent; }
	.seg .btn.active { background: var(--is-primary); color: white; }
	.seg.sm .btn { padding: 0.18rem 0.55rem; font-size: 0.75rem; }

	.gen-bar {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		flex-wrap: wrap;
		padding: 0.55rem 1rem;
		background: var(--is-bg-elevated);
		border-bottom: 1px solid var(--is-b-color);
		font-size: 0.85rem;
	}
	.gen-bar.hidden { display: none; }
	.chk {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		cursor: pointer;
		user-select: none;
	}
	.chk.disabled { opacity: 0.5; cursor: not-allowed; }
	.chk input { width: 16px; height: 16px; accent-color: var(--is-primary); cursor: pointer; }
	.btn.primary {
		background: var(--is-primary);
		color: white;
		border-color: var(--is-primary);
	}
	.btn.primary:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.hint { color: var(--is-color-muted); font-size: 0.75rem; }
	.hint.err { color: #f87171; }

	.viewer-panes {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		gap: 1px;
		background: var(--is-b-color);
	}
	.pane {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		background: var(--is-bg-primary);
	}
	.pane-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		background: var(--is-bg-elevated);
		border-bottom: 1px solid var(--is-b-color);
		font-size: 0.75rem;
		color: var(--is-color-muted);
	}
	.pane-header code {
		font-family: var(--is-font-mono);
		font-size: 0.7rem;
		color: var(--is-color);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pane-header .pane-open {
		margin-left: auto;
		font-size: 0.85rem;
		padding: 0.18rem 0.55rem;
	}
	iframe {
		flex: 1 1 auto;
		width: 100%;
		border: none;
		background: white;
	}
	.html-stack {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
	}
	.html-stack iframe {
		position: absolute;
		inset: 0;
		height: 100%;
	}
	.html-stack iframe.hidden {
		visibility: hidden;
		pointer-events: none;
	}

	.originals,
	.markdown-pane {
		position: absolute;
		inset: 0;
		overflow: auto;
		background: var(--is-bg-primary);
		padding: 0.9rem;
	}
	.originals.hidden,
	.markdown-pane.hidden {
		visibility: hidden;
		pointer-events: none;
	}
	.originals {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 0.75rem;
		align-content: start;
	}
	.orig-item {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		background: var(--is-bg-elevated);
		border: 1px solid var(--is-b-color);
		border-radius: 8px;
		padding: 0.4rem;
	}
	.orig-btn {
		background: transparent;
		border: 0;
		padding: 0;
		cursor: zoom-in;
		display: block;
	}
	.orig-btn img {
		width: 100%;
		height: 140px;
		object-fit: cover;
		border-radius: 6px;
		display: block;
	}
	.orig-item figcaption {
		font-size: 0.7rem;
		color: var(--is-color-muted);
		text-align: center;
		word-break: break-all;
	}

	.markdown-pane .md-tabs {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin-bottom: 0.6rem;
	}
	.markdown-pane .md-tabs .btn.active {
		background: var(--is-primary);
		color: white;
		border-color: var(--is-primary);
	}
	.md-body {
		color: var(--is-color);
		font-size: 0.92rem;
		line-height: 1.55;
		max-width: 80ch;
	}
	.md-body :global(h1) { font-size: 1.4rem; margin: 0.4rem 0 0.6rem; }
	.md-body :global(h2) { font-size: 1.15rem; margin: 1rem 0 0.4rem; color: var(--is-primary); }
	.md-body :global(h3) { font-size: 1rem; margin: 0.8rem 0 0.3rem; }
	.md-body :global(p)  { margin: 0.4rem 0; }
	.md-body :global(ul),
	.md-body :global(ol) { padding-left: 1.4rem; margin: 0.3rem 0; }
	.md-body :global(li) { margin: 0.15rem 0; }
	.md-body :global(code) {
		background: var(--is-bg-elevated);
		border: 1px solid var(--is-b-color);
		border-radius: 4px;
		padding: 0.05rem 0.3rem;
		font-size: 0.85em;
	}
	.md-body :global(pre.md-code) {
		background: var(--is-bg-elevated);
		border: 1px solid var(--is-b-color);
		border-radius: 6px;
		padding: 0.6rem 0.8rem;
		overflow: auto;
	}
	.md-body :global(pre.md-code code) {
		background: transparent;
		border: 0;
		padding: 0;
	}
	.md-body :global(a) { color: var(--is-primary); }

	.toast {
		position: fixed;
		left: 50%;
		bottom: 1.5rem;
		transform: translateX(-50%);
		background: var(--is-bg-elevated);
		color: var(--is-color);
		border: 1px solid var(--is-b-color-strong);
		padding: 0.6rem 1rem;
		border-radius: var(--is-radius);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
		font-size: 0.85rem;
		z-index: 1200;
		max-width: min(90vw, 480px);
		text-align: center;
	}

	.lightbox {
		position: fixed;
		inset: 0;
		background: rgba(5, 11, 24, 0.88);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1100;
		padding: 1.5rem;
		cursor: zoom-out;
	}
	.lightbox img {
		max-width: 95vw;
		max-height: 95vh;
		object-fit: contain;
		border-radius: 8px;
		box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
	}
	.lb-close {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: rgba(0, 0, 0, 0.4);
		color: white;
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	@media (max-width: 900px) {
		.viewer-panes.split {
			flex-direction: column;
		}
	}

	.share-overlay {
		position: fixed;
		inset: 0;
		background: rgba(5, 11, 24, 0.72);
		backdrop-filter: blur(2px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.share-modal {
		background: var(--is-bg-elevated);
		border: 1px solid var(--is-b-color);
		border-radius: 10px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		width: min(640px, 100%);
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.share-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.65rem 0.9rem;
		border-bottom: 1px solid var(--is-b-color);
	}

	.share-head h3 {
		margin: 0;
		font-size: 0.95rem;
		color: var(--is-color);
	}

	.share-close {
		font-size: 0.9rem;
		padding: 0.15rem 0.5rem;
	}

	.share-list {
		list-style: none;
		margin: 0;
		padding: 0.75rem 0.9rem;
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.share-list li code {
		display: block;
		font-size: 0.78rem;
		color: var(--is-color);
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--is-b-color);
		border-radius: 6px;
		padding: 0.5rem 0.6rem;
		word-break: break-all;
		white-space: pre-wrap;
	}

	.share-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.65rem 0.9rem;
		border-top: 1px solid var(--is-b-color);
	}

	.share-foot .hint.ok {
		color: #5fd38a;
	}
</style>
