// A tiny Streamable HTTP MCP server for tests. Answers in JSON or SSE depending on `mode`.
const http = require("node:http");

function startMockServer(mode) {
  const seen = [];

  function send(res, payload) {
    const headers = { "Mcp-Session-Id": "sess-123" };
    if (mode === "sse") {
      res.writeHead(200, { ...headers, "Content-Type": "text/event-stream" });
      // A notification first, then the response split across two network chunks.
      res.write('event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\n\n');
      const text = "event: message\ndata: " + JSON.stringify(payload) + "\n\n";
      res.write(text.slice(0, 20));
      setTimeout(() => res.end(text.slice(20)), 5);
    } else {
      res.writeHead(200, { ...headers, "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    }
  }

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, headers: req.headers, body: body ? JSON.parse(body) : null });
      if (req.method === "DELETE") {
        res.writeHead(200);
        return res.end();
      }
      const msg = JSON.parse(body);
      if (msg.id === undefined) {
        res.writeHead(202);
        return res.end();
      }
      let result;
      if (msg.method === "initialize") {
        result = {
          protocolVersion: msg.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "mock", version: "0" },
          instructions: "be nice",
        };
      } else if (msg.method === "tools/list") {
        result = msg.params.cursor
          ? { tools: [{ name: "b", inputSchema: { type: "object" } }] }
          : { tools: [{ name: "a", inputSchema: { type: "object" } }], nextCursor: "p2" };
      } else if (msg.method === "tools/call" && msg.params.name === "boom") {
        return send(res, { jsonrpc: "2.0", id: msg.id, error: { code: -32602, message: "bad args" } });
      } else if (msg.method === "tools/call") {
        result = { content: [{ type: "text", text: "echo " + JSON.stringify(msg.params.arguments) }] };
      } else {
        result = {};
      }
      send(res, { jsonrpc: "2.0", id: msg.id, result });
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ url: "http://127.0.0.1:" + server.address().port + "/mcp", seen, close: () => server.close() })
    );
  });
}

module.exports = { startMockServer };
