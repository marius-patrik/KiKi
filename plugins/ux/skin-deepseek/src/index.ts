import type { ComponentType } from "react";
import type { SVGProps } from "react";

export const skinId = "deepseek" as const;
export const skinLabel = "DeepSeek";

export type BrandComponent = ComponentType<
  { size?: number } & Omit<SVGProps<SVGSVGElement>, "width" | "height">
>;
