import assert from "node:assert/strict";
import { atr, bollinger, ema, mfi, rsi, sma, snapshot } from "./lib/index.js";

const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5 + Math.sin(i / 3));
const candles = closes.map((close, time) => ({
  time,
  open: close - 0.25,
  high: close + 0.5,
  low: close - 0.5,
  close,
  volume: 1000 + time,
}));

assert.equal(sma(closes, 20) !== null, true);
assert.equal(ema(closes, 20) !== null, true);
assert.equal(rsi(closes) !== null, true);
assert.equal(atr(candles) !== null, true);
assert.equal(mfi(candles) !== null, true);
assert.equal(bollinger(closes).middle !== null, true);
assert.equal(snapshot(candles).sma20 !== null, true);
console.log("Trading research verification passed.");
