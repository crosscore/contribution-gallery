import * as esbuild from "esbuild";

async function build() {
  console.log("🔨 Building contribution-gallery...");

  await esbuild.build({
    entryPoints: ["src/action/index.ts"],
    bundle: true,
    outfile: "dist/index.js",
    platform: "node",
    target: "node20",
    format: "cjs",
    minify: false,
    sourcemap: true,
    // Don't externalize @actions packages — bundle everything
    external: [],
  });

  console.log("✅ Built dist/index.js");
}

build().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
