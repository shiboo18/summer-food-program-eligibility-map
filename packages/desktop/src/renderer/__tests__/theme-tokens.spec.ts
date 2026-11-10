import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/* theme.css owns every theme decision; styles.css only lays components out with
   its tokens. These checks keep a stray value from creeping back in. */

const read = (name: string): string => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), "utf8");
/** Comments are prose, so only declarations are checked. */
const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

const styles = withoutComments(read("styles.css"));
const theme = withoutComments(read("theme.css"));

/** Every `property: value` declaration, as [property, value] pairs. */
function declarations(css: string): Array<readonly [string, string]> {
  return [...css.matchAll(/([\w-]+)\s*:\s*([^;{}]+);/g)].map((match) => [match[1] ?? "", (match[2] ?? "").trim()]);
}

function valuesOf(css: string, properties: readonly string[]): string[] {
  return declarations(css)
    .filter(([property]) => properties.includes(property))
    .map(([, value]) => value);
}

function definedTokens(css: string): Set<string> {
  return new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1] ?? ""));
}

function usedTokens(css: string): Set<string> {
  return new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1] ?? ""));
}

/** The declarations inside the first rule with exactly this selector. */
function ruleBody(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    return "";
  }
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

describe("theme tokens", () => {
  test("styles.css names no colour of its own", () => {
    const literals = declarations(styles)
      .map(([, value]) => value)
      .filter((value) => /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i.test(value));

    expect(literals).toEqual([]);
  });

  test("every font size comes from the type scale", () => {
    const sizes = valuesOf(styles, ["font-size"]).filter((value) => !/^var\(--font-size-[\w-]+\)$/.test(value));

    expect(sizes).toEqual([]);
  });

  test("every shadow comes from the theme", () => {
    const shadows = valuesOf(styles, ["box-shadow"]).filter(
      (value) => value !== "none" && !/^var\(--shadow-[\w-]+\)$/.test(value),
    );

    expect(shadows).toEqual([]);
  });

  test("every animation and transition timing comes from the theme", () => {
    const timings = valuesOf(styles, ["animation", "transition", "animation-duration", "transition-duration"]).filter(
      (value) => /\d(?:\.\d+)?m?s\b/.test(value),
    );

    expect(timings).toEqual([]);
  });

  test("every corner radius comes from the theme, or is a circle or a pill", () => {
    const radii = valuesOf(styles, ["border-radius"]).filter(
      (value) => !/^var\(--radius-[\w-]+\)$/.test(value) && value !== "50%" && value !== "999px",
    );

    expect(radii).toEqual([]);
  });

  test("every token styles.css uses is defined", () => {
    const defined = new Set([...definedTokens(theme), ...definedTokens(styles)]);

    const undefinedTokens = [...usedTokens(styles)].filter((token) => !defined.has(token));

    expect(undefinedTokens).toEqual([]);
  });

  test("the light and dark themes define the same colours", () => {
    const light = [...definedTokens(ruleBody(theme, 'html[data-theme="light"]'))].sort();
    const dark = [...definedTokens(ruleBody(theme, 'html[data-theme="dark"]'))].sort();

    expect(light.length).toBeGreaterThan(0);
    expect(dark).toEqual(light);
  });
});
