// Bundles the executor into a single, dependency-free file so the enclave
// image doesn't need to carry pnpm's node_modules/.pnpm symlink layout —
// see enclave/Containerfile and docs/enclave-deploy.md.
import { build } from "esbuild";

await build({
  entryPoints: ["src/start.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/start.mjs",
  // Node built-ins stay external automatically under platform: "node".
  // Everything else (including workspace packages and @mysten/*) is
  // inlined so the enclave image only needs this one file plus a Node
  // runtime.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
});
