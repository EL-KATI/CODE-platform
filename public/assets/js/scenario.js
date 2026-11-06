// Illustrations SVG des scénarios (extraites de la version originale du site).
// Chaque question possède un "visual" {type, sub} qui est dessiné ici en SVG pur,
// ce qui évite de dépendre d'images lourdes.  Les questions avec une vraie photo
// (champ image) sont affichées par renderVisual().

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function renderVisual(question) {
  if (question.image) {
    return `<img class="scene-photo" src="${esc(question.image)}" alt="${esc(question.imageAlt || '')}" loading="lazy">`;
  }
  if (!question.visual || !question.visual.type) return '';
  return renderScenarioSVG(question.visual);
}

export function renderScenarioSVG(visual) {
    if (!visual) return '';
    
    const vsub = visual.sub || '';
    const vtype = visual.type || 'sign';

    if (vtype === 'sign') {
        if (vsub.startsWith('speed_limit_')) {
            const num = vsub.replace('speed_limit_', '');
            return `
            <svg viewBox="0 0 300 240" class="scene-svg" role="img" aria-hidden="true">
                <rect width="300" height="150" fill="#38bdf8" />
                <rect y="150" width="300" height="90" fill="#334155" />
                <polygon points="120,240 180,240 152,150 148,150" fill="#e2e8f0" />
                <rect x="210" y="80" width="8" height="130" fill="#94a3b8" />
                <circle cx="214" cy="75" r="48" fill="#ef4444" stroke="#ffffff" stroke-width="3" />
                <circle cx="214" cy="75" r="38" fill="#ffffff" />
                <text x="214" y="86" font-size="34" font-weight="900" fill="#0f172a" text-anchor="middle" font-family="sans-serif">${num}</text>
                <rect x="135" y="165" width="30" height="20" rx="4" fill="#ef4444" />
                <rect x="140" y="160" width="20" height="10" rx="3" fill="#cbd5e1" />
            </svg>`;
        }
        if (vsub.includes('prohibit_overtake')) {
            return `
            <svg viewBox="0 0 300 240" class="scene-svg" role="img" aria-hidden="true">
                <rect width="300" height="140" fill="#38bdf8" />
                <rect y="140" width="300" height="100" fill="#475569" />
                <line x1="150" y1="140" x2="150" y2="240" stroke="#f8fafc" stroke-width="4" stroke-dasharray="15,10" />
                <rect x="220" y="70" width="8" height="140" fill="#94a3b8" />
                <circle cx="224" cy="65" r="50" fill="#ef4444" stroke="#ffffff" stroke-width="3"/>
                <circle cx="224" cy="65" r="39" fill="#ffffff" />
                <g transform="translate(198, 48) scale(0.65)">
                    <rect x="10" y="10" width="28" height="38" rx="6" fill="#ef4444" />
                    <rect x="42" y="10" width="28" height="38" rx="6" fill="#0f172a" />
                </g>
            </svg>`;
        }
        if (vsub.includes('danger_')) {
            let symbol = '<path d="M150 48 Q150 65 165 72 T165 95" fill="none" stroke="#0f172a" stroke-width="6" stroke-linecap="round"/>';
            if (vsub.includes('curve_left')) {
                symbol = '<path d="M150 95 Q150 72 135 65 T135 45" fill="none" stroke="#0f172a" stroke-width="6" stroke-linecap="round"/>';
            } else if (vsub.includes('rocks')) {
                symbol = '<polygon points="135,90 145,75 155,90" fill="#0f172a"/><circle cx="160" cy="85" r="5" fill="#0f172a"/><polygon points="125,92 175,92 170,70 145,55" fill="#475569"/>';
            } else if (vsub.includes('pedestrian')) {
                symbol = '<circle cx="150" cy="55" r="6" fill="#0f172a"/><path d="M150 63 L150 80 L140 95 M150 80 L160 95 M140 70 L160 70" stroke="#0f172a" stroke-width="4" stroke-linecap="round"/>';
            } else if (vsub.includes('train')) {
                symbol = '<rect x="135" y="60" width="30" height="25" rx="3" fill="#0f172a"/><circle cx="142" cy="78" r="4" fill="#ffffff"/><circle cx="158" cy="78" r="4" fill="#ffffff"/><path d="M140 65 H160" stroke="#ffffff" stroke-width="2"/>';
            }
            return `
            <svg viewBox="0 0 300 240" class="scene-svg" role="img" aria-hidden="true">
                <rect width="300" height="150" fill="#60a5fa" />
                <rect y="150" width="300" height="90" fill="#334155" />
                <rect x="210" y="80" width="8" height="130" fill="#94a3b8" />
                <polygon points="150,20 95,115 205,115" fill="#ef4444" stroke="#ffffff" stroke-width="3" />
                <polygon points="150,38 110,107 190,107" fill="#ffffff" />
                ${symbol}
            </svg>`;
        }
        if (vsub.includes('mandatory_') || vsub.includes('roundabout')) {
            return `
            <svg viewBox="0 0 300 240" class="scene-svg" role="img" aria-hidden="true">
                <rect width="300" height="150" fill="#38bdf8" />
                <rect y="150" width="300" height="90" fill="#334155" />
                <rect x="210" y="80" width="8" height="130" fill="#94a3b8" />
                <circle cx="214" cy="70" r="48" fill="#2563eb" stroke="#ffffff" stroke-width="3" />
                <path d="M195 70 H233 M222 58 L235 70 L222 82" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>`;
        }
        if (vsub.includes('info_parking')) {
            return `
            <svg viewBox="0 0 300 240" class="scene-svg" role="img" aria-hidden="true">
                <rect width="300" height="150" fill="#38bdf8" />
                <rect y="150" width="300" height="90" fill="#334155" />
                <rect x="200" y="80" width="8" height="130" fill="#94a3b8" />
                <rect x="175" y="25" width="70" height="70" rx="8" fill="#2563eb" stroke="#ffffff" stroke-width="3" />
                <text x="210" y="75" font-size="50" font-weight="900" fill="#ffffff" text-anchor="middle" font-family="sans-serif">P</text>
            </svg>`;
        }
    }

    if (vtype === 'junction') {
        if (vsub.includes('stop')) {
            return `
            <svg viewBox="0 0 300 240" class="scene-svg" role="img" aria-hidden="true">
                <rect width="300" height="240" fill="#22c55e" />
                <rect x="110" y="0" width="80" height="240" fill="#334155" />
                <rect x="0" y="80" width="300" height="80" fill="#334155" />
                <rect x="110" y="160" width="40" height="6" fill="#ffffff" />
                <polygon points="80,180 92,168 92,152 80,140 64,140 52,152 52,168 64,180" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>
                <text x="72" y="165" font-size="12" font-weight="900" fill="#ffffff" text-anchor="middle" font-family="sans-serif">STOP</text>
                <rect x="118" y="175" width="24" height="42" rx="4" fill="#059669" stroke="#ffffff" stroke-width="1.5" />
                <rect x="35" y="125" width="42" height="24" rx="4" fill="#dc2626" stroke="#ffffff" stroke-width="1.5" />
            </svg>`;
        }
        if (vsub.includes('roundabout')) {
            return `
            <svg viewBox="0 0 300 240" class="scene-svg" role="img" aria-hidden="true">
                <rect width="300" height="240" fill="#15803d" />
                <rect x="115" y="0" width="70" height="240" fill="#334155" />
                <rect x="0" y="85" width="300" height="70" fill="#334155" />
                <circle cx="150" cy="120" r="45" fill="#334155" stroke="#ffffff" stroke-width="2" stroke-dasharray="8,6" />
                <circle cx="150" cy="120" r="25" fill="#16a34a" />
                <rect x="105" y="105" width="20" height="30" rx="3" fill="#2563eb" transform="rotate(30, 115, 120)" />
                <rect x="140" y="180" width="22" height="38" rx="4" fill="#059669" />
            </svg>`;
        }
        if (vsub.includes('police')) {
            return `
            <svg viewBox="0 0 300 240" class="scene-svg" role="img" aria-hidden="true">
                <rect width="300" height="240" fill="#334155" />
                <circle cx="150" cy="120" r="14" fill="#ffffff" />
                <circle cx="150" cy="116" r="8" fill="#1e293b" />
                <line x1="110" y1="120" x2="190" y2="120" stroke="#facc15" stroke-width="6" stroke-linecap="round" />
                <text x="150" y="85" font-size="13" font-weight="bold" fill="#facc15" text-anchor="middle">شرطي المرور (ظهره أو صدره لي)</text>
                <rect x="138" y="180" width="24" height="42" rx="4" fill="#059669" />
            </svg>`;
        }
        return `
        <svg viewBox="0 0 300 240" class="scene-svg" role="img" aria-hidden="true">
            <rect width="300" height="240" fill="#166534" />
            <rect x="110" y="0" width="80" height="240" fill="#334155" />
            <rect x="0" y="80" width="300" height="80" fill="#334155" />
            <rect x="220" y="90" width="42" height="24" rx="4" fill="#2563eb" stroke="#ffffff" stroke-width="1.5" />
            <polygon points="215,102 225,96 225,108" fill="#facc15" />
            <rect x="118" y="180" width="24" height="42" rx="4" fill="#059669" stroke="#ffffff" stroke-width="1.5" />
            <text x="150" y="40" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">ملتقى طرق بدون علامات (الأسبقية لليمين)</text>
        </svg>`;
    }

    if (vtype === 'dashboard') {
        let icon = '<circle cx="150" cy="120" r="30" stroke="#ef4444" stroke-width="5" fill="none"/><text x="150" y="128" font-size="28" font-weight="bold" fill="#ef4444" text-anchor="middle">!</text>';
        let label = 'مؤشر فرامل اليد';
        if (vsub.includes('oil')) {
            icon = '<path d="M125 125 H165 L175 110 H180 L170 130 H120 Z" fill="#ef4444"/><circle cx="178" cy="105" r="3" fill="#ef4444"/>';
            label = 'مؤشر ضغط زيت المحرك (توقف فوري)';
        } else if (vsub.includes('battery')) {
            icon = '<rect x="130" y="105" width="40" height="30" rx="3" fill="#ef4444"/><rect x="136" y="98" width="6" height="7" fill="#ef4444"/><rect x="158" y="98" width="6" height="7" fill="#ef4444"/><text x="140" y="125" font-size="18" fill="#ffffff">+</text><text x="160" y="125" font-size="18" fill="#ffffff">-</text>';
            label = 'مؤشر شحن البطارية (الدينامو)';
        } else if (vsub.includes('temp')) {
            icon = '<path d="M148 100 V125 A8 8 0 1 0 152 125 V100 Z" fill="#ef4444"/><circle cx="150" cy="132" r="6" fill="#ffffff"/>';
            label = 'مؤشر حرارة سائل التبريد المفرطة';
        }
        return `
        <svg viewBox="0 0 300 240" class="scene-svg" role="img" aria-hidden="true">
            <rect width="300" height="240" fill="#020617" />
            <circle cx="150" cy="120" r="85" fill="#0f172a" stroke="#334155" stroke-width="6" />
            <circle cx="150" cy="120" r="75" fill="none" stroke="#1e293b" stroke-width="2" stroke-dasharray="4,6" />
            ${icon}
            <text x="150" y="175" font-size="11" font-weight="bold" fill="#f87171" text-anchor="middle">${label}</text>
        </svg>`;
    }

    if (vtype === 'speed' || vtype === 'distance') {
        return `
        <svg viewBox="0 0 300 240" class="scene-svg" role="img" aria-hidden="true">
            <rect width="300" height="240" fill="#0f172a" />
            <text x="150" y="45" font-size="15" font-weight="bold" fill="#38bdf8" text-anchor="middle">مخطط حساب مسافة الأمان والكبح</text>
            <rect x="30" y="80" width="240" height="80" rx="8" fill="#1e293b" stroke="#334155" stroke-width="2" />
            <line x1="30" y1="120" x2="270" y2="120" stroke="#f8fafc" stroke-width="3" stroke-dasharray="15,10" />
            <rect x="210" y="98" width="40" height="22" rx="4" fill="#3b82f6" />
            <rect x="45" y="98" width="40" height="22" rx="4" fill="#10b981" />
            <line x1="90" y1="140" x2="205" y2="140" stroke="#f59e0b" stroke-width="3" />
            <polygon points="90,140 98,135 98,145" fill="#f59e0b" />
            <polygon points="205,140 197,135 197,145" fill="#f59e0b" />
            <text x="150" y="180" font-size="13" font-weight="bold" fill="#f59e0b" text-anchor="middle">مسافة الأمان = السرعة / 10 × 6</text>
        </svg>`;
    }

    return `
    <svg viewBox="0 0 300 240" class="scene-svg" role="img" aria-hidden="true">
        <rect width="300" height="130" fill="#0284c7" />
        <rect y="130" width="300" height="110" fill="#1e293b" />
        <polygon points="110,240 190,240 152,130 148,130" fill="#475569" />
        <line x1="150" y1="130" x2="150" y2="240" stroke="#ffffff" stroke-width="4" stroke-dasharray="12,12" />
        <path d="M70 240 Q150 180 230 240" fill="none" stroke="#090d16" stroke-width="16" stroke-linecap="round" />
        <rect x="110" y="8" width="80" height="28" rx="6" fill="#090d16" stroke="#475569" stroke-width="2" />
        <rect x="114" y="12" width="72" height="20" rx="3" fill="#94a3b8" />
        <rect x="140" y="16" width="20" height="12" rx="2" fill="#ef4444" />
    </svg>`;
}
