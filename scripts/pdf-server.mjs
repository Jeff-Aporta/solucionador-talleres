// Sidecar HTTP que expone POST /api/generate-pdf para invocar generar_pdfs.py.
// Necesario porque Astro está en modo estático: el navegador no puede ejecutar Python.
// Ejecutar en paralelo con `astro dev` o `astro preview`:
//   npm run pdf:server

import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(__dirname, "..");
const PY_SCRIPT = path.join(__dirname, "python", "generar_pdfs.py");

const PORT = Number(process.env.PDF_SERVER_PORT ?? 4501);
const ALLOW_ORIGIN = process.env.PDF_SERVER_ORIGIN ?? "http://localhost:4500";

function applyCors(res) {
	res.setHeader("Access-Control-Allow-Origin", ALLOW_ORIGIN);
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, status, body) {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json");
	res.end(JSON.stringify(body));
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (c) => chunks.push(c));
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
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

const server = http.createServer(async (req, res) => {
	applyCors(res);
	if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

	// GET /pdf/<slug>             -> document.pdf
	// GET /pdf/<slug>/solucionario -> solucionario.pdf
	if (req.method === "GET" && req.url?.startsWith("/pdf/")) {
		const rest = req.url.slice("/pdf/".length).split("?")[0];
		const parts = rest.split("/").filter(Boolean).map(decodeURIComponent);
		const slug = parts[0] ?? "";
		const kind = parts[1] ?? "";
		if (!/^[a-z0-9-]+$/.test(slug)) return json(res, 400, { error: "slug inválido" });
		const fileName = kind === "solucionario" ? "solucionario.pdf" : "document.pdf";
		const pdfPath = path.join(SITE_ROOT, "public", "works", slug, fileName);
		if (!fs.existsSync(pdfPath)) return json(res, 404, { error: "PDF no generado" });
		res.statusCode = 200;
		res.setHeader("Content-Type", "application/pdf");
		res.setHeader("Content-Disposition", `inline; filename="${slug}-${fileName}"`);
		fs.createReadStream(pdfPath).pipe(res);
		return;
	}

	if (!(req.method === "POST" && req.url?.startsWith("/api/generate-pdf"))) {
		return json(res, 404, { error: "Not found" });
	}
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
		return json(res, 404, { error: `No existe public/works/${slug}/index.html. Ejecuta 'npm run build' primero.` });
	}

	console.log(`[pdf-server] generando ${slug}...`);
	const result = await runPython(slug);
	const ok = result.code === 0;
	console.log(`[pdf-server] ${slug} -> code=${result.code}`);
	if (!ok) console.log(result.stderr.slice(0, 2000));
	const hasSolucionario = fs.existsSync(path.join(SITE_ROOT, "public", "works", slug, "solucionario.pdf"));
	json(res, ok ? 200 : 500, {
		ok,
		slug,
		pdfUrl: `http://127.0.0.1:${PORT}/pdf/${slug}`,
		solucionarioUrl: hasSolucionario ? `http://127.0.0.1:${PORT}/pdf/${slug}/solucionario` : null,
		stdout: result.stdout,
		stderr: result.stderr,
	});
});

server.listen(PORT, "127.0.0.1", () => {
	console.log(`PDF server listo en http://127.0.0.1:${PORT}`);
	console.log(`  Endpoint: POST /api/generate-pdf  body: { "slug": "..." }`);
	console.log(`  CORS allow-origin: ${ALLOW_ORIGIN}`);
});
