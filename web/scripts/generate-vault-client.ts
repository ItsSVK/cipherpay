// Generates src/generated/vault from the Anchor IDL (../target/idl/vault.json) with Codama.
// Run after the on-chain half changes an instruction, account, event, error or PDA, in this order:
//   (repo root) anchor build, then cargo build-sbf --arch v1   (so target/idl/vault.json is current)
//   (web/)      bun run gen:vault
// Never hand-edit src/generated/.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createFromRoot } from "codama";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";

const idlPath = resolve(import.meta.dir, "../../target/idl/vault.json");
const outDir = resolve(import.meta.dir, "../src/generated/vault");

const idl = JSON.parse(readFileSync(idlPath, "utf8"));
const codama = createFromRoot(rootNodeFromAnchor(idl));
await codama.accept(renderVisitor(outDir, { deleteFolderBeforeRendering: true, formatCode: false }));
console.log(`Generated vault client from ${idl.metadata?.name} ${idl.metadata?.version} into ${outDir}`);
