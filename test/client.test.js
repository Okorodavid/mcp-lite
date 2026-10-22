const test = require("node:test");
const assert = require("node:assert/strict");
const { McpClient } = require("../src/mcp-lite.js");
const { startMockServer } = require("./mock-server.js");

for (const mode of ["json", "sse"]) {
  test("handshake, session headers and tool calls over " + mode, async () => {
    const srv = await startMockServer(mode);
    const traffic = [];
    try {
      const client = new McpClient(srv.url, { headers: { "X-Customer": "ada" }, onTraffic: (t) => traffic.push(t) });
      const init = await client.connect();
      assert.equal(init.protocolVersion, "2025-11-25");
      assert.equal(client.sessionId, "sess-123");
      assert.equal(client.instructions, "be nice");

      const tools = await client.listTools();
      assert.deepEqual(tools.map((t) => t.name), ["a", "b"], "follows nextCursor");

      const out = await client.callTool("a", { x: 1 });
      assert.equal(out.content[0].text, 'echo {"x":1}');

      await assert.rejects(client.callTool("boom"), (err) => err.code === -32602 && /bad args/.test(err.message));

      const [initReq, initialized, ...rest] = srv.seen;
      assert.equal(initReq.body.method, "initialize");
      assert.equal(initReq.headers["mcp-session-id"], undefined);
      assert.match(initReq.headers.accept, /text\/event-stream/);
      assert.equal(initialized.body.method, "notifications/initialized");
      assert.equal(initialized.headers["mcp-session-id"], "sess-123");
      for (const r of rest) {
        assert.equal(r.headers["mcp-session-id"], "sess-123");
        assert.equal(r.headers["mcp-protocol-version"], "2025-11-25");
        assert.equal(r.headers["x-customer"], "ada");
      }
      assert.ok(traffic.some((t) => t.direction === "in" && t.ms >= 0));

      await client.close();
      assert.equal(srv.seen.at(-1).method, "DELETE");
      assert.equal(client.sessionId, null);
    } finally {
      srv.close();
    }
  });
}
