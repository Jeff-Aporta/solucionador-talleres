<script lang="ts">
	/**
	 * Visor PDF basado en pdf.js (pdfjs-dist).
	 *
	 * Razón: el `<iframe>` / `<object>` nativos dependen del visor PDF del
	 * navegador y respetan la preferencia "Descargar PDF en vez de abrirlo".
	 * En navegadores embebidos (Simple Browser de VS Code, Playwright, etc.)
	 * directamente no existe ese plugin y la página queda vacía o pide descarga.
	 *
	 * pdf.js renderiza el documento a `<canvas>` por JS, garantizando vista
	 * inline en cualquier navegador. Sumamos `TextLayer` para que la selección
	 * y `Ctrl+F` queden alineados con lo visible.
	 */
	import { onMount, onDestroy, tick } from "svelte";
	import type {
		PDFDocumentProxy,
		PDFPageProxy,
		TextContent,
	} from "pdfjs-dist/types/src/display/api";

	export let src: string = "";
	export let title: string = "Documento PDF";

	let containerEl: HTMLDivElement;
	let pdfDoc: PDFDocumentProxy | null = null;
	let pageCount: number = 0;
	let currentPage: number = 1;
	let scale: number = 1.25;
	let loading: boolean = false;
	let errorMsg: string = "";
	let renderToken: number = 0;

	type PdfLib = typeof import("pdfjs-dist");
	let pdfjs: PdfLib | null = null;

	async function ensureLib(): Promise<PdfLib> {
		if (pdfjs) return pdfjs;
		const lib = await import("pdfjs-dist");
		const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
		lib.GlobalWorkerOptions.workerSrc = workerUrl;
		pdfjs = lib;
		return lib;
	}

	async function loadDocument(url: string): Promise<void> {
		if (!url) return;
		loading = true;
		errorMsg = "";
		const token = ++renderToken;
		try {
			const lib = await ensureLib();
			if (pdfDoc) {
				try { await pdfDoc.destroy(); } catch { /* ignore */ }
				pdfDoc = null;
			}
			const task = lib.getDocument({ url });
			const doc = await task.promise;
			if (token !== renderToken) {
				try { await doc.destroy(); } catch { /* ignore */ }
				return;
			}
			pdfDoc = doc;
			pageCount = doc.numPages;
			currentPage = 1;
			await tick();
			await renderAllPages();
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : String(e);
		} finally {
			if (token === renderToken) loading = false;
		}
	}

	async function renderAllPages(): Promise<void> {
		if (!pdfDoc || !containerEl) return;
		const token = renderToken;
		containerEl.innerHTML = "";
		for (let i = 1; i <= pdfDoc.numPages; i++) {
			if (token !== renderToken) return;
			const page = await pdfDoc.getPage(i);
			await renderPage(page, i);
		}
	}

	async function renderPage(page: PDFPageProxy, num: number): Promise<void> {
		if (!pdfjs || !containerEl) return;
		const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
		const viewport = page.getViewport({ scale: scale * dpr });
		const cssViewport = page.getViewport({ scale });

		const pageEl = document.createElement("div");
		pageEl.className = "pdf-page";
		pageEl.style.width = `${cssViewport.width}px`;
		pageEl.style.height = `${cssViewport.height}px`;
		pageEl.dataset.pageNumber = String(num);

		const canvas = document.createElement("canvas");
		canvas.width = viewport.width;
		canvas.height = viewport.height;
		canvas.style.width = `${cssViewport.width}px`;
		canvas.style.height = `${cssViewport.height}px`;
		pageEl.appendChild(canvas);

		const textLayerDiv = document.createElement("div");
		textLayerDiv.className = "textLayer";
		textLayerDiv.style.width = `${cssViewport.width}px`;
		textLayerDiv.style.height = `${cssViewport.height}px`;
		pageEl.appendChild(textLayerDiv);

		containerEl.appendChild(pageEl);

		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		await page.render({ canvasContext: ctx, viewport, canvas }).promise;

		try {
			const textContent: TextContent = await page.getTextContent();
			const TextLayer = (pdfjs as unknown as { TextLayer?: new (opts: {
				textContentSource: TextContent;
				container: HTMLElement;
				viewport: typeof cssViewport;
			}) => { render: () => Promise<void> } }).TextLayer;
			if (TextLayer) {
				const tl = new TextLayer({
					textContentSource: textContent,
					container: textLayerDiv,
					viewport: cssViewport,
				});
				await tl.render();
			}
		} catch { /* selección opcional */ }
	}

	function zoomIn(): void {
		scale = Math.min(scale + 0.25, 3);
		void renderAllPages();
	}
	function zoomOut(): void {
		scale = Math.max(scale - 0.25, 0.5);
		void renderAllPages();
	}
	function openExternal(): void {
		if (src) window.open(src, "_blank", "noopener");
	}

	$: if (src) void loadDocument(src);

	onMount(() => {
		if (src) void loadDocument(src);
	});

	onDestroy(() => {
		renderToken++;
		if (pdfDoc) {
			pdfDoc.destroy().catch(() => { /* ignore */ });
			pdfDoc = null;
		}
	});
</script>

<div class="pdf-shell">
	{#if !src}
		<div class="pdf-empty">Sin PDF disponible.</div>
	{:else}
		<div class="pdf-toolbar">
			<span class="pdf-info">{title}{pageCount ? ` · ${pageCount} pág.` : ""}</span>
			<div class="pdf-actions">
				<button class="pdf-btn" on:click={zoomOut} title="Reducir">−</button>
				<span class="pdf-zoom">{Math.round(scale * 100)}%</span>
				<button class="pdf-btn" on:click={zoomIn} title="Aumentar">+</button>
				<button class="pdf-btn" on:click={openExternal} title="Abrir en pestaña nueva">⤴</button>
			</div>
		</div>
		<div class="pdf-scroll">
			{#if loading}
				<div class="pdf-status">Cargando PDF…</div>
			{/if}
			{#if errorMsg}
				<div class="pdf-status err">⚠ {errorMsg}</div>
			{/if}
			<div class="pdf-pages" bind:this={containerEl}></div>
		</div>
	{/if}
</div>

<style>
	.pdf-shell {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: #1e293b;
		border-radius: 6px;
		overflow: hidden;
	}
	.pdf-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		background: #0f172a;
		color: #cbd5e1;
		font-size: 0.75rem;
		border-bottom: 1px solid #1e293b;
	}
	.pdf-info {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pdf-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.pdf-btn {
		background: #1e293b;
		color: #e2e8f0;
		border: 1px solid #334155;
		border-radius: 4px;
		padding: 0.15rem 0.5rem;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.pdf-btn:hover { background: #334155; }
	.pdf-zoom { min-width: 3.5ch; text-align: center; }
	.pdf-scroll {
		flex: 1;
		overflow: auto;
		background: #0b1220;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}
	.pdf-status {
		color: #94a3b8;
		font-size: 0.85rem;
		padding: 0.5rem;
	}
	.pdf-status.err { color: #f87171; }
	.pdf-pages {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		align-items: center;
	}
	:global(.pdf-page) {
		position: relative;
		background: white;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
	}
	:global(.pdf-page canvas) {
		display: block;
	}
	:global(.pdf-page .textLayer) {
		position: absolute;
		left: 0;
		top: 0;
		right: 0;
		bottom: 0;
		overflow: hidden;
		opacity: 0.25;
		line-height: 1;
		text-size-adjust: none;
		forced-color-adjust: none;
		transform-origin: 0 0;
		caret-color: black;
	}
	:global(.pdf-page .textLayer ::selection) {
		background: rgba(0, 100, 255, 0.35);
	}
	:global(.pdf-page .textLayer span),
	:global(.pdf-page .textLayer br) {
		color: transparent;
		position: absolute;
		white-space: pre;
		cursor: text;
		transform-origin: 0% 0%;
	}
	.pdf-empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #94a3b8;
		font-size: 0.9rem;
	}
</style>
