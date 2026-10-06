#!/usr/bin/env node
/**
 * dsh-tui — standalone terminal client for the DeepSeek Harness.
 *
 * Connects to a running dsh instance over HTTP and provides a readline REPL
 * for chatting with the agent, managing sessions, goals, and models.
 *
 * Usage:
 *   dsh-tui [--url http://127.0.0.1:3080]
 */

import { main } from "../lib/index.js";

main().catch((err) => {
  console.error(`fatal: ${err.message}`);
  process.exit(1);
});
