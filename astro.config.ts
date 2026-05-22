import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error mjs sin tipos
import pdfDev from "./scripts/pdf-dev-integration.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	output: "static",
	site: "https://dev-insoft-web.github.io",
	base: "/estudio/",
	trailingSlash: "ignore",
	integrations: [svelte(), pdfDev()],
	vite: {
		resolve: {
			alias: {
				$lib: path.resolve(__dirname, "./src/lib"),
				$components: path.resolve(__dirname, "./src/components"),
			},
		},
	},
});
