const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'bilibili-youtube-volume.user.js'), 'utf8');
const moduleSource = source.slice(source.indexOf('  function balanceModule()'), source.indexOf('  const audioByVideo'));
let Processor;
vm.runInNewContext(`${moduleSource}\nbalanceModule()`, {
  AudioWorkletProcessor: class {}, sampleRate: 48000,
  registerProcessor(name, processor) { Processor = processor; }
});
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
function run(processor, seconds, amplitude, volume = 1, enabled = 1, antiPhase = false) {
  const blocks = Math.ceil(seconds * 48000 / 128);
  let sum = 0, peak = 0, samples = 0, stereoError = 0;
  for (let block = 0; block < blocks; block++) {
    const input = [new Float32Array(128), new Float32Array(128)];
    const output = [new Float32Array(128), new Float32Array(128)];
    for (let i = 0; i < 128; i++) {
      input[0][i] = amplitude * volume * Math.sin((block * 128 + i) * 2 * Math.PI * 1000 / 48000);
      input[1][i] = input[0][i] * (antiPhase ? -1 : 1);
    }
    processor.process([input], [output], { enabled: [enabled], volume: [volume] });
    for (let i = 0; i < 128; i++) {
      peak = Math.max(peak, Math.abs(output[0][i]));
      if (antiPhase) stereoError = Math.max(stereoError, Math.abs(output[0][i] + output[1][i]));
      if (block > blocks * .8) { sum += output[0][i] ** 2; samples++; }
      if (block === blocks - 1 && !enabled) assert.equal(output[0][i], input[0][i], 'Bypass restores each sample exactly');
    }
  }
  return { rms: Math.sqrt(sum / samples), peak, stereoError };
}
const quiet = run(new Processor(), 10, .04);
const loud = run(new Processor(), 10, .8);
check(20 * Math.log10(loud.rms / quiet.rms) < 12, 'Dynamic range between quiet and loud passages is reduced');
check(quiet.rms <= .04 / Math.SQRT2 * 4.001, 'Boost stays within +12.04 dB');
const full = run(new Processor(), 10, .35);
const soft = run(new Processor(), 10, .35, .001);
check(Math.abs(soft.rms / full.rms - .001) < 1e-7, 'Manual low volume is not canceled by automatic gain');
const anti = run(new Processor(), 10, .04, 1, 1, true);
check(anti.stereoError === 0 && Math.abs(anti.rms - quiet.rms) < 1e-7, 'Anti-phase stereo is measured without cancellation');
const p = new Processor(); run(p, 10, .04);
const burst = run(p, .05, 8, .5);
check(burst.peak <= .49 + 1e-6, 'Abrupt loud burst respects the sample-peak ceiling and manual gain');
run(p, 3, 0);
check(Math.abs(p.gain - 1) < .001, 'Silence does not accumulate boost');
const noise = run(new Processor(), 10, .003);
check(noise.rms <= .003 / Math.SQRT2 * 1.001, 'Low noise is not boosted');
run(p, 1, .2, .4, 0); checks++;
const muted = run(p, 1, 1, 0);
check(muted.peak === 0 && p.gain === 1, 'Mute stays silent and resets stale gain');
const classify = source.slice(source.indexOf('  function musicCategory('), source.indexOf('  function category()'));
const musicCategory = vm.runInNewContext(`${classify}; musicCategory`);
for (const tid of [1003, ...Array.from({length:12}, (_,i)=>2016+i)]) check(musicCategory({tid_v2:tid}) === true, `Music category ${tid} defaults off`);
check(musicCategory({tid:31}) === true && musicCategory({tid_v2:2100, tid:95}) === false && musicCategory({}) === null, 'Legacy and unknown categories handled conservatively');
check(Math.abs(20 * Math.log10(full.rms) + 12) < .3, 'Typical settled output is about -12 dBFS RMS');
const gated = new Processor();
run(gated, 10, .04);
const noiseAfterSpeech = run(gated, 2, .003);
check(noiseAfterSpeech.rms <= noise.rms * 1.001, 'Compensation returns to unity during sustained background noise');
const volumeSteps = new Processor();
const volumeControl = new Processor();
run(volumeSteps, 10, .35);
run(volumeControl, 10, .35);
const turnedDown = run(volumeSteps, .02, .35, .001);
const unchanged = run(volumeControl, .02, .35);
check(Math.abs(turnedDown.rms / unchanged.rms - .001) < 1e-7 && turnedDown.peak < .0004, 'Turning down an active processor is immediate and stays quiet');
console.log(JSON.stringify({checks, quietRms:quiet.rms, loudRms:loud.rms, inputDifferenceDb:20*Math.log10(20), outputDifferenceDb:20*Math.log10(loud.rms/quiet.rms), burstPeak:burst.peak},null,2));
