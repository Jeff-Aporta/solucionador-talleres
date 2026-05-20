<script lang="ts">
	/**
	 * Visor PDF nativo del navegador.
	 *
	 * Antes us\u00e1bamos pdf.js con canvas + capa de texto invisible superpuesta.
	 * Esa estrategia tiene dos problemas inherentes:
	 *   1) El texto seleccionable est\u00e1 desalineado respecto al renderizado visual.
	 *   2) Lo que el usuario selecciona/copia NO es necesariamente lo que ve.
	 *
	 * El visor nativo de Chrome / Edge / Firefox renderiza las fuentes embebidas
	 * directamente como texto: selecci\u00f3n, b\u00fasqueda (Ctrl+F), copy/paste y
	 * accesibilidad son WYSIWYG por construcci\u00f3n.
	 */
	export let src: string = "";
	export let title: string = "Documento PDF";
</script>

<div class="pdf-shell">
	{#if src}
		<iframe
			class="pdf-frame"
			src={src + (src.includes("#") ? "" : "#view=FitH")}
			{title}
			loading="lazy"
		></iframe>
	{:else}
		<div class="pdf-empty">Sin PDF disponible.</div>
	{/if}
</div>

<style>
	.pdf-shell {
		width: 100%;
		height: 100%;
		display: flex;
		background: #1e293b;
		border-radius: 6px;
		overflow: hidden;
	}
	.pdf-frame {
		flex: 1;
		width: 100%;
		height: 100%;
		border: 0;
		background: #1e293b;
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
