# solucionador-talleres · REMINGTON

Catálogo de trabajos universitarios en **Astro + Svelte 4**. Visualiza entregas (foros, tareas, evaluaciones, proyectos) con visor unificado HTML / PDF.

> Repo **público** · [Jeff-Aporta/solucionador-talleres](https://github.com/Jeff-Aporta/solucionador-talleres)

## Estructura

```
site/
  astro.config.ts
  package.json
  scripts/
    sync-assets.ps1         # Copia los HTML/PDF originales a public/works/<slug>/
  src/
    components/
      WorkViewer.svelte     # Visor con tabs HTML | HTML+PDF | PDF
    data/
      works.ts              # Manifiesto de trabajos (slug, curso, tipo, archivos)
    layouts/
      Layout.astro          # Shell común con header + nav por curso
    pages/
      index.astro                  # Catálogo principal agrupado por curso
      curso/[course].astro         # Listado por curso
      trabajo/[slug].astro         # Visor de un trabajo (HTML + PDF)
    styles/
      global.css            # Tema oscuro (mismo lenguaje visual que ISA-DOC)
```

## Setup

```powershell
cd site
npm install
npm run sync:assets    # copia HTML+PDF de cada trabajo a public/works/<slug>/
npm run dev            # http://localhost:4500
```

## Build estático

```powershell
npm run build
npm run preview
```

El output queda en `site/dist/` y es 100% estático (compatible con GitHub Pages, Netlify, Azure Static Web Apps, etc.).

## Agregar un trabajo nuevo

1. Coloca el HTML en la raíz del repo y el PDF en `pdf/`.
2. Añade una entrada en `src/data/works.ts` (`WORKS` array).
3. Añade la misma entrada en `scripts/sync-assets.ps1` (`$works`).
4. `npm run sync:assets && npm run dev`.
