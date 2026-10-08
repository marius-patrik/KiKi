import assert from "node:assert/strict";
import { MarketDataRegistry, MemoryMarketDataProvider } from "./lib/index.js";

const provider = new MemoryMarketDataProvider();
provider.seed("TEST", [
  { time: 2, open: 2, high: 3, low: 1, close: 2, volume: 10 },
  { time: 1, open: 1, high: 2, low: 0, close: 1, volume: 10 },
]);
const registry = new MarketDataRegistry();
registry.register(provider);
assert.deepEqual(await provider.listSymbols(), ["TEST"]);
assert.equal((await provider.getCandles({ symbol: "TEST", limit: 1 })).length, 1);
assert.equal(registry.get("memory")?.id, "memory");
console.log("Trading market-data verification passed.");
