import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	target: ["esnext"],
	format: ["esm"],
	outDir: "dist",
	clean: true,
	minify: false,
	bundle: true,
	treeshake: true,
});
