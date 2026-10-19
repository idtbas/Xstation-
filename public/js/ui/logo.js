// Eigenes X-Station-Logo: zwei verflochtene Balken – Blau (links) und Grün (rechts).

let n = 0;

export function logoMark({ size = '4rem', cls = '' } = {}) {
  const id = `xs${++n}`;
  const wrap = document.createElement('span');
  wrap.className = `xs-mark ${cls}`;
  wrap.style.width = size;
  wrap.style.height = size;
  wrap.innerHTML = `
<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
  <defs>
    <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5aa2ff"/><stop offset="0.55" stop-color="#0a6cff"/><stop offset="1" stop-color="#0038b8"/>
    </linearGradient>
    <linearGradient id="${id}g" x1="1" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7cf27c"/><stop offset="0.55" stop-color="#16b316"/><stop offset="1" stop-color="#0a6b0a"/>
    </linearGradient>
    <filter id="${id}s" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.2"/>
    </filter>
  </defs>
  <path d="M24 20 L76 80" stroke="url(#${id}b)" stroke-width="15" stroke-linecap="round" fill="none"/>
  <path d="M76 20 L24 80" stroke="#000" stroke-opacity="0.55" stroke-width="23" stroke-linecap="round" fill="none" filter="url(#${id}s)"/>
  <path d="M76 20 L24 80" stroke="url(#${id}g)" stroke-width="15" stroke-linecap="round" fill="none"/>
  <path d="M60 41 L76 20" stroke="#fff" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round" fill="none"/>
  <path d="M24 20 L38 36" stroke="#fff" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round" fill="none"/>
</svg>`;
  return wrap;
}

export function logoFull({ size = '3rem' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'xs-logo';
  wrap.style.setProperty('--logo-size', size);
  wrap.append(logoMark({ size }));
  const word = document.createElement('div');
  word.className = 'xs-word';
  word.innerHTML = '<b>X</b><i>-</i><span>STATION</span>';
  wrap.append(word);
  return wrap;
}
