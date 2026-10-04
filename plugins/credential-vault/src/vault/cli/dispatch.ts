import { parseVaultArguments } from "./argument-parsing.js";
import { defaultVaultCliIo, type VaultCliIo } from "./io.js";
import { USAGE } from "./commands/shared.js";
import { initCommand } from "./commands/init.js";
import { addCommand } from "./commands/add.js";
import { importTotpCommand } from "./commands/import-totp.js";
import { listCommand } from "./commands/list.js";
import { getCommand } from "./commands/get.js";
import { totpCommand } from "./commands/totp.js";
import { statusCommand } from "./commands/status.js";
import { scanCommand } from "./commands/scan.js";

/**
 * The entry point. Returns an exit code rather than calling `process.exit`, so
 * a test can drive every command in-process and so an embedding CLI decides what
 * a failure means.
 */
export async function vaultCommand(
  argv: readonly string[],
  overrides: Partial<VaultCliIo> = {},
): Promise<number> {
  const io: VaultCliIo = { ...defaultVaultCliIo(), ...overrides };
  const [subcommand = "help", ...rest] = argv;
  const args = parseVaultArguments(rest);
  try {
    switch (subcommand) {
      case "help":
      case "--help":
      case "-h":
        io.out(USAGE);
        return 0;
      case "init":
        return await initCommand(args, io);
      case "add":
        return await addCommand(args, io);
      case "import-totp":
        return await importTotpCommand(args, io);
      case "list":
        return await listCommand(args, io);
      case "get":
        return await getCommand(args, io);
      case "totp":
        return await totpCommand(args, io);
      case "status":
        return await statusCommand(args, io);
      case "scan":
        return await scanCommand(args, io);
      default:
        io.err(`unknown vault subcommand: ${subcommand}\n${USAGE}`);
        return 1;
    }
  } catch (error) {
    io.err(`vault: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
