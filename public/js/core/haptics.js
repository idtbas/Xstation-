// Vibration (Rumble) für Controller – inklusive Trigger-Vibration, sofern der Browser
// sie für Xbox-Controller unterstützt ("trigger-rumble").

import { prefs } from './store.js';

let activeIndex = null;

export function setActivePad(index) {
  activeIndex = index;
}

// Schritte: d = Dauer (ms), w = schwacher Motor, s = starker Motor, lt/rt = Trigger, gap = Pause
const PATTERNS = {
  select: [{ d: 28, w: 0.28, s: 0 }],
  back: [{ d: 22, w: 0.18, s: 0 }],
  toggle: [{ d: 18, w: 0.25, s: 0 }],
  open: [{ d: 45, w: 0.2, s: 0.08 }],
  notify: [{ d: 70, w: 0.35, s: 0.15 }],
  error: [{ d: 70, w: 0.2, s: 0.6 }, { gap: 70 }, { d: 90, w: 0.2, s: 0.6 }],
  power: [{ d: 160, w: 0.3, s: 0.7 }],
  launch: [{ d: 260, w: 0.25, s: 0.45, lt: 0.4, rt: 0.4 }],
  achievement: [{ d: 90, w: 0.6, s: 0.4, lt: 0.7, rt: 0.7 }, { gap: 60 }, { d: 180, w: 0.45, s: 0.2, rt: 0.5 }],
  test: [{ d: 300, w: 0.4, s: 0.8 }, { gap: 120 }, { d: 300, w: 0, s: 0, lt: 1, rt: 0 }, { gap: 60 }, { d: 300, w: 0, s: 0, lt: 0, rt: 1 }],
};

function actuatorFor(index) {
  const pad = navigator.getGamepads?.()[index];
  return pad?.vibrationActuator || null;
}

export function canVibrate(index = activeIndex) {
  return index != null && !!actuatorFor(index);
}

export function canTriggerRumble(index = activeIndex) {
  const act = index != null ? actuatorFor(index) : null;
  return !!act?.effects?.includes?.('trigger-rumble');
}

export function rumble(name, { force = false, index = activeIndex } = {}) {
  if (index == null) return;
  if (!force && !prefs.get('vibration')) return;
  const steps = PATTERNS[name];
  const act = actuatorFor(index);
  if (!steps || !act?.playEffect) return;
  const k = Math.max(0, Math.min(1, prefs.get('vibrationStrength') ?? 0.7));
  const triggers = act.effects?.includes?.('trigger-rumble');
  let at = 0;
  for (const st of steps) {
    if (st.gap) {
      at += st.gap;
      continue;
    }
    const delay = at;
    setTimeout(() => {
      if ((st.lt || st.rt) && triggers) {
        act
          .playEffect('trigger-rumble', {
            duration: st.d,
            startDelay: 0,
            strongMagnitude: (st.s || 0) * k,
            weakMagnitude: (st.w || 0) * k,
            leftTrigger: (st.lt || 0) * k,
            rightTrigger: (st.rt || 0) * k,
          })
          .catch(() => {});
      } else if (st.w || st.s) {
        act.playEffect('dual-rumble', { duration: st.d, startDelay: 0, strongMagnitude: (st.s || 0) * k, weakMagnitude: (st.w || 0) * k }).catch(() => {});
      }
    }, delay);
    at += st.d;
  }
}
