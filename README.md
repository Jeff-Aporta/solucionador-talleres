# REMINGTON — Sitio de trabajos universitarios

Sitio estático en **Astro + Svelte 4** que cataloga las entregas (foros, tareas, evaluaciones, proyectos) y permite visualizar el HTML y el PDF de cada trabajo en un visor unificado (tabs HTML / HTML+PDF / PDF), siguiendo el mismo patrón de `ISA-DOC` (proyecto Patyia).

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
