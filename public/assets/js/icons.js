/**
 * أيقونات خطية موحّدة (نمط Lucide، مرسومة داخل الكود: لا مكتبة خارجية ولا طلبات شبكة).
 *
 * الواجهة تستعمل الإيموجي في مئات المواضع؛ بدل تعديلها واحداً واحداً، `watchIcons`
 * يراقب الصفحة ويعوّض كل إيموجي معروف بأيقونة SVG تأخذ لون النص وحجمه.
 * الإيموجي غير الموجود في الجدول يبقى كما هو.
 */
const P = {
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  'x-circle': '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
  'map-pin': '<path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  graduation: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5M22 10v6"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
  instructor: '<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="m16 11 2 2 4-4"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  library: '<path d="m16 6 4 14M12 6v14M8 8v12M4 4v16"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 12h6M9 16h6"/>',
  'bar-chart': '<path d="M3 3v18h18M8 17v-5M13 17V7M18 17v-8"/>',
  'trending-up': '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
  brain: '<path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-3-2-5-3-7-1 2-2 3-3 3 0-3-1-6-4-9 0 4-4 6-4 12a7 7 0 0 0 7 8Z"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"/>',
  'traffic-light': '<rect x="8" y="2" width="8" height="20" rx="3"/><circle cx="12" cy="7" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="17" r="1.3"/>',
  car: '<path d="M5 17H3v-5l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v5h-2M3 12h18M9 17h6"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  road: '<path d="M4 21 8 3M20 21 16 3M12 5v2M12 11v2M12 17v2"/>',
  steering: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 14v7M10.3 11 3.5 9M13.7 11l6.8-2"/>',
  scale: '<path d="M12 3v18M7 21h10M5 7h14"/><path d="m5 7-3 7a3 3 0 0 0 6 0ZM19 7l-3 7a3 3 0 0 0 6 0Z"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L6 21"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  hourglass: '<path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  'volume-x': '<path d="M11 5 6 9H2v6h4l5 4Z"/><path d="m22 9-6 6M16 9l6 6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
  lightbulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z"/>',
  users: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M16 3.1a4 4 0 0 1 0 7.8M22 21v-2a4 4 0 0 0-3-3.9"/>',
  'user-plus': '<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M19 8v6M16 11h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  school: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M9 10h.01M15 10h.01"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  'id-card': '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 16c.5-1.5 5.5-1.5 6 0M14 10h4M14 14h4"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M8 4h8M9 13v2M15 13v2M2 14h2M20 14h2"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 9H3c0-1 3-2 3-9Z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  shuffle: '<path d="M2 18h3l12-12h5M18 2l4 4-4 4M2 6h3l4 4M13 14l4 4h5M18 14l4 4-4 4"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-7Z"/>',
  archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
  'book-open': '<path d="M2 4h7a3 3 0 0 1 3 3v14a2 2 0 0 0-2-2H2ZM22 4h-7a3 3 0 0 0-3 3v14a2 2 0 0 1 2-2h8Z"/>',
  seat: '<path d="M6 11V6a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v5"/><path d="M4 11a2 2 0 0 1 2 2v3h12v-3a2 2 0 0 1 4 0v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2ZM6 19v2M18 19v2"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.4-1 .9-1 1.7M12 17h.01"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2Z"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7Z"/><path d="m2 12 10 5 10-5M2 17l10 5 10-5"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/><path d="M5 2.5l.6 1.4 1.4.6-1.4.6L5 6.5l-.6-1.4L3 4.5l1.4-.6Z"/>',
  'log-in': '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
};

// الإيموجي → اسم الأيقونة
const EMOJI = {
  '📅': 'calendar', '🗓': 'calendar', '✅': 'check-circle', '❌': 'x-circle', '📍': 'map-pin',
  '🎓': 'graduation', '👨‍🎓': 'graduation', '✏️': 'pencil', '🧑‍🏫': 'instructor', '👨‍🏫': 'instructor',
  '🔑': 'key', '📝': 'file-text', '📄': 'file', '📚': 'library', '📋': 'clipboard', '📊': 'bar-chart', '📈': 'trending-up',
  '🏆': 'trophy', '⚡': 'zap', '🧠': 'brain', '🚫': 'ban', '🔥': 'flame', '⭐': 'star',
  '🚦': 'traffic-light', '🚗': 'car', '🛣️': 'road', '🧑‍✈️': 'steering', '⚖️': 'scale',
  '🗑': 'trash', '🖼️': 'image', '🕘': 'clock', '⏱': 'clock', '⏳': 'hourglass', '🔗': 'link',
  '🔊': 'volume', '🔇': 'volume-x', '📥': 'download', '⬇️': 'download', '📤': 'upload', '📞': 'phone',
  '💡': 'lightbulb', '👥': 'users', '👤': 'user', '👁': 'eye', '👁️': 'eye', '🏫': 'school', '🎯': 'target', '🎬': 'video',
  '⚠️': 'alert', '⚠': 'alert', '🚧': 'alert', '🪪': 'id-card', '🤖': 'bot', '🔔': 'bell', '🔒': 'lock', '🔍': 'search',
  '🔀': 'shuffle', '📭': 'inbox', '📦': 'archive', '📖': 'book-open', '💺': 'seat', '🌙': 'moon', '☀️': 'sun',
  '🆕': 'user-plus', '❓': 'help', '⚙️': 'settings', '♻️': 'restore', '☰': 'menu',
};

const VS = '️';
const strip = (s) => s.split(VS).join('');
const BY_BARE = new Map(Object.entries(EMOJI).map(([k, v]) => [strip(k), v]));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// الأطول أولاً (تسلسلات ZWJ قبل مكوناتها)، مع محدِّد التنويع اختيارياً
const RE = new RegExp(`(${[...BY_BARE.keys()].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})${VS}?`, 'gu');

export function iconSvg(name) {
  return `<svg class="ic ic-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;
}

// لا نمس: واجهة الامتحان، محتوى الدروس والأسئلة ورسائل المحادثة (نص كتبه المؤلف)، وحقول الإدخال
const SKIP = '.nrs-overlay, .prose, .msg-bubble, .q-text, .acc-text, .scene, [data-noicon], svg, select, option, textarea, script, style';

function replaceIn(textNode) {
  const text = textNode.nodeValue;
  RE.lastIndex = 0;
  if (!RE.test(text)) return;
  const parent = textNode.parentNode;
  if (!parent || (parent.closest && parent.closest(SKIP))) return;
  const frag = document.createDocumentFragment();
  const tpl = document.createElement('template');
  let last = 0;
  RE.lastIndex = 0;
  for (let m = RE.exec(text); m; m = RE.exec(text)) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    tpl.innerHTML = iconSvg(BY_BARE.get(strip(m[1])));
    frag.appendChild(tpl.content.firstChild);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  parent.replaceChild(frag, textNode);
}

export function iconize(root) {
  if (!root) return;
  if (root.nodeType === Node.TEXT_NODE) { replaceIn(root); return; }
  if (root.nodeType !== Node.ELEMENT_NODE || (root.closest && root.closest(SKIP))) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(replaceIn);
}

/** يعوّض الإيموجي الموجود ثم يراقب كل ما يُضاف لاحقاً (قبل الرسم: بدون وميض). */
export function watchIcons(root = document.body) {
  iconize(root);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') iconize(m.target);
      else m.addedNodes.forEach(iconize);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true });
}
