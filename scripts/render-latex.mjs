// Reescribe en cada public/works/<slug>/index.html las <img src="https://latex.codecogs.com/..."> y
// equivalentes de QuickLaTeX por HTML renderizado con KaTeX (server-side, sin red en runtime).
// Inyecta el <link> a /katex/katex.min.css en <head> y copia KaTeX (CSS + fuentes) a public/katex.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import katex from "katex";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(__dirname, "..");
const publicDir = path.join(siteRoot, "public");
const worksDir = path.join(publicDir, "works");
const katexSrc = path.join(siteRoot, "node_modules", "katex", "dist");
const katexDst = path.join(publicDir, "katex");

// 1) Copia katex.min.css y la carpeta fonts/ a public/katex/.
function syncKatexAssets() {
	fs.mkdirSync(katexDst, { recursive: true });
	fs.copyFileSync(path.join(katexSrc, "katex.min.css"), path.join(katexDst, "katex.min.css"));
	const fontsSrc = path.join(katexSrc, "fonts");
	const fontsDst = path.join(katexDst, "fonts");
	fs.mkdirSync(fontsDst, { recursive: true });
	for (const f of fs.readdirSync(fontsSrc)) {
		fs.copyFileSync(path.join(fontsSrc, f), path.join(fontsDst, f));
	}
}

// 2) Extrae expresion LaTeX desde una URL de codecogs / quicklatex.
function extractLatexFromUrl(url) {
	try {
		const u = new URL(url);
		const host = u.hostname.toLowerCase();
		if (host.endsWith("codecogs.com")) {
			// codecogs: el LaTeX viene en el search SIN nombre de parametro
			// p.ej. /svg.image?\small P=V\cdot I
			let raw = (u.search || "").replace(/^\?/, "");
			// codecogs acepta el LaTeX sin URL-encoding o con %XX
			try { raw = decodeURIComponent(raw); } catch { /* keep raw */ }
			// Limpia prefijos de tamano que solo afectan render
			raw = raw.replace(/^\\(small|tiny|large|Large|LARGE|huge|Huge|displaystyle|textstyle)\s*/, "");
			// codecogs a veces acepta \dpi{N} prefijo
			raw = raw.replace(/^\\dpi\{[^}]*\}\s*/, "");
			return raw.trim();
		}
		if (host.endsWith("quicklatex.com")) {
			// quicklatex.com/cache3/... no es decodificable; deja vacio.
			// Si tiene ?formula=... lo usamos.
			const f = u.searchParams.get("formula");
			if (f) return decodeURIComponent(f).trim();
			return "";
		}
		return "";
	} catch {
		return "";
	}
}

function renderLatex(tex) {
	if (!tex) return null;
	try {
		return katex.renderToString(tex, { throwOnError: false, output: "html", strict: "ignore" });
	} catch {
		return null;
	}
}

// 3) Reescribe los <img ...> que apunten a las APIs LaTeX.
// El reemplazo se hace por <span class="katex-inline"> ... </span> conservando inline-block.
const IMG_RE = /<img\b([^>]*?)\bsrc\s*=\s*(["'])([^"']*?(?:latex\.codecogs\.com|quicklatex\.com)[^"']*?)\2([^>]*?)\/?>/gi;

function rewriteHtml(file) {
	let html = fs.readFileSync(file, "utf8");
	let replaced = 0;
	let failed = 0;
	html = html.replace(IMG_RE, (full, before, _q, url, after) => {
		const tex = extractLatexFromUrl(url);
		const rendered = renderLatex(tex);
		if (!rendered) {
			failed++;
			return full;
		}
		replaced++;
		// Mantenemos cualquier style/class del <img> original como wrapper.
		const styleMatch = (before + " " + after).match(/style\s*=\s*(["'])([^"']*)\1/i);
		const styleAttr = styleMatch ? ` style="${styleMatch[2]};display:inline-block;vertical-align:middle"` : ' style="display:inline-block;vertical-align:middle"';
		return `<span class="katex-inline"${styleAttr}>${rendered}</span>`;
	});

	// Reemplaza delimitadores $$...$$ (display) y $...$ (inline) por KaTeX server-side.
	// Evita procesar contenido dentro de <script>, <style>, <code> y <pre>.
	function renderDelimited(input) {
		const protectedRanges = [];
		const tagRe = /<(script|style|code|pre)\b[^>]*>[\s\S]*?<\/\1>/gi;
		let m;
		while ((m = tagRe.exec(input)) !== null) {
			protectedRanges.push([m.index, m.index + m[0].length]);
		}
		const isProtected = (i) => protectedRanges.some(([a, b]) => i >= a && i < b);

		const tryRender = (tex, displayMode) => {
			try {
				return katex.renderToString(tex, { throwOnError: false, output: "html", strict: "ignore", displayMode });
			} catch {
				return null;
			}
		};

		let out = "";
		let i = 0;
		while (i < input.length) {
			if (isProtected(i)) {
				// Copia el bloque protegido entero.
				const range = protectedRanges.find(([a, b]) => i >= a && i < b);
				out += input.slice(i, range[1]);
				i = range[1];
				continue;
			}
			const ch = input[i];
			if (ch === "$") {
				const display = input[i + 1] === "$";
				const delim = display ? "$$" : "$";
				const start = i + delim.length;
				let end = -1;
				for (let j = start; j < input.length; j++) {
					if (isProtected(j)) continue;
					if (input[j] === "\\" && input[j + 1] === "$") { j++; continue; }
					if (display) {
						if (input[j] === "$" && input[j + 1] === "$") { end = j; break; }
					} else {
						if (input[j] === "$") { end = j; break; }
					}
				}
				if (end === -1) { out += ch; i++; continue; }
				const tex = input.slice(start, end).replace(/\\\$/g, "$");
				const rendered = tryRender(tex, display);
				if (!rendered) {
					out += input.slice(i, end + delim.length);
				} else {
					out += display
						? `<span class="katex-block" style="display:block;text-align:center;margin:0.35rem 0">${rendered}</span>`
						: `<span class="katex-inline" style="display:inline-block;vertical-align:middle">${rendered}</span>`;
					replaced++;
				}
				i = end + delim.length;
				continue;
			}
			out += ch;
			i++;
		}
		return out;
	}
	html = renderDelimited(html);

	// Inyectar <link> a katex.min.css en <head> si aun no esta.
	if (replaced > 0 && !/href=["'][^"']*katex\.min\.css/i.test(html)) {
		const tag = `<link rel="stylesheet" href="/katex/katex.min.css" />`;
		if (/<\/head>/i.test(html)) {
			html = html.replace(/<\/head>/i, `\t${tag}\n</head>`);
		} else {
			html = tag + "\n" + html;
		}
	}

	fs.writeFileSync(file, html, "utf8");
	return { replaced, failed };
}

function main() {
	syncKatexAssets();
	let totalReplaced = 0;
	let totalFailed = 0;
	let touched = 0;
	for (const slug of fs.readdirSync(worksDir)) {
		const slugDir = path.join(worksDir, slug);
		for (const name of ["index.html", "solucionario.html"]) {
			const file = path.join(slugDir, name);
			if (!fs.existsSync(file)) continue;
			const { replaced, failed } = rewriteHtml(file);
			if (replaced > 0 || failed > 0) {
				console.log(`[${slug}/${name}] ${replaced} renderizadas, ${failed} fallidas`);
				touched++;
			}
			totalReplaced += replaced;
			totalFailed += failed;
		}
	}
	console.log(`KaTeX: ${totalReplaced} ecuaciones renderizadas en ${touched} archivos. Fallos: ${totalFailed}.`);
	if (totalFailed > 0) process.exitCode = 0; // no aborta el build
}

main();
