# mcp-lite

A dependency-free [Model Context Protocol](https://modelcontextprotocol.io) client for the browser over Streamable HTTP, plus a minimal MCP Apps host. One script tag, no build step.

Most MCP clients are Node or Python libraries. mcp-lite lets a plain web page talk to any Streamable HTTP MCP server, which is handy for simulators, dashboards, demos and debugging tools.

## What it does

**`src/mcp-lite.js`: the client**

- Runs the initialize handshake (protocol `2025-11-25` by default) and sends `notifications/initialized`.
- Keeps the `Mcp-Session-Id` the server returns and sends it, with `MCP-Protocol-Version`, on every later request.
- Reads both response styles the transport allows: plain JSON and `text/event-stream` (SSE), including events split across network chunks and notifications that arrive before the response.
- Follows `nextCursor` when listing tools.
- Turns JSON-RPC errors into thrown errors that keep `code` and `data`.
- Ends the session with `DELETE` on `close()`.
- Reports every message through an `onTraffic` hook, which makes protocol inspectors easy to build.
- Works in Node 18+ too (`require("mcp-lite")`).

**`src/apps-host.js`: the MCP Apps host**

- Reads a tool's `_meta.ui.resourceUri`, fetches the `ui://` resource with `resources/read`, and checks it is `text/html;profile=mcp-app`.
- Renders it in an iframe sandboxed with `allow-scripts` only.
- Implements the postMessage side of the protocol: answers `ui/initialize`, sends `ui/notifications/tool-input` and `ui/notifications/tool-result`, resizes on `ui/notifications/size-changed`, and opens only http(s) links on `ui/open-link`.
- Lets the page handle app-specific traffic: `onRequest(method, params)` answers requests the app sends (return a promise), `onNotification(method, params)` receives its notifications, `frame.notify(method, params)` sends it notifications, and `frame.ready` settles once the app has the tool result. DocDesk uses this so its card can ask the host to read each step of a guided walkthrough aloud.

## Use

```html
<script src="mcp-lite.js"></script>
<script src="apps-host.js"></script>
<script>
  const client = new McpClient("/mcp", {
    headers: { "X-Customer": "ada" },
    capabilities: { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [McpAppsHost.APP_MIME] } } },
    onTraffic: (t) => console.log(t.direction, t.message),
  });
  await client.connect();
  const tools = await client.listTools();
  const result = await client.callTool("ask_support", { question: "How do I restart my router?" });
  const frame = await McpAppsHost.renderApp(client, tools.find((t) => t.name === "ask_support"), {}, result, document.body, {
    onRequest: (method, params) => method === "docdesk/speak" ? speakAloud(params.text) : undefined,
    onNotification: (method) => console.log("app says", method),
  });
</script>
```

`example/index.html` is a small page that connects to a server, lists tools, calls one and renders its MCP App.

The browser enforces the same-origin policy, so serve the page from the server's origin or enable CORS there (and expose the `Mcp-Session-Id` header).

## Test

```bash
npm test
```

The tests run the client against a mock Streamable HTTP server in both JSON and SSE modes and check the handshake, session and protocol headers, pagination, error mapping and session shutdown.

## Where it came from

mcp-lite was written for [DocDesk](https://github.com/Okorodavid/docdesk), a help-centre add-on for Alexa+, where it powers the browser-based Alexa+ simulator. It was published as a separate project during the Build, Ship, Shape: Amazon Developer Hackathon 2026.

## License

MIT
