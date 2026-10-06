import icon from "thesvg/deepseek";
import type { CSSProperties } from "react";

export interface SkinBrandProps {
  readonly size?: number;
}

/** DeepSeekBrandMark implementation. */
export function DeepSeekBrandMark({ size = 24 }: SkinBrandProps): JSX.Element {
  const style: CSSProperties = { width: size, height: size, display: "block", flex: "0 0 auto" };
  return (
    <span
      aria-label="DeepSeek"
      role="img"
      style={style}
      dangerouslySetInnerHTML={{ __html: icon.svg }}
    />
  );
}

/**
 * Returns a styled span element displaying the brand name "DeepSeek".
 * The text is rendered in bold with a specific letter spacing.
 *
 * @returns A JSX element representing the brand name.
 */
export function DeepSeekBrandName(): JSX.Element {
  return <span style={{ fontWeight: 650, letterSpacing: "-0.01em" }}>DeepSeek</span>;
}
