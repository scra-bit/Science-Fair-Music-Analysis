const fs = require("fs");
const WavDecoder = require("wav-decoder");
const { Essentia, EssentiaWASM } = require("essentia.js");

async function loadWav(filepath) {
  const buffer = fs.readFileSync(filepath);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
  const wav = await WavDecoder.decode(arrayBuffer);
  const channelData = wav.channelData[0];
  return {
    audio: channelData,
    sampleRate: wav.sampleRate,
  };
}

async function measureAudioCharacteristics(filepath) {
  const { audio, sampleRate } = await loadWav(filepath);
  const essentia = new Essentia(EssentiaWASM, false);

  const frameSize = 4096;
  const hopSize = 2048;

  let hfcValues = [];
  let spectralCentroids = [];
  let spectralComplexities = [];
  let dissonances = [];
  let pitchSaliences = [];
  let inharmonicities = [];
  let spectralEntropies = [];
  let spectralRolloffs = [];
  let loudnesses = [];
  let zeroCrossingRates = [];
  let dynamicComplexities = [];
  let spectralFluxes = [];

  for (let i = 0; i < audio.length - frameSize; i += hopSize) {
    const frame = audio.slice(i, i + frameSize);
    const frameVector = essentia.arrayToVector(frame);

    const windowed = essentia.Windowing(
      frameVector,
      true,
      frameSize,
      "blackmanharris62"
    );
    const spectrum = essentia.Spectrum(windowed.frame);

    try {
      const hfc = essentia.HFC(spectrum.spectrum);
      hfcValues.push(hfc.hfc);
    } catch (e) {}

    try {
      const centroid = essentia.Centroid(spectrum.spectrum);
      spectralCentroids.push((centroid.centroid * sampleRate) / 2);
    } catch (e) {}

    try {
      const complexity = essentia.SpectralComplexity(spectrum.spectrum);
      spectralComplexities.push(complexity.spectralComplexity);
    } catch (e) {}

    try {
      const peaks = essentia.SpectralPeaks(spectrum.spectrum);
      const dissonance = essentia.Dissonance(
        peaks.frequencies,
        peaks.magnitudes
      );
      dissonances.push(dissonance.dissonance);
    } catch (e) {}

    try {
      const salience = essentia.PitchSalience(spectrum.spectrum);
      pitchSaliences.push(salience.pitchSalience);
    } catch (e) {}

    try {
      const peaks = essentia.SpectralPeaks(spectrum.spectrum);
      const inharmonicity = essentia.Inharmonicity(
        peaks.frequencies,
        peaks.magnitudes
      );
      inharmonicities.push(inharmonicity.inharmonicity);
    } catch (e) {}

    try {
      const entropy = essentia.Entropy(spectrum.spectrum);
      spectralEntropies.push(entropy.entropy);
    } catch (e) {}

    try {
      const rolloff = essentia.RollOff(spectrum.spectrum, 0.85);
      spectralRolloffs.push((rolloff.rollOff * sampleRate) / 2);
    } catch (e) {}

    try {
      const loudness = essentia.Loudness(frameVector);
      loudnesses.push(loudness.loudness);
    } catch (e) {}

    try {
      const zcr = essentia.ZeroCrossingRate(frameVector);
      zeroCrossingRates.push(zcr.zeroCrossingRate);
    } catch (e) {}

    if (i > 0) {
      try {
        const prevFrame = audio.slice(i - hopSize, i - hopSize + frameSize);
        const prevVector = essentia.arrayToVector(prevFrame);
        const prevWindowed = essentia.Windowing(
          prevVector,
          true,
          frameSize,
          "blackmanharris62"
        );
        const prevSpectrum = essentia.Spectrum(prevWindowed.frame);
        const flux = essentia.Flux(prevSpectrum.spectrum, spectrum.spectrum);
        spectralFluxes.push(flux.flux);
      } catch (e) {}
    }
  }

  try {
    const audioVector = essentia.arrayToVector(audio);
    const dc = essentia.DynamicComplexity(audioVector);
    dynamicComplexities.push(dc.dynamicComplexity);
  } catch (e) {}

  const calculateStats = (arr) => {
    if (arr.length === 0)
      return { mean: 0, std: 0, median: 0, percentile90: 0 };
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sorted = [...arr].sort((a, b) => a - b);
    const percentile90 = sorted[Math.floor(sorted.length * 0.9)];
    return { mean, percentile90 };
  };

  const hfcStats = calculateStats(hfcValues);
  const centroidStats = calculateStats(spectralCentroids);
  const complexityStats = calculateStats(spectralComplexities);
  const dissonanceStats = calculateStats(dissonances);
  const salienceStats = calculateStats(pitchSaliences);
  const inharmonicityStats = calculateStats(inharmonicities);
  const entropyStats = calculateStats(spectralEntropies);
  const rolloffStats = calculateStats(spectralRolloffs);
  const loudnessStats = calculateStats(loudnesses);
  const zcrStats = calculateStats(zeroCrossingRates);
  const fluxStats = calculateStats(spectralFluxes);

  const normalizedHFC = Math.min(100, (hfcStats.mean / 10000) * 100);
  const normalizedCentroid = Math.min(100, (centroidStats.mean / 10000) * 100);
  const normalizedComplexity = Math.min(100, (complexityStats.mean / 20) * 100);
  const normalizedDissonance = Math.min(100, dissonanceStats.mean * 200);
  const normalizedFlux = Math.min(100, fluxStats.mean * 1000);
  const normalizedDynamic =
    dynamicComplexities.length > 0
      ? Math.min(100, dynamicComplexities[0] * 10)
      : 50;

  const aggressivenessScore =
    normalizedHFC * 0.25 +
    normalizedCentroid * 0.2 +
    normalizedComplexity * 0.15 +
    normalizedDissonance * 0.15 +
    normalizedFlux * 0.15 +
    normalizedDynamic * 0.1;

  const normalizedSalience = Math.min(100, salienceStats.mean * 100);
  const normalizedHarmonicity = Math.max(
    0,
    100 - inharmonicityStats.mean * 1000
  );
  const normalizedTonalEntropy = Math.max(0, 100 - entropyStats.mean * 12);

  const tonalityScore =
    normalizedSalience * 0.35 +
    normalizedHarmonicity * 0.35 +
    normalizedTonalEntropy * 0.2 +
    0.1;

  const normalizedRolloff = Math.max(0, 100 - rolloffStats.mean / 100);
  const normalizedQuietness = Math.max(
    0,
    100 - Math.min(100, loudnessStats.mean / 20)
  );
  const normalizedSmoothness = Math.max(0, 100 - zcrStats.mean * 200);
  const peakSoftness = Math.max(
    0,
    100 - Math.min(100, loudnessStats.percentile90 / 30)
  );

  const softnessScore =
    normalizedRolloff * 0.25 +
    normalizedQuietness * 0.35 +
    normalizedSmoothness * 0.2 +
    peakSoftness * 0.2;

  const createBar = (score) => {
    const filled = Math.round(score / 5);
    const empty = 20 - filled;
    return "#".repeat(filled) + "-".repeat(empty);
  };

  console.log(`Aggressiveness: ${createBar(aggressivenessScore)} ${aggressivenessScore.toFixed(0)}%`);
  console.log(`Tonality:       ${createBar(tonalityScore)} ${tonalityScore.toFixed(0)}%`);
  console.log(`Softness:       ${createBar(softnessScore)} ${softnessScore.toFixed(0)}%`);
}

measureAudioCharacteristics("./song.wav").catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
