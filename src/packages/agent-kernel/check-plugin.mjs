import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as plugin from "./lib/index.js";
import { assertLoaderShape } from "../../scripts/plugin-check-kit.mjs";

assertLoaderShape(plugin, "agent-kernel");

const root = mkdtempSync(join(tmpdir(), "dsh-agent-kernel-"));

/** Build the minimal Cordis-shaped context needed to exercise plugin lifecycle. */
function context() {
  const disposers = [];
  const ctx = {
    agentKernel: null,
    reflect: {
      /** Mount a Cordis Service under its declared context key. */
      provide(name, service) {
        ctx[name] = service;
      },
    },
    /** Register one lifecycle effect and retain its disposer for the fixture. */
    effect(factory) {
      const dispose = factory();
      if (typeof dispose === "function") disposers.push(dispose);
      return dispose;
    },
  };
  return {
    ctx,
    /** Dispose fixture effects in reverse registration order. */
    dispose() {
      for (const disposer of disposers.reverse()) disposer();
    },
  };
}

/** Build a finite replayable environment implementing the public kernel contract. */
function syntheticEnvironment() {
  return {
    id: "test.synthetic",
    eventSources: [
      {
        id: "test.synthetic.events",
        /** Replay synthetic ordered events strictly after the committed cursor. */
        async *events({ afterCursor }) {
          const after = BigInt(afterCursor ?? "0");
          for (const index of [1n, 2n]) {
            if (index <= after) continue;
            yield {
              id: `source-${index}`,
              cursor: index.toString(),
              type: "test.synthetic.event",
              payload: { index: Number(index) },
              provenance: { source: "synthetic" },
            };
          }
        },
      },
    ],
    capabilities: [
      {
        id: "test.echo",
        title: "Echo",
        description: "Return the supplied JSON input.",
        effect: "read",
      },
    ],
    /** Execute the fixture's sole echo capability. */
    async invoke(capabilityId, input) {
      if (capabilityId !== "test.echo") throw new Error("unexpected capability");
      return input;
    },
  };
}

try {
  process.env.DSH_HOME = root;

  const first = context();
  plugin.apply(first.ctx);
  const firstId = first.ctx.agentKernel.id;
  assert.match(firstId, /^[0-9a-f-]{36}$/);

  const environment = syntheticEnvironment();
  first.ctx.agentKernel.registerEnvironment(environment);
  const observed = [];
  const stop = first.ctx.agentKernel.observe((event) => observed.push(event.id));
  await first.ctx.agentKernel.consumeEnvironment(environment.id);

  assert.equal(first.ctx.agentKernel.worldline.count(), 2);
  assert.equal(first.ctx.agentKernel.worldline.cursor("test.synthetic.events"), "2");
  assert.equal(observed.length, 2);
  assert.deepEqual(
    await first.ctx.agentKernel.invoke(environment.id, "test.echo", { value: "ok" }),
    { value: "ok" },
  );
  stop();
  first.dispose();

  const second = context();
  plugin.apply(second.ctx);
  assert.equal(second.ctx.agentKernel.id, firstId, "agent identity must survive restart");
  second.ctx.agentKernel.registerEnvironment(syntheticEnvironment());
  await second.ctx.agentKernel.consumeEnvironment("test.synthetic");

  assert.equal(
    second.ctx.agentKernel.worldline.count(),
    2,
    "replay must not duplicate source events",
  );
  assert.equal(second.ctx.agentKernel.worldline.read().length, 2);

  const original = second.ctx.agentKernel.worldline.read()[0];
  second.ctx.agentKernel.record("test.synthetic.events", {
    ...original.event,
  });
  assert.equal(
    second.ctx.agentKernel.worldline.count(),
    2,
    "direct duplicate append must be idempotent",
  );

  assert.throws(
    () =>
      second.ctx.agentKernel.record("test.synthetic.events", {
        id: "regression",
        cursor: "1",
        type: "test.synthetic.event",
        payload: null,
      }),
    /cursor regressed/,
  );

  second.dispose();
  console.log(
    "agent-kernel check passed: durable identity, replay, dedupe, cursor and capability contracts",
  );
} finally {
  delete process.env.DSH_HOME;
  rmSync(root, { recursive: true, force: true });
}
