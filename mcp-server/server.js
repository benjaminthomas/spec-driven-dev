#!/usr/bin/env node
// MCP fallback server for spec-driven-dev's Agent Skills (https://agentskills.io).
//
// This exists for hosts that speak MCP but don't (yet) support the Agent Skills
// format natively, or that only implement MCP tools (not prompts). It reads
// directly from ../plugin/skills/ at startup — there is no separate copy of skill
// content to keep in sync; plugin/skills/ remains the single source of truth.
//
// Each skill becomes one MCP tool. Calling the tool returns that skill's
// SKILL.md body as the instructions the calling agent should follow, plus a
// pointer to its supporting files (exposed as MCP resources under a
// skill://<name>/<path> URI, and also readable directly from disk since this
// server runs locally).
//
// Run with: node mcp-server/server.js

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "..", "plugin", "skills");
const VERSION = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8")).version;
const MIME = { md: "text/markdown", yml: "application/yaml", yaml: "application/yaml", json: "application/json", png: "image/png" };
const mimeOf = (f) => MIME[f.split(".").pop().toLowerCase()] || "text/plain";

function readFrontmatterDescription(skillMdPath) {
  const text = readFileSync(skillMdPath, "utf8");
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return "";
  const descMatch = fmMatch[1].match(/description:\s*>?\s*\n?([\s\S]*?)(?=\n[a-zA-Z_-]+:|$)/);
  if (!descMatch) return "";
  return descMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .join(" ")
    .trim();
}

function stripFrontmatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
}

function listSupportingFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSupportingFiles(full, base));
    } else if (entry.name !== "SKILL.md") {
      out.push(relative(base, full));
    }
  }
  return out;
}

const skillNames = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => statSync(join(SKILLS_DIR, name, "SKILL.md"), { throwIfNoEntry: false }));

if (skillNames.length === 0) {
  console.error(`No skills found under ${SKILLS_DIR} — nothing to serve.`);
  process.exit(1);
}

const server = new McpServer({
  name: "spec-driven-dev-skills",
  version: VERSION,
});

for (const skillName of skillNames) {
  const skillDir = join(SKILLS_DIR, skillName);
  const skillMdPath = join(skillDir, "SKILL.md");
  const description = readFrontmatterDescription(skillMdPath) || `Run the ${skillName} skill.`;
  const supportingFiles = listSupportingFiles(skillDir);

  server.registerTool(
    skillName,
    {
      title: skillName,
      description: `${description}\n\n(Served over MCP as a fallback for hosts without native Agent Skills support — see https://agentskills.io.)`,
    },
    async () => {
      const body = stripFrontmatter(readFileSync(skillMdPath, "utf8"));
      const filesNote = supportingFiles.length
        ? "\n\n---\nSupporting files for this skill:\n" +
          supportingFiles.map((f) => `- ${f} (resource: skill://${skillName}/${f})`).join("\n") +
          `\n\nThis server runs locally at ${skillDir} — read these files with your own ` +
          "file-reading tool, or via the skill:// resources listed above."
        : "";
      return {
        content: [{ type: "text", text: body + filesNote }],
      };
    },
  );

  for (const relPath of supportingFiles) {
    const uri = `skill://${skillName}/${relPath}`;
    server.registerResource(
      `${skillName}: ${relPath}`,
      uri,
      {
        description: `Supporting file for the ${skillName} skill`,
        mimeType: mimeOf(relPath),
      },
      async (uriObj) => ({
        contents: [
          {
            uri: uriObj.toString(),
            mimeType: mimeOf(relPath),
            text: readFileSync(join(skillDir, relPath), "utf8"),
          },
        ],
      }),
    );
  }
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`spec-driven-dev MCP server ready — serving ${skillNames.length} skills from ${SKILLS_DIR}`);
