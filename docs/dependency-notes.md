# Dependency notes

## `@callstack/liquid-glass`

`@callstack/liquid-glass` is a direct dependency because the app uses Liquid Glass-style controls for the floating review/lesson action pill, dashboard study cards, and small navigation/header controls.

We originally approximated the effect with `expo-blur` plus custom colored blobs, borders, shadows, and reflection overlays. That approach produced Android/light-mode artifacts, inconsistent contrast, and a growing amount of bespoke visual code. The Callstack package provides a maintained native `LiquidGlassView` API with explicit `effect`, `tintColor`, `colorScheme`, and unsupported-platform fallback behavior, letting us centralize the styling in small wrappers instead of hand-rolling glass effects across the codebase.

The library is not supported in Expo Go and requires a dev/native build, which this project already uses (`expo-dev-client`). On unsupported platforms/OS versions it renders a normal view, so all usages include fallback background/border styling.
