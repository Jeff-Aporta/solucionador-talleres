import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	output: "static",
	site: "https://dev-insoft-web.github.io",
	base: "/estudio/",
	trailingSlash: "ignore",
	integrations: [svelte()],
	vite: {
		resolve: {
			alias: {
				$lib: path.resolve(__dirname, "./src/lib"),
				$components: path.resolve(__dirname, "./src/components"),
			},
		},
	},
});
