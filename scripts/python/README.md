# Scripts Python

Automatizaciones que dependen de la estructura de `site/`.

## Instalación

```powershell
pip install -r site/scripts/python/requirements.txt
```

Requiere Google Chrome instalado (Selenium usa `chromedriver` autoadministrado).

## Generar PDFs en lote

Genera `document.pdf` para cada slug bajo `site/sources/<slug>/` imprimiendo el HTML servido
en `site/public/works/<slug>/index.html`. Inyecta el CSS de impresión que elimina la página en
blanco inicial. Copia el PDF resultante también a `site/public/works/<slug>/document.pdf`.

```powershell
# Asegúrate de tener el sitio construido:
cd site
npm run build

# Genera todos:
npm run pdf:gen

# Genera solo unos:
npm run pdf:gen -- electronica-tarea-1 fisica-taller-maria
```

## Generar desde el navegador (botón "Generar PDF")

El botón "🖨 Generar PDF" del visor (`/trabajo/<slug>`) llama a un sidecar HTTP
(`scripts/pdf-server.mjs`, puerto 4501) que ejecuta `generar_pdfs.py --force <slug>`.

Flujo en local:

```powershell
# Terminal 1 — sidecar Node (puente HTTP → Python)
cd site
npm run pdf:server     # http://127.0.0.1:4501

# Terminal 2 — sitio Astro
cd site
npm run dev            # o: npm run preview, http://localhost:4500
```

En el navegador: abre `/trabajo/<slug>`, marca el check y presiona "🖨 Generar PDF".
El sidecar:

1. Recibe `POST /api/generate-pdf { slug }`.
2. Lanza `python ./scripts/python/generar_pdfs.py --force <slug>`.
3. Devuelve `{ ok, pdfUrl }` y la pestaña abre el PDF generado.

El flag `--force` evita el prompt interactivo de sobrescritura (necesario al ser
disparado desde un proceso no interactivo).

## Firmar dibujos (marca de agua)

Recorre `site/scripts/python/dibujos/input/` y guarda copias con la firma de
`site/scripts/python/dibujos/firma.png` en `dibujos/output/`.

```powershell
npm run dibujos:firma
```
