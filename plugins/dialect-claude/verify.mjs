// jscpd:ignore-start -- structural: every dialect extension's verify.mjs boots the same minimal Context + dialects abstraction and asserts registration, differing only by dialect id (dsh-stack#135)
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import * as dialects from "@dsh-stack/dialects";
import * as extension from "./lib/index.js";

const ctx = new Context();
dialects.apply(ctx, {});
extension.apply(ctx, {});

const dialect = ctx.dialects.get("claude");
assert.equal(dialect.id, "claude");
console.log("dialect-claude verification passed: registered as", dialect.id);
// jscpd:ignore-end
