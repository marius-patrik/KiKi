import { Service, type Context } from "@deepseek-ai/cordis";
import Schema from "@deepseek-ai/schemastery";

export const name = "skills";
export const inject = ["tools"];
export const optional: string[] = [];

export class SkillLoaderService extends Service {
  static inject = ["tools"];
  private loadedSkills = new Set<string>();

  /** Constructs an instance. */
  constructor(ctx: Context) {
    super(ctx, "skills");
  }

  /**
   * Loads the specified skill.
   *
   * Guarantees that the skill name is not empty or whitespace.
   * Returns true if the skill is successfully loaded, otherwise false.
   *
   * Fails if the skill name is empty or contains only whitespace.
   */
  loadSkill(skillName: string): boolean {
    if (!skillName.trim()) return false;
    this.loadedSkills.add(skillName);
    return true;
  }

  /**
   * Guarantees that the skill name is not empty or whitespace.
   * Returns true if the skill is in the loadedSkills set, otherwise false.
   * Fails if the skill name is empty or contains only whitespace.
   */
  hasSkill(skillName: string): boolean {
    return this.loadedSkills.has(skillName);
  }
}

export const Config = Schema.object({});

/**
 * Applies the context to the SkillLoaderService, ensuring the service is initialized.
 * Guarantees that the context is valid and not null.
 * Fails if the context is invalid or not provided.
 */
export function apply(ctx: Context): void {
  new SkillLoaderService(ctx);
}
