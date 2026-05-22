<script lang="ts">
	import { onMount } from "svelte";
	import PdfViewer from "./PdfViewer.svelte";

	export let slug: string = "";
	export let title: string = "";
	export let htmlPath: string = "";
	export let pdfPath: string = "";
	export let hasPdf: boolean = true;
	export let student: string = "";

	type View = "html" | "pdf" | "split";
	type DocKind = "documento" | "solucionario";
	let view: View = hasPdf ? "split" : "html";

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
	let htmlKind: DocKind = "documento";
	$: displayedPdfPath = pdfKind === "solucionario" ? solucionarioPath : documentoPath;
	$: pdfAvailable = !!documentoPath;
	$: solucionarioAvailable = !!solucionarioPath;
	$: anyPdf = pdfAvailable || solucionarioAvailable;
	$: solucionarioHtmlAvailable = !!solucionarioHtmlPath;
	$: displayedHtmlPath = htmlKind === "solucionario" && solucionarioHtmlAvailable
		? solucionarioHtmlPath
		: documentoHtmlPath;

	const PDF_SERVER_BASE = "http://127.0.0.1:4501";
	const PDF_SERVER_URL = `${PDF_SERVER_BASE}/api/generate-pdf`;
	// Cache-bust por carga: evita que el navegador sirva versiones viejas del iframe
	// o del PDF cuando se regeneró el documento por fuera de esta pestaña.
	const CACHE_BUST = Date.now();

	// El sidecar Node de generación sólo existe en local. En producción (GitHub Pages,
	// dominio público) ocultamos la barra de generación y dejamos los PDFs ya commiteados.
	let isLocal: boolean = false;

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
		const docSidecar = isLocal && slug ? `${PDF_SERVER_BASE}/pdf/${slug}` : "";
		const solLocal = pdfPath ? deriveSolucionarioLocalPath(pdfPath) : "";
		const solSidecar = isLocal && slug ? `${PDF_SERVER_BASE}/pdf/${slug}/solucionario` : "";
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
	});

	function setView(v: View): void {
		view = v;
	}

	function openExternal(path: string): void {
		window.open(path, "_blank", "noopener");
	}

	let genError: string = "";

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

	$: shareLines = (() => {
		const lines: string[] = [];
		if (pdfAvailable) lines.push(`${title} — Documento: ${toAbsolute(documentoPath)}`);
		if (solucionarioAvailable) lines.push(`${title} — Solucionario: ${toAbsolute(solucionarioPath)}`);
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
		genError = "";
		try {
			const res = await fetch(PDF_SERVER_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ slug }),
			});
			const data = await res.json();
			if (!res.ok || !data.ok) {
				throw new Error(data.error || data.stderr || `HTTP ${res.status}`);
			}
			// Mostrar PDFs dentro del visor (no abrir nueva pestaña). Cache-bust por timestamp.
			const ts = Date.now();
			documentoPath = data.pdfUrl ? `${data.pdfUrl}?t=${ts}` : documentoPath;
			solucionarioPath = data.solucionarioUrl ? `${data.solucionarioUrl}?t=${ts}` : solucionarioPath;
			view = "split";
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
				genError = "No se pudo contactar el servidor de PDF. Ejecuta 'npm run pdf:server' en otra terminal.";
			} else {
				genError = msg;
			}
		} finally {
			generating = false;
		}
	}
</script>

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
			<button class="btn" on:click={() => openExternal(displayedHtmlPath)} title="Abrir HTML en pestaña nueva">⤴ HTML</button>
			{#if displayedPdfPath}
				<button class="btn" on:click={() => openExternal(displayedPdfPath)} title="Abrir PDF en pestaña nueva">⤴ PDF</button>
			{/if}
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
			title="Genera el PDF en el servidor (requiere 'npm run pdf:server' corriendo)"
		>
			{generating ? "Generando PDF…" : "🖨 Generar PDF"}
		</button>
		{#if genError}
			<span class="hint err">⚠ {genError}</span>
		{:else}
			<span class="hint">{ready ? "Marca el check y genera el PDF en el servidor." : "Cargando HTML…"}</span>
		{/if}
	</div>

	<div class="viewer-panes" class:split={view === "split"}>
		{#if view === "html" || view === "split"}
			<div class="pane">
				<div class="pane-header">
					<span class="tag">HTML</span>
					{#if solucionarioHtmlAvailable}
						<div class="seg sm">
							<button class="btn ghost" class:active={htmlKind === "documento"} on:click={() => (htmlKind = "documento")}>Documento</button>
							<button class="btn ghost" class:active={htmlKind === "solucionario"} on:click={() => (htmlKind = "solucionario")}>Solucionario</button>
						</div>
					{:else}
						<code>{documentoHtmlPath.split("/").pop()}</code>
					{/if}
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
				</div>
				{#key displayedPdfPath}
					<PdfViewer src={displayedPdfPath} title={`${title} — ${pdfKind === "solucionario" ? "Solucionario" : "Documento"}`} />
				{/key}
			</div>
		{/if}
	</div>
</div>

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
