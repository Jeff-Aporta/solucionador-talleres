"""
Genera PDFs imprimibles de todos los trabajos a partir de site/public/works/<slug>/index.html.

Flujo:
  1) Requiere que site/public/works/<slug>/ exista. Ejecuta 'npm run build' antes.
  2) Levanta un servidor HTTP temporal sirviendo site/public/.
  3) Por cada slug, abre Chrome headless en http://127.0.0.1:<port>/works/<slug>/index.html,
     inyecta el CSS @media print que elimina la pagina en blanco inicial y guarda el PDF en
     site/sources/<slug>/document.pdf. Tambien lo copia a site/public/works/<slug>/document.pdf
     para que este disponible inmediatamente.

Requisitos:
  pip install -r site/scripts/python/requirements.txt
  Google Chrome instalado.
"""

import base64
import contextlib
import http.server
import shutil
import socket
import socketserver
import sys
import threading
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options


HERE = Path(__file__).resolve().parent
SITE = HERE.parents[1]
ROOT = SITE.parent
SITE_PUBLIC = SITE / "public"
SOURCES = SITE / "sources"
PUBLIC_WORKS = SITE_PUBLIC / "works"

PRINT_FIX_CSS = """
@media print {
    html, body { margin: 0 !important; padding: 0 !important; }
    div[style*="page-break-before: always"]:empty,
    div[style*="page-break-before:always"]:empty { display: none !important; }
    /* Anti-clipping: box-sizing fuerza el borde dentro del ancho.
       NO inyectar @page aquí: sobreescribe @page :first { margin: 0 }
       y rompe portadas full-bleed. */
    table, .ex, .formula, .fig img, .fig svg, pre, code, blockquote {
        box-sizing: border-box !important;
    }
    table.data { outline: 1px solid #000; outline-offset: -1px; }
}
"""


def find_free_port() -> int:
    with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002
        pass


def start_server(directory: Path, port: int) -> socketserver.ThreadingTCPServer:
    def handler_factory(*args, **kwargs):
        return QuietHandler(*args, directory=str(directory), **kwargs)
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", port), handler_factory)
    th = threading.Thread(target=httpd.serve_forever, daemon=True)
    th.start()
    return httpd


def driver_options() -> Options:
    o = Options()
    o.add_argument("--headless=new")
    o.add_argument("--disable-gpu")
    o.add_argument("--no-sandbox")
    o.add_argument("--disable-dev-shm-usage")
    return o


def render_pdf(driver, url: str, out_path: Path) -> None:
    driver.get(url)
    driver.execute_script(
        "var s=document.createElement('style');s.textContent=arguments[0];document.head.appendChild(s);",
        PRINT_FIX_CSS,
    )
    driver.execute_script(
        "return Promise.all(Array.from(document.images).map(i=>"
        "i.complete?true:new Promise(r=>{i.onload=i.onerror=()=>r(true)})))"
    )
    cfg = {
        "landscape": False,
        "displayHeaderFooter": False,
        "printBackground": True,
        "preferCSSPageSize": True,
    }
    result = driver.execute_cdp_cmd("Page.printToPDF", cfg)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(base64.b64decode(result["data"]))


def main() -> int:
    if not PUBLIC_WORKS.exists():
        print("No existe site/public/works/. Ejecuta 'npm run build' primero.")
        return 1

    slugs = sorted(d.name for d in PUBLIC_WORKS.iterdir() if d.is_dir())
    if not slugs:
        print("No hay trabajos en site/public/works/.")
        return 1

    args = sys.argv[1:]
    force = False
    if "--force" in args or "-y" in args:
        force = True
        args = [a for a in args if a not in ("--force", "-y")]
    selected = args if args else slugs
    invalid = [s for s in selected if s not in slugs]
    if invalid:
        print(f"Slugs desconocidos: {', '.join(invalid)}")
        print(f"Disponibles: {', '.join(slugs)}")
        return 1
    targets = [s for s in slugs if s in selected]

    existing = [s for s in targets if (SOURCES / s / "document.pdf").exists()]
    overwrite = force
    if existing and not force:
        print("Ya existen PDFs para:")
        for s in existing:
            print(f"  - {s}")
        ans = input("\n¿Sobrescribir? (s/N): ").strip().lower()
        overwrite = ans == "s"

    port = find_free_port()
    httpd = start_server(SITE_PUBLIC, port)
    base_url = f"http://127.0.0.1:{port}"
    print(f"\nServidor local: {base_url}")

    driver = webdriver.Chrome(options=driver_options())
    ok = skipped = failed = 0
    try:
        for slug in targets:
            # ----- Documento principal -----
            dst_src = SOURCES / slug / "document.pdf"
            dst_pub = PUBLIC_WORKS / slug / "document.pdf"
            if dst_src.exists() and not overwrite:
                print(f"[skip] {slug}")
                skipped += 1
            else:
                url = f"{base_url}/works/{slug}/index.html"
                try:
                    print(f"[gen ] {slug}")
                    render_pdf(driver, url, dst_src)
                    shutil.copyfile(dst_src, dst_pub)
                    ok += 1
                except Exception as exc:  # noqa: BLE001
                    print(f"[fail] {slug}: {exc}")
                    failed += 1

            # ----- Solucionario (opcional) -----
            sol_html_pub = PUBLIC_WORKS / slug / "solucionario.html"
            if sol_html_pub.exists():
                sol_dst_src = SOURCES / slug / "solucionario.pdf"
                sol_dst_pub = PUBLIC_WORKS / slug / "solucionario.pdf"
                if sol_dst_src.exists() and not overwrite:
                    print(f"[skip] {slug} (solucionario)")
                    skipped += 1
                else:
                    sol_url = f"{base_url}/works/{slug}/solucionario.html"
                    try:
                        print(f"[gen ] {slug} (solucionario)")
                        render_pdf(driver, sol_url, sol_dst_src)
                        shutil.copyfile(sol_dst_src, sol_dst_pub)
                        ok += 1
                    except Exception as exc:  # noqa: BLE001
                        print(f"[fail] {slug} (solucionario): {exc}")
                        failed += 1
    finally:
        driver.quit()
        httpd.shutdown()

    print(f"\nGenerados: {ok}  Omitidos: {skipped}  Fallidos: {failed}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
