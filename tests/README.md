# Checks

Run from the repository root with Node.js:

```sh
node --check bilibili-youtube-volume.user.js
node tests/audio.test.cjs
node tests/wheel.test.cjs
```

`audio.test.cjs` evaluates the actual AudioWorklet processor in a Node VM with synthetic stereo input. It checks the gain cap, settled RMS target, noise gate, mute reset, immediate manual-volume changes, sample ceiling, exact settled bypass, stereo linking, and music-category classification. It does not play sound or measure LUFS/true peak.

`wheel.test.cjs` runs the actual synchronization, range setter and wheel handler in a Node VM with simulated platforms and events. Its 48 checks cover Mac fallback, explicit inversion flags, all four directions, non-Mac behavior, fractional precision, modifiers and bounds. It does not establish the physical device direction on a real Mac.

## Browser fixtures

These files define browser-console functions; they are not Node or Playwright programs. Use a disposable Bilibili page with the normal BPX player. Read the test files before running them.

Load the userscript text as `source` in the page's developer console, for example by assigning its full file contents as a JavaScript string. Paste a fixture file, then invoke its function:

| File | Invocation | Checks |
| --- | --- | --- |
| `volume.browser.js` | `await selfTest(source)` | 176 volume, mute, wheel/trackpad, rebuild and multiple-player assertions |
| `features.browser.js` | `await featureTest(source)` | 24 settings and audio-integration assertions |
| `theme.browser.js` | `await themeTest(source)` | 14 native-style, theme-variable and toggle assertions |

The first two suites create and remove isolated iframes. The audio integration suite uses muted local WAV data, temporarily changes the script's preferences, restores saved preferences in `finally`, and closes its test audio contexts. A real page gesture may be needed before running it because of autoplay restrictions. The volume suite takes approximately 14 seconds. It includes fractional deltas, horizontal and vertical travel, pixel/line/page units, event-frequency independence, Mac natural-scrolling fallback and explicit inversion flags, exact external gain synchronization, and immediate reversal at either endpoint.

The theme suite requires the script's stylesheet and Bilibili's native autoplay switch to exist. It temporarily replaces the script's CSS, compares a new switch to a native clone under three accent colors, checks label/track activation and status indicators, then restores the stylesheet and removes its fixture. Run it on the site's existing theme; it does not modify theme preferences.

Fixture success does not prove userscript-manager injection timing, physical mouse/trackpad behavior, every third-party theme, or subjective listening quality. Also review real playback, seek/navigation, native audio effects, keyboard interaction, and ordinary/fullscreen layouts when changing those behaviors.
