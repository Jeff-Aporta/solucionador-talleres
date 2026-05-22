// Integración de Astro que añade endpoints de generación de PDF SOLO en `astro dev`.
// Reemplaza el sidecar `pdf-server.mjs`: las rutas viven en el mismo servidor de Astro,
// así que no hace falta levantar un segundo proceso ni preocuparse por CORS.
//
// Endpoints expuestos (relativos al base de Astro, p. ej. `/estudio/`):
//   POST /api/generate-pdf   { slug } -> ejecuta `generar_pdfs.py --force <slug>`
//   GET  /pdf/<slug>                  -> devuelve public/works/<slug>/document.pdf
//   GET  /pdf/<slug>/solucionario     -> devuelve public/works/<slug>/solucionario.pdf
//
// En `astro build` (gh-pages) NO se registra middleware; las rutas no existen y el
// cliente lo detecta para mostrar un toast informativo sin romper la página.

import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, "..");
const PY_SCRIPT = path.join(__dirname, "python", "generar_pdfs.py");

function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (c) => chunks.push(c));
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

function json(res, status, body) {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json");
	res.end(JSON.stringify(body));
}

function runPython(slug) {
	return new Promise((resolve) => {
		const proc = spawn("python", [PY_SCRIPT, "--force", slug], {
			cwd: SITE_ROOT,
			windowsHide: true,
		});
		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (d) => { stdout += d; });
		proc.stderr.on("data", (d) => { stderr += d; });
		proc.on("close", (code) => resolve({ code, stdout, stderr }));
		proc.on("error", (err) => resolve({ code: -1, stdout, stderr: String(err) }));
	});
}

function servePdf(res, slug, kind) {
	if (!/^[a-z0-9-]+$/.test(slug)) return json(res, 400, { error: "slug inválido" });
	const fileName = kind === "solucionario" ? "solucionario.pdf" : "document.pdf";
	const pdfPath = path.join(SITE_ROOT, "public", "works", slug, fileName);
	if (!fs.existsSync(pdfPath)) return json(res, 404, { error: "PDF no generado" });
	res.statusCode = 200;
	res.setHeader("Content-Type", "application/pdf");
	res.setHeader("Content-Disposition", `inline; filename="${slug}-${fileName}"`);
	fs.createReadStream(pdfPath).pipe(res);
}

async function handleGenerate(req, res) {
	let slug = "";
	try {
		const body = await readBody(req);
		slug = (JSON.parse(body || "{}").slug ?? "").trim();
	} catch {
		return json(res, 400, { error: "JSON inválido" });
	}
	if (!/^[a-z0-9-]+$/.test(slug)) return json(res, 400, { error: "slug inválido" });
	const indexHtml = path.join(SITE_ROOT, "public", "works", slug, "index.html");
	if (!fs.existsSync(indexHtml)) {
		return json(res, 404, { error: `No existe public/works/${slug}/index.html. Ejecuta 'npm run sync:assets' primero.` });
	}
	console.log(`[pdf-dev] generando ${slug}...`);
	const result = await runPython(slug);
	const ok = result.code === 0;
	console.log(`[pdf-dev] ${slug} -> code=${result.code}`);
	if (!ok) console.log(result.stderr.slice(0, 2000));
	const hasSolucionario = fs.existsSync(path.join(SITE_ROOT, "public", "works", slug, "solucionario.pdf"));
	json(res, ok ? 200 : 500, {
		ok,
		slug,
		pdfUrl: `pdf/${slug}`,
		solucionarioUrl: hasSolucionario ? `pdf/${slug}/solucionario` : null,
		stdout: result.stdout,
		stderr: result.stderr,
	});
}

export default function pdfDevIntegration() {
	return {
		name: "pdf-dev",
		hooks: {
			"astro:server:setup": ({ server }) => {
				server.middlewares.use((req, res, next) => {
					const rawUrl = req.url || "";
					const url = rawUrl.split("?")[0];

					if (req.method === "POST" && /\/api\/generate-pdf$/.test(url)) {
						handleGenerate(req, res);
						return;
					}

					const m = url.match(/\/pdf\/([a-z0-9-]+)(?:\/(solucionario))?$/);
					if (req.method === "GET" && m) {
						servePdf(res, m[1], m[2]);
						return;
					}
					if (req.method === "HEAD" && m) {
						const fileName = m[2] === "solucionario" ? "solucionario.pdf" : "document.pdf";
						const pdfPath = path.join(SITE_ROOT, "public", "works", m[1], fileName);
						res.statusCode = fs.existsSync(pdfPath) ? 200 : 404;
						res.end();
						return;
					}

					next();
				});
			},
		},
	};
}
