// 線の絵の部品(SVG)。カテゴリの絵と画面の小さな印。
const s = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const I = {
  plus: s('<path d="M12 5v14M5 12h14"/>', 2.8),
  back: s('<path d="M15 5l-7 7 7 7"/>', 2.6),
  close: s('<path d="M6 6l12 12M18 6L6 18"/>', 2.4),
  chev: s('<path d="M9 5l7 7-7 7"/>', 2.6),
  left: s('<path d="M15 5l-7 7 7 7"/>', 2.6),
  right: s('<path d="M9 5l7 7-7 7"/>', 2.6),
  check: s('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3),
  bs: '<svg viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M10 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H10l-8-9z"/><path d="M15 8l8 8M23 8l-8 8"/></svg>',
  lock: s('<rect x="5" y="11" width="14" height="9.5" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 2.2),
  send: s('<path d="M21 3L10 14M21 3l-7 18-4-7-7-4z"/>', 2.1),
  qr: s('<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 18.5v2M18 14h2.5"/>', 2),
  inbox: s('<path d="M4 13l2.5-7.5h11L20 13v5.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z"/><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20"/>', 2),
  cam: s('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', 2),
  image: s('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20 16l-5-5-8.5 8.5"/>', 2),
  text: s('<path d="M5 6h14M5 11h14M5 16h9"/>', 2.2),
  repeat: s('<path d="M17 2.5l3 3-3 3"/><path d="M4 11.5v-2a4 4 0 0 1 4-4h12M7 21.5l-3-3 3-3"/><path d="M20 12.5v2a4 4 0 0 1-4 4H4"/>', 2),
  pie: s('<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>', 2),
  bars: s('<path d="M5 20v-6M10 20V9M15 20v-8M20 20V5"/>', 2.6),
  ratio: s('<circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/><path d="M19 5L5 19"/>', 2.2),
  tag: s('<path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z"/><circle cx="8.5" cy="8.5" r="1.5"/>', 2),
  table: s('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15"/>', 2),
  star: s('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>', 2),
  bell: s('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>', 2),
  sound: s('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>', 2),
  type: s('<path d="M4 7V5h11v2M9.5 5v14M7.5 19h4M14 12v-1.5h6V12M17 10.5V19M15.5 19h3"/>', 2),
  shield: s('<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M9 12l2 2 4-4"/>', 2),
  download: s('<path d="M12 3.5v11M7 10l5 5 5-5M4 17v2a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2"/>', 2.2),
  upload: s('<path d="M12 15V4M7 8.5l5-5 5 5M4 17v2a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2"/>', 2.2),
  info: s('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.5v.5"/>', 2.2),
  people: s('<circle cx="9" cy="8.5" r="3.2"/><circle cx="16.5" cy="9.5" r="2.6"/><path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5M14.5 14.4c.6-.2 1.3-.4 2-.4 2.2 0 4 1.5 4.5 4.6"/>', 2),
  pen: s('<path d="M4 20h4L19 9l-4-4L4 16z"/>', 2),
  trash: s('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>', 2),
  undo: s('<path d="M9 7L4 12l5 5"/><path d="M4.5 12H15a5 5 0 0 1 0 10h-2"/>', 2.2),
  coin: s('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 8l3.5 4.5L15.5 8M12 12.5V17M9 13.5h6"/>', 2),
  home: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.1" stroke-linejoin="round"><path d="M3.5 11L12 4l8.5 7v8.5a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.1" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/></svg>',
  pair: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7.5h11l-3-3M17 16.5H6l3 3"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></svg>',
};

// カテゴリの絵と色(地は薄く、線は濃く)
export const CAT_ART = {
  food: { c: '#3BA57E', d: '<path d="M5 10h14l-1.2 8.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/><path d="M9 10l1.5-5M15 10l-1.5-5M3.5 10h17"/>' },
  eat: { c: '#E07A4F', d: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10"/><path d="M16.5 21V3c-2 1.5-3 4-3 7v3h3"/>' },
  daily: { c: '#4C84E0', d: '<path d="M9 3h6v3l2 2v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8l2-2z"/><path d="M7 12h10"/>' },
  rent: { c: '#3E5C8A', d: '<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5M10 20v-5h4v5"/>' },
  util: { c: '#E2A93B', d: '<path d="M13 2.5L5.5 13H12l-1 8.5L18.5 11H12z"/>' },
  net: { c: '#2E9BB8', d: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>' },
  move: { c: '#6C7FD8', d: '<rect x="5" y="3.5" width="14" height="13" rx="3"/><path d="M5 10.5h14M8.5 20l1.5-3.5M15.5 20L14 16.5"/><circle cx="9" cy="13.5" r=".6"/><circle cx="15" cy="13.5" r=".6"/>' },
  fun: { c: '#D0644E', d: '<path d="M4 20l5-12 4 7 2.5-4L20 20z"/><circle cx="16.5" cy="5.5" r="2"/>' },
  other: { c: '#7D8AA3', d: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>' },
  settle: { c: '#3BA57E', d: '<path d="M5 12.5l4.5 4.5L19 7.5"/>' },
};
const EXTRA = ['#5B8C5A', '#B5794A', '#4F9AA8', '#8A7BC0', '#C77D3A', '#6B8FB8'];
export function catArt(id, i = 0) { return CAT_ART[id] || { c: EXTRA[i % EXTRA.length], d: '<path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z"/><circle cx="8.5" cy="8.5" r="1.5"/>' }; }
export function catIcon(id, i = 0, cls = 'ci') {
  const a = catArt(id, i);
  return `<span class="${cls}" style="background:${a.c}1F;color:${a.c}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${a.d}</svg></span>`;
}
