import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as fs from "fs";
import * as path from "path";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "..");

// ============================================================
// Helper: read a file safely
// ============================================================
function readFile(filePath: string): string {
    try {
        return fs.readFileSync(filePath, "utf-8");
    } catch {
        return `Error: Could not read ${filePath}`;
    }
}

// ============================================================
// Helper: find all SKILL.md files
// ============================================================
function findSkillFiles(): { name: string; path: string }[] {
    const skillsDir = path.join(PROJECT_ROOT, ".agent", "skills");
    if (!fs.existsSync(skillsDir)) return [];

    return fs
        .readdirSync(skillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => ({
            name: d.name,
            path: path.join(skillsDir, d.name, "SKILL.md"),
        }))
        .filter((s) => fs.existsSync(s.path));
}

// ============================================================
// Helper: find all docs/*.md files
// ============================================================
function findDocFiles(): { name: string; path: string }[] {
    const docsDir = path.join(PROJECT_ROOT, "docs");
    if (!fs.existsSync(docsDir)) return [];

    return fs
        .readdirSync(docsDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => ({
            name: f.replace(".md", "").toLowerCase(),
            path: path.join(docsDir, f),
        }));
}

// ============================================================
// Create MCP Server
// ============================================================
const server = new McpServer({
    name: "zenowethu-docs",
    version: "1.0.0",
});

// ============================================================
// Resource: Project Context (CLAUDE.md)
// ============================================================
server.resource("project-context", "zenowethu://project-context", async (uri) => ({
    contents: [
        {
            uri: uri.href,
            mimeType: "text/markdown",
            text: readFile(path.join(PROJECT_ROOT, "CLAUDE.md")),
        },
    ],
}));

// ============================================================
// Resource: Prisma Schema
// ============================================================
server.resource("database-schema", "zenowethu://database-schema", async (uri) => ({
    contents: [
        {
            uri: uri.href,
            mimeType: "text/plain",
            text: readFile(
                path.join(PROJECT_ROOT, "apps", "cases", "prisma", "schema.prisma")
            ),
        },
    ],
}));

// ============================================================
// Resource Template: Documentation files
// ============================================================
server.resource(
    "doc",
    new ResourceTemplate("zenowethu://docs/{docName}", { list: undefined }),
    async (uri, { docName }) => {
        const docFile = findDocFiles().find((d) => d.name === docName);
        if (!docFile) {
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "text/plain",
                        text: `Document "${docName}" not found. Available: ${findDocFiles()
                            .map((d) => d.name)
                            .join(", ")}`,
                    },
                ],
            };
        }
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: "text/markdown",
                    text: readFile(docFile.path),
                },
            ],
        };
    }
);

// ============================================================
// Resource Template: Skills
// ============================================================
server.resource(
    "skill",
    new ResourceTemplate("zenowethu://skills/{skillName}", { list: undefined }),
    async (uri, { skillName }) => {
        const skillFile = findSkillFiles().find((s) => s.name === skillName);
        if (!skillFile) {
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "text/plain",
                        text: `Skill "${skillName}" not found. Available: ${findSkillFiles()
                            .map((s) => s.name)
                            .join(", ")}`,
                    },
                ],
            };
        }
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: "text/markdown",
                    text: readFile(skillFile.path),
                },
            ],
        };
    }
);

// ============================================================
// Tool: search_docs — Full-text search across documentation
// ============================================================
server.tool(
    "search_docs",
    "Search across all Zenowethu project documentation (PRD, architecture, security, testing, design, skills)",
    { query: { type: "string" as const, description: "Search term to find in documentation" } },
    async ({ query }) => {
        const results: { source: string; line: number; text: string }[] = [];
        const searchTerm = query.toLowerCase();

        // Search docs
        for (const doc of findDocFiles()) {
            const content = readFile(doc.path);
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(searchTerm)) {
                    results.push({
                        source: `docs/${doc.name}.md`,
                        line: i + 1,
                        text: lines[i].trim(),
                    });
                }
            }
        }

        // Search skills
        for (const skill of findSkillFiles()) {
            const content = readFile(skill.path);
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(searchTerm)) {
                    results.push({
                        source: `.agent/skills/${skill.name}/SKILL.md`,
                        line: i + 1,
                        text: lines[i].trim(),
                    });
                }
            }
        }

        // Search CLAUDE.md
        const claudeContent = readFile(path.join(PROJECT_ROOT, "CLAUDE.md"));
        const claudeLines = claudeContent.split("\n");
        for (let i = 0; i < claudeLines.length; i++) {
            if (claudeLines[i].toLowerCase().includes(searchTerm)) {
                results.push({
                    source: "CLAUDE.md",
                    line: i + 1,
                    text: claudeLines[i].trim(),
                });
            }
        }

        // Cap results
        const capped = results.slice(0, 50);
        const output = capped
            .map((r) => `[${r.source}:${r.line}] ${r.text}`)
            .join("\n");

        return {
            content: [
                {
                    type: "text" as const,
                    text: results.length === 0
                        ? `No results found for "${query}"`
                        : `Found ${results.length} result(s) for "${query}":\n\n${output}`,
                },
            ],
        };
    }
);

// ============================================================
// Tool: get_project_context — Returns full project summary
// ============================================================
server.tool(
    "get_project_context",
    "Get the full Zenowethu project context including tech stack, architecture, and critical rules",
    {},
    async () => {
        const claudeMd = readFile(path.join(PROJECT_ROOT, "CLAUDE.md"));
        const availableDocs = findDocFiles().map((d) => d.name);
        const availableSkills = findSkillFiles().map((s) => s.name);

        return {
            content: [
                {
                    type: "text" as const,
                    text: `${claudeMd}\n\n---\n\n## Available Documentation\n${availableDocs
                        .map((d) => `- docs/${d}.md`)
                        .join("\n")}\n\n## Available Skills\n${availableSkills
                            .map((s) => `- .agent/skills/${s}/SKILL.md`)
                            .join("\n")}`,
                },
            ],
        };
    }
);

// ============================================================
// Tool: list_all_resources — Lists everything available
// ============================================================
server.tool(
    "list_all_resources",
    "List all available documentation, skills, and resources in the Zenowethu project",
    {},
    async () => {
        const docs = findDocFiles();
        const skills = findSkillFiles();

        const output = [
            "# Zenowethu Documentation Resources\n",
            "## Project Context",
            "- CLAUDE.md (zenowethu://project-context)",
            "- Database Schema (zenowethu://database-schema)\n",
            "## PRD Documents",
            ...docs.map((d) => `- ${d.name} (zenowethu://docs/${d.name})`),
            "\n## Skills",
            ...skills.map((s) => `- ${s.name} (zenowethu://skills/${s.name})`),
        ];

        return {
            content: [{ type: "text" as const, text: output.join("\n") }],
        };
    }
);

// ============================================================
// Start Server
// ============================================================
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Zenowethu MCP Docs Server running on stdio");
}

main().catch(console.error);
