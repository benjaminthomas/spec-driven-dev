#!/usr/bin/env node
// Launcher: plain CommonJS so it runs on any Node and can explain a too-old version,
// instead of the ESM entry failing with a syntax error.
const major = Number(process.versions.node.split(".")[0]);
if (major < 14) {
  console.error(`✗ spec-driven-dev needs Node.js 14 or newer; this is ${process.version}.`);
  console.error("  If you use nvm, run it from a folder without an old .nvmrc, or: nvm exec 20 npx @benjaminthomas/spec-driven-dev@latest");
  process.exit(1);
}
import("./cli.mjs").catch((e) => { console.error(e); process.exit(1); });
