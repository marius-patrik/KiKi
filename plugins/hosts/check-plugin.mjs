import assert from "node:assert/strict";
import * as plugin from "./lib/index.js";
import { assertLoaderShape } from "../../scripts/plugin-check-kit.mjs";
import { VirtualDomainManager } from "./lib/virtual-domain.js";

assertLoaderShape(plugin, "hosts");

const domainManager = new VirtualDomainManager({
  clusterDomain: "test.local",
  permanentPort: 4000,
});
assert.equal(domainManager.getPermanentAddress(), "http://test.local:4000");
assert.equal(domainManager.getPermanentAddress("node.ts.net"), "http://test.local:4000");

const defaultManager = new VirtualDomainManager();
assert.equal(defaultManager.getPermanentAddress(), "http://dsh.local:3080");
assert.equal(defaultManager.getPermanentAddress("node.ts.net"), "http://node.ts.net:3080");

defaultManager.unregisterMdns();

const disabledManager = new VirtualDomainManager({ enableMdns: false });
assert.equal(await disabledManager.registerMdns(), false);
disabledManager.unregisterMdns();

console.log("loader shape ok: hosts inject=", JSON.stringify(plugin.inject));
console.log("virtual domain manager ok");
console.log("plugin check passed");
