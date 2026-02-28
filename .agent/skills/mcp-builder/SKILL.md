---
name: mcp-builder
description: Guide for creating and extending MCP (Model Context Protocol) servers. Use when: (1) Adding new resources or tools to the Zenowethu MCP docs server, (2) Building new MCP integrations, (3) Debugging MCP server issues. Reference implementation exists at mcp-server/index.ts.
---

# MCP Server Development — ZenoCasesSystem

## Existing MCP Server

The project has a local MCP documentation server at `mcp-server/index.ts` that serves:
- **Resources**: CLAUDE.md, Prisma schema, docs/*.md, skills
- **Tools**: `search_docs`, `get_project_context`, `list_all_resources`
- **Config**: `.mcp.json` at project root

## Adding New Resources

To add a new resource to the existing server:

```typescript
// Static resource (fixed URI)
server.resource("resource-name", "zenowethu://resource-name", async (uri) => ({
  contents: [{
    uri: uri.href,
    mimeType: "text/markdown",
    text: readFile(path.join(PROJECT_ROOT, "path/to/file")),
  }],
}));

// Templated resource (dynamic URI)
server.resource(
  "template-name",
  new ResourceTemplate("zenowethu://category/{itemName}", { list: undefined }),
  async (uri, { itemName }) => ({
    contents: [{
      uri: uri.href,
      mimeType: "text/markdown",
      text: readFile(resolvedPath),
    }],
  })
);
```

## Adding New Tools

```typescript
server.tool(
  "tool_name",
  "Description of what the tool does",
  { 
    param1: { type: "string" as const, description: "Param description" }
  },
  async ({ param1 }) => ({
    content: [{ type: "text" as const, text: result }],
  })
);
```

## Best Practices

1. **Tool naming**: Use `snake_case`, prefix with domain (e.g., `search_docs`, `get_case_status`)
2. **Input schemas**: Use Zod for validation (consistent with rest of project)
3. **Error messages**: Include actionable guidance, not just "not found"
4. **Pagination**: Return focused data, don't dump entire files
5. **Annotations**: Mark tools as `readOnlyHint: true` when they don't modify state
6. **Transport**: Use stdio for local development, streamable HTTP for remote

## Testing

```bash
# Run the server manually
npx tsx mcp-server/index.ts

# Test with MCP Inspector
npx @modelcontextprotocol/inspector
```

## Future Expansion Ideas

- Add a `get_case_schema` tool that returns the full Prisma schema for a specific model
- Add a `search_statuses` tool for querying the 80+ workflow statuses
- Add resources for workflow definitions from `lib/statuses.ts`
- Expose API route documentation as discoverable resources
