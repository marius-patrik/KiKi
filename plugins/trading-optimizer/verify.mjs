import assert from "node:assert/strict";
import { gridSearch } from "./lib/index.js";

const candles = Array.from({ length: 20 }, (_, time) => ({
  time,
  open: 100 + time,
  high: 101 + time,
  low: 99 + time,
  close: 100 + time,
  volume: 1000,
}));
const evaluations = gridSearch(
  candles,
  () => ({
    id: "hold" /**
     * Executes the onCandle logic with given parameters and returns an object containing the id and the result of the onCandle implementation.
     * The function is expected to be called with specific parameters: size and enabled, which determine its behavior.
     * On failure, it returns an object with the id set to "hold".
     */,
    /** onCandle implementation. */
    onCandle() {},
  }),
  0.7,
  {
    size: [1, 2],
    enabled: [true, false],
  },
);
assert.equal(evaluations.length, 4);
console.log("Trading optimizer verification passed.");
