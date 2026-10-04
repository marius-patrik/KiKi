import * as plugin from "./lib/index.js";
import { Context } from "@deepseek-ai/cordis";
import { assertLoaderShape } from "../../scripts/plugin-check-kit.mjs";

assertLoaderShape(plugin, "dialects");
console.log("loader shape ok:", plugin.name, "inject=", JSON.stringify(plugin.inject));

const ctx = new Context();
plugin.apply(ctx, {});
if (!ctx.dialects) throw new Error("ctx.dialects not provided");
// `dialects` is the pure abstraction: it boots an empty registry. Concrete
// dialects (`@dsh-stack/dialect-openai`, `-claude`, `-gemini`, `-code-assist`,
// `-antigravity`) each register themselves into it as their own extension —
// see each package's own verify.mjs/test.mjs for its registration + protocol
// coverage.
console.log("registry dialects:", ctx.dialects.list());
console.log("plugin check passed");
