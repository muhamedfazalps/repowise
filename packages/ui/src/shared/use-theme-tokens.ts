"use client";

/**
 * Runtime design-token resolution for canvas / library renderers.
 *
 * Most components consume `var(--color-*)` directly and inherit light/dark for
 * free. But renderers that paint to a `<canvas>` or hand colors to a library
 * (Mermaid, Sigma, exported SVG strings) can't use `var()` — they need the
 * *computed* color, read from the live `:root` style, and must re-read +
 * re-render when the user flips the theme.
 *
 * `useThemeVersion()` returns a counter that bumps whenever the `.dark` class
 * (or inline style) on <html> changes — put it in a dependency array to force a
 * re-render on theme switch. `resolveToken()` reads one computed custom
 * property; `resolveTokens()` reads a map of them. Read inside an effect/memo
 * keyed on the theme version so the values track the active theme.
 */

import { useEffect, useState } from "react";

/** Read a single CSS custom property off <html>, resolved to its computed value. */
export function resolveToken(name: string, fallback = ""): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Resolve a `{ key: "--color-var" }` spec to `{ key: "#computed" }`. */
export function resolveTokens<K extends string>(spec: Record<K, string>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key in spec) out[key] = resolveToken(spec[key]);
  return out;
}

/**
 * A counter that increments whenever the document theme changes (the `.dark`
 * class or inline `style` on <html> mutates). Use as a dependency so canvas
 * renderers re-resolve tokens and repaint on light/dark switch.
 */
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setVersion((v) => v + 1));
    observer.observe(root, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    return () => observer.disconnect();
  }, []);
  return version;
}
