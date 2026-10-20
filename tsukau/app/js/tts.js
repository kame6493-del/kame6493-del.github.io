// 発音: アプリ版は TextToSpeech プラグイン(@capacitor-community/text-to-speech)、ブラウザは Web Speech。
// 日本語(ja-JP)の声が無い端末では available=false にして、聞くボタンを隠す。
export const TTS = {
  available: false, mode: '', voice: null,
  async init() {
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.TextToSpeech;
    const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    if (native && P) {
      try {
        const r = await P.getSupportedLanguages();
        const langs = (r && r.languages) || [];
        if (langs.some(l => /^ja([-_]|$)/i.test(l))) { TTS.available = true; TTS.mode = 'native'; return true; }
      } catch (e) { }
      return false;
    }
    if (!('speechSynthesis' in window)) return false;
    const pick = () => { const v = speechSynthesis.getVoices().filter(v => /^ja([-_]|$)/i.test(v.lang)); TTS.voice = v.find(x => /Google|Kyoko|Nanami|Haruka/i.test(x.name)) || v[0] || null; return !!TTS.voice; };
    if (pick()) { TTS.available = true; TTS.mode = 'web'; return true; }
    await new Promise(res => { const tm = setTimeout(res, 1500); speechSynthesis.addEventListener('voiceschanged', () => { clearTimeout(tm); res(); }, { once: true }); });
    if (pick()) { TTS.available = true; TTS.mode = 'web'; }
    return TTS.available;
  },
  async speak(text, rate = 0.85) {
    if (!TTS.available || !text) return;
    if (TTS.mode === 'native') {
      const P = window.Capacitor.Plugins.TextToSpeech;
      try { await P.stop(); } catch (e) { }
      try { await P.speak({ text, lang: 'ja-JP', rate, pitch: 1.0, volume: 1.0, category: 'playback' }); } catch (e) { }
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; u.rate = rate; if (TTS.voice) u.voice = TTS.voice;
    speechSynthesis.speak(u);
  },
};
