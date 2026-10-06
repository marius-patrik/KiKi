import { Context } from "@deepseek-ai/cordis";
import * as dialects from "@dsh-stack/dialects";
import * as providers from "@dsh-stack/providers";
import { assertProviderExtension } from "../../scripts/plugin-check-kit.mjs";
import * as extension from "./lib/index.js";

await assertProviderExtension("llamacpp", extension, { Context, dialects, providers });
