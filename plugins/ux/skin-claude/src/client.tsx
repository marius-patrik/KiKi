import icon from "thesvg/claude";

export interface SkinBrandProps {
  readonly size?: number;
}

/** ClaudeBrandMark implementation. */
export function ClaudeBrandMark({ size = 24 }: SkinBrandProps): JSX.Element {
  return (
    <span
      aria-label="Claude"
      role="img"
      style={{ width: size, height: size, display: "block", flex: "0 0 auto", color: "#D97757" }}
      dangerouslySetInnerHTML={{ __html: icon.svg }}
    />
  );
}

/**
 * Returns a JSX element displaying the text "Claude" in bold and slightly tighter spacing.
 * The text is rendered with a font weight of 650 and a letter spacing of -0.01em.
 */
export function ClaudeBrandName(): JSX.Element {
  return <span style={{ fontWeight: 650, letterSpacing: "-0.01em" }}>Claude</span>;
}
