/**
 * The runtime action catalog: id → action, re-indexed from the authoring
 * root at boot and whenever the authoring directory changes. The built-in
 * actions are always present; a file that parses ADDs a custom action or
 * OVERRIDES a built-in of the same id. The prompt section, command
 * validation, and tool/route policies read the catalog synchronously, so it
 * is an in-memory index, not a per-read filesystem walk.
 * @module agent-actions/catalog
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { BUILT_IN_ACTIONS, parseAction, type ActionSpec } from "./action.js";

/** The authoring file extensions the catalog indexes. */
const ACTION_EXTENSIONS = new Set([".md", ".json"]);

/** The catalog's authoring directory, as resolved by the caller. */
export interface ActionCatalogConfig {
  root: string;
}

/**
 * The runtime action index over the built-ins plus the authoring files.
 * `load()` replaces the file-defined half wholesale; a file that fails to
 * parse (or disappears) simply stops contributing, and its built-in (when
 * the id matches one) stands again.
 */
export class ActionCatalog {
  private readonly fileActions = new Map<string, ActionSpec>();

  /** Constructs an instance. */
  constructor(private readonly config: ActionCatalogConfig) {}

  /** Re-index the authoring root. Never throws; unreadable files are skipped. */
  async load(): Promise<void> {
    // jscpd:ignore-start -- catalog file-loading logic parallels agents/src/catalog.ts for a different authoring domain (actions vs personas); kept independent so the two domains can diverge
    this.fileActions.clear();
    let names: string[];
    try {
      names = await readdir(this.config.root);
    } catch {
      return;
    }
    for (const name of names) {
      const extension = extensionOf(name);
      if (extension === undefined) continue;
      const source = join(this.config.root, name);
      try {
        const action = parseAction(source, await readFile(source, "utf8"));
        // jscpd:ignore-end
        this.fileActions.set(action.id, action);
      } catch {
        // Unparsable files are skipped; the built-in vocabulary still stands.
      }
    }
  }

  /** The action with the given id: the file definition wins over the built-in. */
  get(actionId: string): ActionSpec | undefined {
    return (
      this.fileActions.get(actionId) ?? BUILT_IN_ACTIONS.find((action) => action.id === actionId)
    );
  }

  /** Display name for an action id (falls back to the id). */
  nameOf(actionId: string): string {
    return this.get(actionId)?.name ?? actionId;
  }

  /** The known action ids (built-ins plus file-defined), for validation. */
  ids(): readonly string[] {
    return this.list().map((action) => action.id);
  }

  /** The effective vocabulary: every built-in (or its file override), then
   * custom file-defined actions, sorted by id within each half. */
  list(): readonly ActionSpec[] {
    const builtIns = BUILT_IN_ACTIONS.map((builtIn) => this.fileActions.get(builtIn.id) ?? builtIn);
    const customs = [...this.fileActions.values()]
      .filter((action) => !BUILT_IN_ACTIONS.some((builtIn) => builtIn.id === action.id))
      .sort((left, right) => left.id.localeCompare(right.id));
    // jscpd:ignore-start -- catalog file-loading logic parallels agents/src/catalog.ts for a different authoring domain (actions vs personas); kept independent so the two domains can diverge
    return [...builtIns, ...customs];
  }
}

/** The normalized extension of an action file, or undefined for other files. */
function extensionOf(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return undefined;
  const extension = name.slice(dot).toLowerCase();
  return ACTION_EXTENSIONS.has(extension) ? extension : undefined;
  // jscpd:ignore-end
}
