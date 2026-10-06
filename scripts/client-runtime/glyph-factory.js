/**
 * Shared factory for the "line icon" glyph components used across the
 * plugin client bundles: each glyph renders the same 24x24 stroked svg
 * wrapper and differs only in its default size, icon-specific class
 * suffix, whether it forwards a `style` prop, whether it sets
 * `aria-hidden`/`xmlns`, and its svg children.
 *
 * This file is prepended (via each package's build script, the same way
 * crypto-polyfill.js is) ahead of the package's own client.js, which then
 * does `var createGlyphComponent = __dshCreateGlyphComponent(h);` once
 * `h` (React.createElement) is in scope.
 */

/** Resolve the per-instance size and className shared by both glyph factories. */
function __dshGlyphSizeAndClassName(props, defaultSize, classSuffix) {
  return {
    size: props && props.size ? props.size : defaultSize,
    className:
      (props && props.className ? props.className + " " : "") +
      ("dsh-icon-animated" + (classSuffix ? " " + classSuffix : "")),
  };
}

/**
 * A second glyph factory for the "decorated" icon variant: a fixed inline
 * layout style (flex centering, a decorative `color`), optionally merged
 * with a caller-supplied `props.style` rather than replaced by it. Used by
 * icons that carry a baked-in accent color instead of inheriting
 * `currentColor` from context.
 */
function __dshCreateDecoratedGlyphComponent(h) {
  return function createDecoratedGlyphComponent(
    defaultSize,
    classSuffix,
    baseStyle,
    mergeStyle,
    renderChildren,
  ) {
    return function (props) {
      var sizeAndClass = __dshGlyphSizeAndClassName(props, defaultSize, classSuffix);
      var style = mergeStyle
        ? Object.assign({}, baseStyle, (props && props.style) || {})
        : baseStyle;
      return h.apply(
        null,
        [
          "svg",
          {
            width: sizeAndClass.size,
            height: sizeAndClass.size,
            className: sizeAndClass.className,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            style: style,
          },
        ].concat(renderChildren()),
      );
    };
  };
}

/** __dshCreateGlyphComponent implementation. */
function __dshCreateGlyphComponent(h) {
  return function createGlyphComponent(
    defaultSize,
    classSuffix,
    hasStyle,
    hasAria,
    hasXmlns,
    renderChildren,
  ) {
    return function (props) {
      var sizeAndClass = __dshGlyphSizeAndClassName(props, defaultSize, classSuffix);
      var svgProps = {
        width: sizeAndClass.size,
        height: sizeAndClass.size,
        className: sizeAndClass.className,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "2",
        strokeLinecap: "round",
        strokeLinejoin: "round",
      };
      if (hasStyle) {
        svgProps.style = props && props.style ? props.style : undefined;
      }
      if (hasXmlns) {
        svgProps.xmlns = "http://www.w3.org/2000/svg";
      }
      if (hasAria) {
        svgProps["aria-hidden"] = "true";
      }
      return h.apply(null, ["svg", svgProps].concat(renderChildren()));
    };
  };
}
