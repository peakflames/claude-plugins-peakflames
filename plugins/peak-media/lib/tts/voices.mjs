// TTS models and voices (DEC-03). The source of truth for --tts-model / --voice
// validation; skills/video-spine/references/voices.md is the human-readable view.

/** family: 'gemini' | 'mai' | 'fake'. sampleRate: PCM rate OpenRouter returns (s16le mono). */
export const MODELS = {
  'google/gemini-3.8-flash-lite-tts': { family: 'gemini', sampleRate: 24000 },
  'google/gemini-3.8-flash-tts': { family: 'gemini', sampleRate: 24000 },
  'microsoft/mai-voice-2.1-flash': { family: 'mai', sampleRate: 24000, suffix: 'MAI-Voice-2.1-Flash' },
  'microsoft/mai-voice-2.1': { family: 'mai', sampleRate: 24000, suffix: 'MAI-Voice-2.1' },
  'fake/tone': { family: 'fake', sampleRate: 48000 },
};

export const GEMINI_VOICES = [
  'Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Aoede', 'Autonoe', 'Callirrhoe', 'Charon', 'Despina',
  'Enceladus', 'Erinome', 'Fenrir', 'Gacrux', 'Iapetus', 'Kore', 'Laomedeia', 'Leda', 'Orus', 'Pulcherrima',
  'Puck', 'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Schedar', 'Sulafat', 'Umbriel', 'Vindemiatrix', 'Zephyr',
  'Zubenelgenubi', 'Lumi',
];

export const MAI_VOICES = [
  'en-AU-Isla', 'en-GB-Emily', 'en-GB-Harry', 'en-IN-Dhruv', 'en-IN-Priya', 'en-US-Ethan', 'en-US-Grant',
  'en-US-Harper', 'en-US-Iris', 'en-US-Jasper', 'en-US-Olivia', 'en-US-Sage',
];

export const DEFAULT_VOICES = { gemini: 'Achird', mai: 'en-GB-Emily', fake: 'Achird' };

// Microsoft's other locales (cs-CZ … zh-CN) aren't listed; any id of this shape is accepted for MAI.
const MAI_ID = /^([a-z]{2,3})-([A-Za-z]{2,4})-([A-Za-z]+)$/;

const find = (list, v) => list.find((x) => x.toLowerCase() === v.toLowerCase());

/**
 * Canonical voice for a model, or null when unknown. Gemini names are case-insensitive;
 * MAI takes the short id (a ':MAI-Voice-…' suffix the user pastes is stripped).
 * fake/tone accepts any Gemini or MAI voice so tests can stand in for either.
 */
export function canonicalVoice(model, voice) {
  const m = MODELS[model];
  if (!m || typeof voice !== 'string' || !voice.trim()) return null;
  const v = voice.trim();
  if (m.family === 'gemini') return find(GEMINI_VOICES, v) ?? null;
  const short = v.split(':')[0];
  const known = find(MAI_VOICES, short);
  if (m.family === 'mai') {
    if (known) return known;
    const x = MAI_ID.exec(short);
    return x ? `${x[1].toLowerCase()}-${x[2].length === 2 ? x[2].toUpperCase() : x[2]}-${x[3][0].toUpperCase()}${x[3].slice(1)}` : null;
  }
  return find(GEMINI_VOICES, v) ?? known ?? null;
}

/** The voice string sent to OpenRouter: MAI gets its model suffix, e.g. en-GB-Emily:MAI-Voice-2.1-Flash. */
export function apiVoice(model, voice) {
  const m = MODELS[model];
  return m?.family === 'mai' ? `${voice}:${m.suffix}` : voice;
}

export const familyOf = (model) => MODELS[model]?.family ?? null;
export const isFake = (model) => familyOf(model) === 'fake';
