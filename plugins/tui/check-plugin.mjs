import { DshClient } from "./lib/client.js";
import { createInitialState, ansi } from "./lib/tui.js";

const client = new DshClient({ baseUrl: "http://127.0.0.1:3080" });
if (typeof client.call !== "function") throw new Error("bad DshClient");

const state = createInitialState();
if (state.sessionId !== null) throw new Error("bad initialState");
if (typeof ansi.reset !== "string") throw new Error("bad ansi");

console.log("dsh-tui standalone exports ok");
console.log("plugin check passed");
