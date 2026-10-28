// ==UserScript==
// @name         Bilibili YouTube 樣式音量條
// @namespace    local.bilibili-youtube-volume
// @version      1.4.1
// @description  將音量移到左側，向右展開加長音量條，支援滾輪、觸控板雙指無級調整與聽感刻度，附音量平衡。
// @match        https://www.bilibili.com/*
// @match        https://player.bilibili.com/*
// @grant        none
// @run-at       document-start
// @license      MIT
// @author       TW527E
// @homepageURL  https://github.com/TW527E/bilibili-youtube-volume
// @supportURL   https://github.com/TW527E/bilibili-youtube-volume/issues
// @downloadURL  https://raw.githubusercontent.com/TW527E/bilibili-youtube-volume/main/bilibili-youtube-volume.user.js
// @updateURL    https://raw.githubusercontent.com/TW527E/bilibili-youtube-volume/main/bilibili-youtube-volume.user.js
// ==/UserScript==

(() => {
  'use strict';
  if (window.__biliYtVolumeVersion) return;
  window.__biliYtVolumeVersion = '1.4.1';
  // The processor runs on the audio thread, including when the tab is in the background.
  function balanceModule() {
    class BalanceProcessor extends AudioWorkletProcessor {
      static get parameterDescriptors() {
        return [
          { name: 'enabled', defaultValue: 0, automationRate: 'k-rate' },
          { name: 'volume', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
        ];
      }
      constructor() {
        super();
        this.power = 0;
        this.gain = 1;
        this.compression = 1;
        this.mix = 0;
      }
      process(inputs, outputs, parameters) {
        const input = inputs[0], output = outputs[0];
        if (!input.length || !output.length) return true;
        const volume = parameters.volume[0], enabled = parameters.enabled[0] > 0.5;
        const frames = output[0].length;
        if (volume === 0) {
          output.forEach(channel => channel.fill(0));
          this.power = 0;
          this.gain = this.compression = 1;
          return true;
        }
        const dt = frames / sampleRate;
        let power = 0;
        for (const channel of input) for (const sample of channel) power += (sample / volume) ** 2;
        power /= frames * input.length;
        this.power += (power - this.power) * (1 - Math.exp(-dt / 0.3));
        const rms = Math.sqrt(this.power);
        // 目標約 -12 dBFS RMS，最多補償 +12 dB；-40 dBFS 以下不追增益，避免拉高底噪。
        const target = Math.sqrt(power) < 0.01 || rms < 0.01 ? 1 : Math.max(0.25, Math.min(4, 0.251 / rms));
        this.gain += (target - this.gain) * (1 - Math.exp(-dt / (target < this.gain ? 0.15 : 2)));
        const attack = 1 - Math.exp(-1 / sampleRate / 0.003);
        const release = 1 - Math.exp(-1 / sampleRate / 0.25);
        const fade = 1 - Math.exp(-1 / sampleRate / 0.015);
        for (let i = 0; i < frames; i++) {
          let peak = 0;
          for (const channel of input) peak = Math.max(peak, Math.abs(channel[i] / volume * this.gain));
          // Leave 6 dB above the RMS target before stereo-linked 4:1 compression and the peak ceiling.
          const reduction = peak > 0.501 ? (0.501 / peak) ** 0.75 : 1;
          this.compression += (reduction - this.compression) *
            (reduction < this.compression ? attack : release);
          this.mix += ((enabled ? 1 : 0) - this.mix) * fade;
          if (!enabled && this.mix < 0.00001) this.mix = 0;
          for (let ch = 0; ch < output.length; ch++) {
            const original = input[Math.min(ch, input.length - 1)][i];
            const processed = Math.max(-0.98, Math.min(0.98,
              original / volume * this.gain * this.compression)) * volume;
            output[ch][i] = original + (processed - original) * this.mix;
          }
        }
        return true;
      }
    }
    registerProcessor('bili-volume-balance', BalanceProcessor);
  }

  const audioByVideo = new WeakMap();
  const audioByContext = new WeakMap();
  const originalCreate = window.AudioContext?.prototype.createMediaElementSource;
  const originalConnect = window.AudioNode?.prototype.connect;
  const originalDisconnect = window.AudioNode?.prototype.disconnect;
  let refresh = () => {};

  function captureAudio(context, video, source, owned = false) {
    const entry = { context, video, source, owned, outputs: new Map(), processor: null, pending: null, error: '' };
    audioByVideo.set(video, entry);
    if (audioByContext.has(context)) {
      entry.error = '此播放器共用音訊通道，無法單獨平衡音量';
      const previous = audioByContext.get(context);
      previous.error = entry.error;
      if (previous.processor) previous.processor.parameters.get('enabled').value = 0;
    } else audioByContext.set(context, entry);
    return entry;
  }

  // Observe the native graph early; retain its effects and intercept only its final speaker connection.
  if (originalCreate) {
    AudioContext.prototype.createMediaElementSource = function (video) {
      const existing = audioByVideo.get(video);
      if (existing?.source) {
        if (existing.context === this) return existing.source;
        // Bilibili may enable its own effects later. Bridge into that context without creating a second media source.
        const bridge = existing.context.createMediaStreamDestination();
        const source = this.createMediaStreamSource(bridge.stream);
        originalDisconnect.call(existing.source);
        existing.outputs.delete(existing.source);
        originalConnect.call(existing.source, bridge);
        captureAudio(this, video, source).upstream = existing;
        queueMicrotask(refresh);
        return source;
      }
      const source = originalCreate.call(this, video);
      if (video.closest('.bpx-player-container')) captureAudio(this, video, source);
      return source;
    };
    AudioNode.prototype.connect = function (destination, ...args) {
      const entry = audioByContext.get(this.context);
      if (entry && destination === this.context.destination) {
        originalConnect.call(this, entry.processor || destination, ...args);
        if (!entry.outputs.has(this)) entry.outputs.set(this, new Set());
        entry.outputs.get(this).add(args[0] || 0);
        return destination;
      }
      return originalConnect.call(this, destination, ...args);
    };
    AudioNode.prototype.disconnect = function (...args) {
      const entry = audioByContext.get(this.context);
      const destination = this.context.destination;
      const mapped = entry?.processor && args[0] === destination ? [entry.processor, ...args.slice(1)] : args;
      const result = originalDisconnect.apply(this, mapped);
      if (entry && (!args.length || typeof args[0] === 'number' || args[0] === destination)) {
        const index = typeof args[0] === 'number' ? args[0] : args[1];
        if (index === undefined) entry.outputs.delete(this);
        else entry.outputs.get(this)?.delete(index);
      }
      return result;
    };
  }

  function safeMedia(video) {
    if (!(video instanceof HTMLMediaElement) || !video.currentSrc || video.readyState < 2) return false;
    try {
      const url = new URL(video.currentSrc, location.href);
      return url.origin === location.origin || Boolean(video.crossOrigin);
    } catch { return false; }
  }

  async function prepareAudio(entry) {
    if (entry.processor || entry.error) return;
    if (entry.pending) return entry.pending;
    entry.pending = (async () => {
      const { context, video } = entry;
      let url;
      try {
        if (!context.audioWorklet) throw new Error('瀏覽器不支援音量平衡');
        url = URL.createObjectURL(new Blob([`(${balanceModule.toString()})();`], { type: 'text/javascript' }));
        await context.audioWorklet.addModule(url);
        // Never take ownership while the context is suspended: the original video must remain audible.
        if (entry.owned) await context.resume();
        const processor = new AudioWorkletNode(context, 'bili-volume-balance', {
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
          parameterData: { enabled: 0, volume: video.muted ? 0 : video.volume }
        });
        if (!entry.source) {
          entry.source = originalCreate.call(context, video);
          originalConnect.call(entry.source, context.destination);
          entry.outputs.set(entry.source, new Set([0]));
        }
        originalConnect.call(processor, context.destination);
        const moved = [];
        try {
          for (const [node, indices] of entry.outputs) for (const index of indices) {
            moved.push([node, index]);
            originalDisconnect.call(node, context.destination, index);
            originalConnect.call(node, processor, index, 0);
          }
        } catch (error) {
          for (const [node, index] of moved) {
            try { originalDisconnect.call(node, processor, index); } catch { /* Connect may have failed. */ }
            originalConnect.call(node, context.destination, index);
          }
          originalDisconnect.call(processor);
          throw error;
        }
        entry.processor = processor;
        processor.addEventListener('processorerror', () => {
          // Restore direct audio on a processor failure.
          for (const [node, indices] of entry.outputs) for (const index of indices) {
            originalDisconnect.call(node, processor, index);
            originalConnect.call(node, context.destination, index);
          }
          originalDisconnect.call(processor);
          entry.processor = null;
          entry.error = '音量平衡已停止，已恢復原音';
          refresh();
        });
      } catch (error) {
        entry.error = error.name === 'InvalidStateError'
          ? '音訊已被其他音效接管，請重新載入後再試'
          : '目前無法啟用音量平衡';
        if (entry.owned && !entry.source) context.close().catch(() => {});
        console.warn('[Bilibili 音量平衡]', error);
      } finally {
        if (url) URL.revokeObjectURL(url);
        refresh();
      }
    })();
    return entry.pending;
  }

  function resumeAudio(video) {
    for (let entry = audioByVideo.get(video); entry; entry = entry.upstream) {
      if (entry.context.state === 'suspended') entry.context.resume().catch(() => {});
    }
  }
  function suspendDetachedAudio(video) {
    if (video.isConnected) return;
    // Suspend instead of closing: the site may reinsert the same media element.
    for (let entry = audioByVideo.get(video); entry; entry = entry.upstream) {
      if (entry.owned && entry.context.state === 'running') entry.context.suspend().catch(() => {});
    }
  }
  function applyAudio(video, enabled) {
    let entry = audioByVideo.get(video);
    if (!entry && enabled && safeMedia(video) && originalCreate) {
      entry = captureAudio(new AudioContext(), video, null, true);
    }
    if (!entry) return '';
    if (entry.source && video.isConnected && !video.paused) resumeAudio(video);
    if (entry.context.state === 'closed') entry.error = '音訊通道已關閉，請重新載入影片';
    if (entry.processor) {
      entry.processor.parameters.get('volume').value = video.muted ? 0 : video.volume;
      entry.processor.parameters.get('enabled').value = enabled && !entry.error ? 1 : 0;
    } else if (enabled) prepareAudio(entry);
    return entry.error;
  }

  const preferenceKey = 'bili-yt-player-preferences-v1';
  let preferences = { balanceMode: 'except-music' };
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey));
    if (['all', 'except-music', 'off'].includes(saved?.balanceMode)) preferences.balanceMode = saved.balanceMode;
    else if (saved) preferences.balanceMode = saved.balance === false ? 'off' : saved.musicBalance === true ? 'all' : 'except-music';
  } catch { /* Storage may be unavailable; session controls still work. */ }
  function savePreferences() {
    try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* Session only. */ }
  }

  const categoryCache = new Map();
  const videoChoices = new Map();
  let categoryRequest = '';
  function videoId() {
    return location.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1] || new URLSearchParams(location.search).get('bvid') || '';
  }
  function musicCategory(data) {
    const tid = Number(data.tid_v2);
    if (tid > 0) return tid === 1003 || (tid >= 2016 && tid <= 2027);
    const legacy = Number(data.tid);
    if (legacy > 0) return [3, 28, 29, 30, 31, 54, 59, 130, 158, 193, 243, 244, 265, 266, 267].includes(legacy);
    return null;
  }
  function category() {
    const id = videoId();
    if (!id) return null;
    const data = window.__INITIAL_STATE__?.videoData;
    if (data?.bvid === id) {
      const music = musicCategory(data);
      if (music !== null) categoryCache.set(id, music);
    }
    if (categoryCache.has(id)) return categoryCache.get(id);
    if (categoryRequest !== id) {
      categoryRequest = id;
      fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(id)}`, { credentials: 'omit' })
        .then(response => response.ok ? response.json() : null)
        .then(result => {
          if (result?.code === 0 && result.data?.bvid === id) categoryCache.set(id, musicCategory(result.data));
          if (videoId() === id) refresh();
        }).catch(() => {});
    }
    return null;
  }

  const featureStates = new Map();
  let balanceSettingId = 0;
  function makeSwitch(label, onChange) {
    const row = document.createElement('label');
    row.className = 'bili-yt-setting bui bui-switch';
    const area = document.createElement('span');
    area.className = 'bui-area';
    const control = document.createElement('span');
    control.className = 'bui-switch-label';
    const text = document.createElement('span');
    text.className = 'bui-switch-name';
    text.textContent = label;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'bui-switch-input';
    input.setAttribute('role', 'switch');
    input.setAttribute('aria-label', label);
    const track = document.createElement('span');
    track.className = 'bui-switch-body';
    track.setAttribute('aria-hidden', 'true');
    track.innerHTML = '<span class="bui-switch-dot"><span></span></span>';
    control.append(text, track);
    area.append(input, control);
    row.append(area);
    input.addEventListener('change', () => onChange(input.checked));
    for (const type of ['click', 'dblclick', 'keydown', 'keyup']) row.addEventListener(type, event => event.stopPropagation());
    return { row, input };
  }
  function mountFeatures(root) {
    const area = root.querySelector('.bpx-player-video-area');
    if (area) root.style.setProperty('--bili-yt-settings-height', `${Math.max(180, area.clientHeight - 72)}px`);
    let state = featureStates.get(root);
    if (!state) {
      state = { video: null, sync: () => refresh(), menus: [] };
      state.menuObserver = new ResizeObserver(entries => {
        for (const { target } of entries) if (target.offsetHeight) {
          const side = target.classList.contains('bpx-player-ctrl-setting-menu-left') ? 'left' : 'right';
          target.closest('.bui-panel-wrap')?.style.setProperty(`--bili-yt-menu-${side}`, `${target.offsetHeight}px`);
        }
      });
      state.balance = makeSwitch('音量平衡', checked => {
        videoChoices.set(videoId(), checked);
        refresh();
        if (state.video) resumeAudio(state.video);
      });
      const row = document.createElement('div');
      row.className = 'bili-yt-balance-default';
      row.setAttribute('role', 'radiogroup');
      row.setAttribute('aria-label', '開啟音量平衡');
      const name = `bili-yt-balance-default-${++balanceSettingId}`;
      row.innerHTML = `<div class="bili-yt-default-title">開啟音量平衡</div>
        <div class="bui bui-radio bui-dark"><div class="bui-area"><div class="bui-radio-wrap bui-radio-button"><div class="bui-radio-group">
          <label class="bui-radio-item"><input type="radio" class="bui-radio-input" name="${name}" value="all" aria-label="所有視頻"><span class="bui-radio-label"><span class="bui-radio-text">所有視頻</span></span></label>
          <label class="bui-radio-item"><input type="radio" class="bui-radio-input" name="${name}" value="except-music" aria-label="除了音樂分區"><span class="bui-radio-label"><span class="bui-radio-text">除了音樂分區</span></span></label>
          <label class="bui-radio-item"><input type="radio" class="bui-radio-input" name="${name}" value="off" aria-label="關閉"><span class="bui-radio-label"><span class="bui-radio-text">關閉</span></span></label>
        </div></div></div></div>`;
      const inputs = [...row.querySelectorAll('input')];
      row.addEventListener('change', () => {
        preferences.balanceMode = inputs.find(input => input.checked).value;
        videoChoices.clear();
        savePreferences(); refresh();
      });
      for (const type of ['click', 'dblclick', 'keydown', 'keyup']) row.addEventListener(type, event => event.stopPropagation());
      state.balanceDefault = { row, inputs };
      featureStates.set(root, state);
    }
    const menu = root.querySelector('.bpx-player-ctrl-setting-menu-left');
    if (menu && state.balance.row.parentElement !== menu) {
      const before = menu.querySelector('.bpx-player-ctrl-setting-more');
      menu.insertBefore(state.balance.row, before);
    }
    const more = root.querySelector('.bpx-player-ctrl-setting-menu-right');
    if (more && state.balanceDefault.row.parentElement !== more) more.insertBefore(state.balanceDefault.row, more.querySelector('.bpx-player-ctrl-setting-others'));
    if (state.menus[0] !== menu || state.menus[1] !== more) {
      state.menuObserver.disconnect();
      state.menus = [menu, more];
      state.menus.filter(Boolean).forEach(item => state.menuObserver.observe(item));
    }
    const video = root.querySelector('video, bwp-video');
    if (state.video !== video) {
      if (state.video) {
        applyAudio(state.video, false);
        suspendDetachedAudio(state.video);
        for (const event of ['play', 'playing', 'pause', 'ended', 'volumechange', 'loadeddata', 'emptied']) state.video.removeEventListener(event, state.sync);
      }
      state.video = video;
      if (video) for (const event of ['play', 'playing', 'pause', 'ended', 'volumechange', 'loadeddata', 'emptied']) video.addEventListener(event, state.sync);
    }
    const music = category();
    const enabled = videoChoices.get(videoId()) ?? (preferences.balanceMode === 'all' || (preferences.balanceMode === 'except-music' && music === false));
    const error = video && !(video instanceof HTMLMediaElement) ? '此播放器不支援音量平衡' : video ? applyAudio(video, enabled) : '';
    const entry = video && audioByVideo.get(video);
    state.balanceDefault.inputs.forEach(input => { input.checked = input.value === preferences.balanceMode; });
    state.balanceDefault.row.title = '設定預設啟用範圍；設定首頁的開關只切換目前影片';
    state.balance.input.checked = enabled && !error;
    state.balance.row.title = error || (music === null && preferences.balanceMode === 'except-music' ? '尚未取得分區，預設關閉；仍可手動開啟' : '平衡大小聲，保留手動音量；預設範圍可在更多播放設定調整');
    state.balance.input.disabled = !originalCreate || Boolean(error);
    state.balance.row.dataset.status = error ? 'error' : enabled && !entry?.processor ? 'pending' : '';
    state.balance.input.setAttribute('aria-description', state.balance.row.title);
  }

  function start() {
  const styleId = 'bili-yt-volume-style';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .bili-yt-setting { height: 32px; width: 100%; }
    .bili-yt-setting .bui-switch-label { column-gap: 14px; }
    .bpx-player-ctrl-setting-menu-left:has(> .bili-yt-setting),
    .bui-panel-item:has(> .bpx-player-ctrl-setting-menu-left > .bili-yt-setting),
    .bui-panel-item:has(> .bpx-player-ctrl-setting-menu-right > .bili-yt-balance-default) { height: auto !important; align-self: flex-start; }
    .bui-panel-wrap:has(.bui-panel-item-active > .bpx-player-ctrl-setting-menu-left > .bili-yt-setting) { height: var(--bili-yt-menu-left) !important; }
    .bui-panel-wrap:has(.bui-panel-item-active > .bpx-player-ctrl-setting-menu-right > .bili-yt-balance-default) { height: var(--bili-yt-menu-right) !important; }
    .bpx-player-ctrl-setting-menu-right:has(> .bili-yt-balance-default) { max-height: var(--bili-yt-settings-height, 360px); overflow-y: auto; }
    .bpx-player-ctrl-setting-menu-right:has(> .bili-yt-balance-default) > * { flex-shrink: 0; }
    .bili-yt-balance-default { margin: 0 0 12px; font-size: 12px; }
    .bili-yt-default-title { line-height: 16px; margin-bottom: 4px; }
    .bili-yt-balance-default .bui-radio.bui-dark .bui-radio-group { display: grid; grid-template-columns: 1fr 1.4fr .75fr; gap: 8px; height: 22px; }
    .bili-yt-balance-default .bui-radio.bui-dark .bui-radio-item { width: auto; min-width: 0; margin: 0; }
    .bili-yt-balance-default .bui-radio.bui-dark .bui-radio-label { box-sizing: border-box; padding: 0 8px; justify-content: center; }
    .bili-yt-balance-default input:focus-visible + .bui-radio-label { outline: 2px solid currentColor; outline-offset: -2px; }
    .bili-yt-setting input:focus-visible + .bui-switch-label .bui-switch-body { outline: 2px solid currentColor; outline-offset: 3px; }
    .bili-yt-setting:has(input:disabled) { opacity: .5; cursor: default; }
    .bili-yt-setting[data-status='pending'] .bui-switch-name::after { content: ' · 待播放'; opacity: .65; }
    .bili-yt-setting[data-status='error'] .bui-switch-name::after { content: ' · 無法啟用'; opacity: .65; }
    .bili-yt-volume {
      display: inline-flex; align-items: center; flex: 0 0 auto;
      align-self: flex-start; direction: ltr;
      --bili-yt-level: 0;
    }
    .bili-yt-volume > .bpx-player-ctrl-volume {
      flex: 0 0 auto; height: auto !important; margin: 0 !important; padding: 0 !important;
    }
    .bili-yt-volume .bpx-player-ctrl-volume-box { display: none !important; }
    .bili-yt-volume[data-muted="true"] .bpx-player-ctrl-volume-icon,
    .bili-yt-volume[data-muted="false"] .bpx-player-ctrl-muted-icon { display: none !important; }
    .bili-yt-volume[data-muted="false"] .bpx-player-ctrl-volume-icon,
    .bili-yt-volume[data-muted="true"] .bpx-player-ctrl-muted-icon { display: block !important; }
    .bili-yt-volume-rail {
      position: relative; display: block; flex: 0 0 auto;
      width: 0; height: 22px; overflow: hidden; opacity: 0;
      transition: width 180ms ease, opacity 180ms ease;
    }
    .bili-yt-volume:hover .bili-yt-volume-rail,
    .bili-yt-volume:focus-within .bili-yt-volume-rail {
      width: 132px; opacity: 1;
    }
    .bili-yt-volume-rail::before, .bili-yt-volume-rail::after {
      content: ''; position: absolute; left: 12px; top: calc(50% - 1.5px);
      height: 3px; border-radius: 0; pointer-events: none;
    }
    .bili-yt-volume-rail::before { width: 108px; background: #ffffff59; }
    .bili-yt-volume-rail::after {
      width: calc(108px * var(--bili-yt-level)); background: #fff;
    }
    .bili-yt-volume-input {
      appearance: none !important; -webkit-appearance: none !important;
      position: relative; display: block; box-sizing: border-box;
      width: 120px !important; height: 22px !important; margin: 0 6px !important;
      padding: 0 !important; border: 0 !important; border-radius: 0;
      background: transparent !important; cursor: pointer; direction: ltr;
      touch-action: pan-y;
    }
    .bili-yt-volume-input::-webkit-slider-runnable-track {
      height: 3px; background: transparent; border: 0;
    }
    .bili-yt-volume-input::-webkit-slider-thumb {
      appearance: none; -webkit-appearance: none; width: 12px; height: 12px;
      margin-top: -4.5px; border: 0; border-radius: 50%; background: #fff;
    }
    .bili-yt-volume-input::-moz-range-track {
      height: 3px; background: transparent; border: 0;
    }
    .bili-yt-volume-input::-moz-range-progress { background: transparent; }
    .bili-yt-volume-input::-moz-range-thumb {
      width: 12px; height: 12px; border: 0; border-radius: 50%; background: #fff;
    }
    .bili-yt-volume-input:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
    @media (prefers-reduced-motion: reduce) {
      .bili-yt-volume-rail { transition: none; }
    }
  `;
  document.head.append(style);

  const players = new WeakMap();

  function mount(root) {
    mountFeatures(root);
    const left = root.querySelector('.bpx-player-control-bottom-left');
    const button = root.querySelector('.bpx-player-ctrl-volume');
    if (!left || !button) return;

    let state = players.get(root);
    if (state && state.button !== button) {
      root.removeEventListener('volumechange', state.sync, true);
      state.group.remove();
      state = null;
    }
    if (!state) {
      const group = document.createElement('div');
      group.className = 'bili-yt-volume';
      const rail = document.createElement('span');
      rail.className = 'bili-yt-volume-rail';
      const input = document.createElement('input');
      input.className = 'bili-yt-volume-input';
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = 'any';
      input.setAttribute('aria-label', '音量');
      group.title = '滾輪或雙指滑動調整音量（向右／向上增加）';
      rail.append(input);
      group.append(rail);

      // shortcut: 僅支援 BPX 播放器；站方更換 DOM 時再更新選擇器。
      const media = () => root.querySelector('video, bwp-video');
      let lastVolume = 0;
      const sync = () => {
        const video = media();
        input.disabled = !video || !Number.isFinite(video.volume);
        if (input.disabled) return;
        if (video.volume > 0) lastVolume = video.volume;
        group.dataset.muted = String(video.muted || video.volume === 0);
        // 保留聽感刻度的小數，讓高精度觸控板事件不被每次取整吃掉。
        const value = video.muted ? 0 : Math.cbrt(video.volume) * 100;
        input.value = String(value);
        input.setAttribute('aria-valuetext', `${Number(value.toFixed(2))}%`);
        group.style.setProperty('--bili-yt-level', String(value / 100));
      };
      const setVolume = () => {
        const video = media();
        if (!video || !Number.isFinite(video.volume)) return;
        // 三次方近似聽感曲線，讓低音量有更多行程；不是聲壓量測。
        video.volume = (input.valueAsNumber / 100) ** 3;
        if (video.volume > 0) video.muted = false;
        sync();
      };
      input.addEventListener('input', setVolume);
      group.addEventListener('wheel', event => {
        const scale = event.deltaMode === 1 ? 5 / 3 : event.deltaMode === 2 ? 5 : 0.05;
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : -event.deltaY;
        // shortcut: 沒有反向標記時，Mac 像素滑動按預設自然捲動處理；非預設方向需再校準。
        const inverted = typeof event.webkitDirectionInvertedFromDevice === 'boolean'
          ? event.webkitDirectionInvertedFromDevice
          : event.deltaMode === 0 && /Mac/.test(navigator.platform);
        if (event.ctrlKey || event.shiftKey || !delta) return;
        sync();
        if (input.disabled) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        input.value = String(Math.max(0, Math.min(100, input.valueAsNumber + delta * scale * (inverted ? -1 : 1))));
        setVolume();
      }, { capture: true, passive: false });
      // 原生按鈕會把極低音量當成零；以 muted 切換，保留未捨入的音量。
      button.addEventListener('click', event => {
        const video = media();
        if (!video || !Number.isFinite(video.volume)) return;
        if (video.volume === 0 && lastVolume === 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (video.volume === 0) {
          video.volume = lastVolume;
          video.muted = false;
        } else {
          video.muted = !video.muted;
        }
        sync();
      }, true);
      // 保留 range 的原生拖曳與鍵盤操作，避免事件觸發播放器快捷鍵。
      for (const type of ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown', 'keyup']) {
        input.addEventListener(type, event => event.stopPropagation());
      }
      // 滑鼠操作結束後不留下焦點，移開才會收起；鍵盤焦點仍保留。
      group.addEventListener('pointerup', () => {
        if (group.contains(document.activeElement)) document.activeElement.blur();
      });
      root.addEventListener('volumechange', sync, true);
      group.addEventListener('mouseenter', sync);
      group.addEventListener('focusin', sync);
      state = { button, group, sync };
      players.set(root, state);
    }
    if (button.parentElement !== state.group) state.group.prepend(button);
    if (state.group.parentElement !== left) {
      left.insertBefore(state.group, left.querySelector('.bpx-player-ctrl-time'));
    }
    state.sync();
  }

  const scan = () => {
    for (const [root, state] of featureStates) if (!root.isConnected) {
      if (state.video) {
        applyAudio(state.video, false);
        suspendDetachedAudio(state.video);
        for (const event of ['play', 'playing', 'pause', 'ended', 'volumechange', 'loadeddata', 'emptied']) state.video.removeEventListener(event, state.sync);
      }
      state.menuObserver.disconnect();
      featureStates.delete(root);
    }
    document.querySelectorAll('.bpx-player-container').forEach(mount);
  };
  refresh = scan;
  // Route and metadata changes need a low-frequency check even when the player DOM is reused.
  let poll = setInterval(scan, 1000);
  document.addEventListener('pointerdown', () => {
    for (const { video } of featureStates.values()) if (video) resumeAudio(video);
  }, { capture: true, passive: true });
  window.addEventListener('pagehide', () => clearInterval(poll));
  window.addEventListener('pageshow', event => { if (event.persisted) { poll = setInterval(scan, 1000); scan(); } });
  const relevant = '.bpx-player-container, .bpx-player-control-bottom-left, .bpx-player-ctrl-volume, .bpx-player-ctrl-setting-menu-left, .bpx-player-ctrl-setting-menu-right, video, bwp-video';
  let scheduled = false;
  new MutationObserver(records => {
    if (scheduled || !records.some(record => [...record.addedNodes].some(node =>
      node.nodeType === 1 && (node.matches(relevant) || node.querySelector(relevant))
    ))) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  }).observe(document.body, { childList: true, subtree: true });
  scan();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
