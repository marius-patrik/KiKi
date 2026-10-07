/**
 * The runtime persona catalog: id → persona, re-indexed from the authoring
 * root at boot and whenever the authoring directory changes. The `persona:policy`
 * prompt section reads it synchronously on every assembly, so the catalog is
 * an in-memory index, not a per-assembly filesystem walk.
 * @module agents/catalog
 */

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parsePersona, type Persona } from "./persona.js";

/** The authoring file extensions the catalog indexes. */
const PERSONA_EXTENSIONS = new Set([".md", ".json"]);

/** The catalog's authoring directory, as resolved by the caller. */
export interface PersonaCatalogConfig {
  root: string;
}

/**
 * The runtime persona index. `load()` replaces the index wholesale; a file
 * that fails to parse (or disappear) simply stops being known. `get()` is a
 * pure map read so the prompt section stays synchronous.
 */
export class PersonaCatalog {
  private readonly personas = new Map<string, Persona>();

  /** Constructs an instance. */
  constructor(private readonly config: PersonaCatalogConfig) {}

  /** Re-index the authoring root. Never throws; unreadable files are skipped. */
  async load(): Promise<void> {
    // jscpd:ignore-start -- catalog file-loading logic parallels agent-actions/src/catalog.ts for a different authoring domain (actions vs personas); kept independent so the two domains can diverge
    this.personas.clear();
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
        const persona = parsePersona(source, await readFile(source, "utf8"));
        // jscpd:ignore-end
        this.personas.set(persona.id, persona);
      } catch {
        // The sync path reports unparsable files; the catalog just skips them.
      }
    }
  }

  /** The persona with the given id, or `undefined` when not in the index. */
  get(personaId: string): Persona | undefined {
    return this.personas.get(personaId);
  }

  /** Display name for a persona id (falls back to the id). */
  nameOf(personaId: string): string {
    return this.personas.get(personaId)?.name ?? personaId;
  }

  /** The known persona ids, for command validation and completion. */
  ids(): readonly string[] {
    // jscpd:ignore-start -- catalog file-loading logic parallels agent-actions/src/catalog.ts for a different authoring domain (actions vs personas); kept independent so the two domains can diverge
    return [...this.personas.keys()];
  }
}

/** The normalized extension of a persona file, or undefined for other files. */
function extensionOf(name: string): string | undefined {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return undefined;
  const extension = name.slice(dot).toLowerCase();
  return PERSONA_EXTENSIONS.has(extension) ? extension : undefined;
  // jscpd:ignore-end
}
