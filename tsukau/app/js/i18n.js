// 画面の文字はすべてここから出す。言語を足すときは STR に同じキーで足す。
// {name} のような所は t('key', { name: 'x' }) で埋める。
export const STR = {
  en: {
    appName: 'Tsukau',
    tabHome: 'Home', tabLearn: 'Learn', tabScenes: 'Scenes', tabMe: 'Me',
    wordOfDay: 'Word of the day',
    streakDays: '{n} day streak', streakDay: '{n} day streak', streakZero: 'Start your streak today',
    today5: "Today's 5 minutes", today5Done: 'Done for today ✓',
    reviewDue: 'Review due', kana: 'Kana', jlpt: 'JLPT',
    scenes: 'Scenes', seeAll: 'See all',
    listen: 'Listen', share: 'Share', close: 'Close', back: 'Back', next: 'Next', start: 'Start', continue: 'Continue', done: 'Done',
    // 学習
    learnTitle: 'Learn', cardOf: 'Card {i} of {n}', leftToday: '{n} left today', showAnswer: 'Show answer',
    again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy',
    inDays: '{n}d', soon: '<1d', newWord: 'New', vocab: 'Vocabulary', kanjiLabel: 'Kanji',
    onyomi: 'On', kunyomi: 'Kun', strokes: '{n} strokes',
    sessionDone: 'Nice work!', sessionDoneSub: '{n} cards today. Your next review is waiting tomorrow.',
    nothingDue: 'All caught up', nothingDueSub: 'No reviews left for today. Come back tomorrow for new words.',
    overflowNote: '{n} older reviews moved to the next few days, so today stays short.',
    deckN5: 'JLPT N5', deckN4: 'JLPT N4', deckN3: 'JLPT N3', words: '{n} words', kanjiN: '{n} kanji',
    studyWords: 'Words', studyKanji: 'Kanji', pickDeck: 'What to study',
    newPerDay: 'New words per day', newPerDayFree: 'Free plan: {n} new words a day',
    // かな
    kanaTitle: 'Hiragana & Katakana', hiragana: 'Hiragana', katakana: 'Katakana',
    kanaQuiz: 'Quiz', kanaChart: 'Chart', strokeOrder: 'Stroke order', replay: 'Replay',
    whichReading: 'Which reading?', correct: 'Correct!', wrong: 'It was “{a}”', quizScore: '{c} / {n} correct',
    learned: '{n} / {total} learned',
    // 名前
    nameTitle: 'Your name in Japanese', namePrompt: 'Type your first name', namePlaceholder: 'e.g. Emily',
    nameResult: 'Your name in katakana', nameGuess: 'This is our best guess from the spelling. Tap a letter to fix it.',
    nameKnown: 'This is the usual way to write it in Japan.', nameShare: 'Share my name card', nameEdit: 'Edit',
    nameWhy: 'Katakana is used for names and words from other languages.',
    // 場面
    scenesTitle: 'Scenes', scenesSub: 'Real phrases for real moments in Japan',
    staff: 'They say', you: 'You say', locked: 'Plus', tryFirst: 'Try the first line free',
    // 課金
    plusName: 'Tsukau Plus', plusTitle: 'Learn the Japanese you will actually use',
    plusF1: 'All {n} Scenes, with more added over time', plusF2: 'JLPT N4 & N3: {w} words and {k} kanji', plusF3: 'Learn as many new words a day as you want',
    yearly: 'Yearly', monthly: 'Monthly', lifetime: 'Lifetime', perMonth: '{p} / month', billedYearly: '{p} billed yearly',
    trialBadge: '{n}-day free trial', startTrial: 'Start free trial', subscribe: 'Continue', buyOnce: 'Buy once',
    afterTrial: 'Free for {n} days, then {p} per year. Cancel anytime in Google Play.',
    renewNote: 'Renews automatically until you cancel. Manage it in your store account.',
    notNow: 'Not now', restore: 'Restore purchases', plusActive: 'Plus is active. Thank you!',
    webOnly: 'Plus is available in the Android app.', getAndroid: 'Get the Android app',
    storeBusy: 'Connecting to the store…', storeFail: "Couldn't reach the store. Please try again later.",
    offline: "You're offline. Please try again when connected.", cancelled: 'Purchase cancelled.',
    pending: 'Payment is pending. Plus will turn on when it completes.', restoredOk: 'Plus restored.', restoredNone: 'No purchases found for this store account.',
    // シェア
    shareWord: 'Share today’s word', shareSaved: 'Image saved', shareFail: "Couldn't share the image.",
    // 設定
    meTitle: 'Me', settings: 'Settings', dailyReminder: 'Daily word reminder', reminderTime: 'Reminder time',
    reminderOn: 'On', reminderOff: 'Off', reminderWeb: 'Daily reminders work in the Android app.',
    reminderTitle: 'Today’s word: {w}', reminderBody: '{r} — {m}', notifDenied: 'Notifications are turned off in your phone settings.',
    showFurigana: 'Show readings (furigana)', speechOff: 'Audio needs a Japanese voice on your device.',
    credits: 'About & credits', privacy: 'Privacy Policy', terms: 'Terms of Use', resetAll: 'Reset all progress', resetConfirm: 'Erase all progress on this device?',
    statsStreak: 'Current streak', statsBest: 'Best streak', statsLearned: 'Words learned', statsKana: 'Kana learned',
    // 初回
    obHello: 'Welcome to Tsukau', obSub: 'Five minutes a day. Japanese you can use on the street.',
    obGoal: 'What brings you to Japanese?', goalAnime: 'Anime & games', goalTravel: 'A trip to Japan', goalJlpt: 'The JLPT', goalFun: 'Just curious',
    obFirst: 'First, let’s write your name in Japanese.', obKana: 'Now try 5 hiragana.', obDone: 'Your first lesson is done!',
    creditsTitle: 'About & credits',
  },
};

let lang = 'en';
export function setLang(l) { if (STR[l]) lang = l; }
export function getLang() { return lang; }
export function t(key, vars) {
  let s = (STR[lang] && STR[lang][key]) ?? STR.en[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}
