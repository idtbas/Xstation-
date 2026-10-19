// X-Station gibt es nur für Desktop-Computer. Smartphones und Tablets erhalten einen Hinweis.

import { h } from './dom.js';
import { logoFull } from '../ui/logo.js';

export function isMobileDevice(nav = navigator) {
  if (nav.userAgentData?.mobile) return true;
  const ua = nav.userAgent || '';
  if (/Android|iPhone|iPod|iPad|Windows Phone|BlackBerry|Opera Mini|IEMobile|Mobile Safari|Silk|Kindle/i.test(ua)) return true;
  // iPadOS meldet sich als Mac – erkennbar an Touch-Unterstützung
  if (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1) return true;
  return false;
}

export function renderDesktopOnly(root) {
  root.append(
    h(
      'div.desktop-only',
      h('div.stage-bg'),
      h(
        'div.do-card',
        logoFull({ size: '2.4rem' }),
        h('h1', 'Nur für Desktop'),
        h('p', 'X-Station ist eine Konsolen-Oberfläche für den Computer. Bitte öffne die Seite auf einem PC oder Mac – am besten mit einem Xbox-Controller.'),
        h('p.do-small', 'Smartphones und Tablets werden nicht unterstützt.'),
      ),
    ),
  );
}
