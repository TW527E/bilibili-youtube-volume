# Bilibili YouTube-style Volume

[繁體中文](https://github.com/TW527E/bilibili-youtube-volume/blob/main/README.md) · [简体中文](https://github.com/TW527E/bilibili-youtube-volume/blob/main/README.zh-CN.md) · **English**

A userscript that moves Bilibili's volume control to the left and reveals a horizontal slider to its right on hover. Includes wheel and continuous two-finger trackpad adjustment, fine control at low volumes, and optional volume balancing.

**Current version: 1.4.1** · [Install script](https://raw.githubusercontent.com/TW527E/bilibili-youtube-volume/main/bilibili-youtube-volume.user.js) · [Report an issue](https://github.com/TW527E/bilibili-youtube-volume/issues)

## Install and update

You can also install from [GreasyFork](https://greasyfork.org/scripts/602247). GreasyFork periodically synchronizes the script and its description from this repository's `main` branch; updates may not appear immediately after a push. Install from one source to avoid duplicate active copies.

1. Install [Tampermonkey](https://www.tampermonkey.net/) or a compatible userscript manager in your desktop browser.
2. Open the installation link above and confirm installation in the manager.
3. Reload the Bilibili video page.

If the link displays source code, create a script in your manager, paste the entire file, and save it. If you installed a review build, update the existing script with the same name rather than enabling duplicate copies. This GitHub distribution includes update URLs so your manager can check for future versions.

## Controls

| Action | Result |
| --- | --- |
| Hover over the volume icon on the left | Reveals a 108px slider between the play button and the time display |
| Drag the slider | Uses a cubic approximation to a perceptual scale; 50% corresponds to 12.5% media gain |
| Scroll or use two fingers over the icon or slider | Right/up increases and left/down decreases volume continuously in proportion to travel |
| Click the volume icon | Mutes or restores sound while retaining precise low-volume settings |
| Focus the slider with the keyboard | Uses the native range input's arrow keys, Home, and End |

Fractional trackpad deltas move both the slider and gain continuously instead of jumping 5% per event. Equal total travel produces the same adjustment even when split into many tiny events. Direction correction uses the browser’s natural-scrolling inversion flag when available. Without that flag, pixel scrolling on Mac assumes the default natural-scrolling setting. If natural scrolling is disabled on Mac and the browser exposes no flag, direction may still need calibration.

Volume scrolling does not scroll the page. Ctrl and Shift gestures are left alone. Increasing from mute starts at zero and follows the gesture distance; decreasing does not unmute.

The scale is neither a live audio waveform nor a sound-pressure measurement.

## Volume balancing

The **音量平衡** (Volume balance) switch on the first player settings panel affects only the current video. In More playback settings, **開啟音量平衡** selects the default scope:

| Displayed option | Behavior |
| --- | --- |
| 所有視頻 | Enable by default for all categories |
| 除了音樂分區 | **Initial default:** disable for music and enable elsewhere; stay off when the category is unknown |
| 關閉 | Disable by default for all categories |

The default scope is stored in Bilibili's localStorage. Per-video overrides last only for the current page session. Changing the default clears those overrides and applies immediately. You can still enable balancing manually for music or an unknown category.

Switches and options reuse the player's BUI CSS structure and theme variables, so compatible themes can style them. The userscript manages their behavior. Custom player-menu labels currently use Traditional Chinese.

### Audio processing

An AudioWorklet processes audio locally using short-term RMS automatic gain, stereo-linked compression, and a sample-peak ceiling. Manual volume still controls the final output.

- Target: approximately −12 dBFS RMS, with up to approximately +12 dB of upward gain.
- Signals below approximately −40 dBFS do not keep accumulating gain, reducing background-noise amplification.
- Peaks above approximately −6 dBFS receive 4:1 compression. The final sample-amplitude ceiling is 0.98 before manual volume is applied.
- Brief crossfades smooth enabling and disabling; disabling returns to the unprocessed signal.

This approximates stable volume. It is **not YouTube's proprietary Stable Volume algorithm**, LUFS normalization, or a true-peak limiter. Abrupt transients can still distort when they reach the hard ceiling.

## Compatibility and privacy

- Primarily supports desktop Bilibili's BPX player with HTML video, including Traditional Chinese video URLs. A matched URL does not guarantee support for every player type.
- Volume controls, wheel input, settings, and theme variables have been checked in Chromium-family browsers, followed by user review in the actual environment. Firefox, live streams, bangumi, specialized BWP players, multichannel content, and all third-party audio-effect combinations have not been fully validated.
- If safe audio integration is unavailable, the switch reports **無法啟用** (Unavailable). Processor failures attempt to restore direct output. Reloading may be necessary if another effect script takes ownership of the audio first.
- No audio uploads, microphone access, or analytics. When category information is missing from the page, the script requests the current BV video's metadata from Bilibili's public API.
- No theater mode, dark mode, or automatic lights feature. Disable the script and reload to remove its audio routing and interface changes.

## Development and tests

No build step, package installation, or external JavaScript dependencies. With Node.js:

```sh
node --check bilibili-youtube-volume.user.js
node tests/audio.test.cjs
node tests/wheel.test.cjs
```

See [tests/README.md](https://github.com/TW527E/bilibili-youtube-volume/blob/main/tests/README.md) for browser checks covering the volume curve, wheel input, mute, audio routing, category defaults, rebuilt settings, and themes. Synthetic audio checks are not a substitute for listening calibration.

## References and license

This is an independent implementation. The user-supplied [Bilibili 视频音量均衡器](https://greasyfork.org/scripts/557295) by Timothy Tao & Github Copilot (MIT) was used for behavior comparison while tuning loudness; that script was not incorporated directly.

[MIT License](https://github.com/TW527E/bilibili-youtube-volume/blob/main/LICENSE). Not affiliated with Bilibili or YouTube.
