// Vereinheitlicht Controller-Rohdaten auf das W3C-Standardlayout ("standard" mapping).
// Reine Funktionen ohne DOM – werden auch in den Node-Tests geprüft.

export const BTN = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VIEW: 8,
  MENU: 9,
  LS: 10,
  RS: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
  HOME: 16,
  SHARE: 17,
};
export const BUTTON_COUNT = 18;

export function padType(id = '') {
  const s = id.toLowerCase();
  // Xbox zuerst prüfen: Xbox-Controller heißen ebenfalls „Wireless Controller“
  if (/045e|xbox|xinput|x-box/.test(s)) return 'xbox';
  if (/054c|dualsense|dualshock|playstation|^wireless controller/.test(s)) return 'playstation';
  return 'generic';
}

const XBOX_MODELS = [
  [/0b00|0b05|0b22|02e3|elite/, 'Xbox Elite Controller'],
  [/0b0a|adaptive/, 'Xbox Adaptive Controller'],
  [/0b12|0b13|0b20|0b21|series/, 'Xbox Series X|S Controller'],
  [/02d1|02dd|02e0|02ea|02fd|xbox one/, 'Xbox One Controller'],
  [/028e|028f|0291|0719|xbox 360/, 'Xbox 360 Controller'],
];

export function padName(id = '') {
  const s = id.toLowerCase();
  const type = padType(id);
  if (type === 'xbox') return (XBOX_MODELS.find(([re]) => re.test(s)) || [null, 'Xbox Controller'])[1];
  if (type === 'playstation') return /0ce6|0df2|dualsense/.test(s) ? 'DualSense Controller' : 'DualShock 4 Controller';
  return 'Controller';
}

function btn(pressed, value) {
  const v = typeof value === 'number' ? value : pressed ? 1 : 0;
  return { pressed: !!pressed || v > 0.5, value: v };
}

function fromRaw(b) {
  return b ? btn(b.pressed, b.value) : btn(false, 0);
}

// Firefox unter Linux (xpad-Treiber) liefert Xbox-Controller ohne Standard-Layout:
// Achsen: 0 LX, 1 LY, 2 LT, 3 RX, 4 RY, 5 RT, 6 Kreuz-X, 7 Kreuz-Y (Trigger ruhen bei -1)
// Tasten: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 View, 7 Menu, 8 Xbox, 9 LS, 10 RS
function fromLinuxXbox(pad) {
  const ax = pad.axes;
  const b = pad.buttons;
  const trig = (v) => Math.min(1, Math.max(0, ((v ?? -1) + 1) / 2));
  const dx = ax[6] ?? 0;
  const dy = ax[7] ?? 0;
  const buttons = Array.from({ length: BUTTON_COUNT }, () => btn(false, 0));
  buttons[BTN.A] = fromRaw(b[0]);
  buttons[BTN.B] = fromRaw(b[1]);
  buttons[BTN.X] = fromRaw(b[2]);
  buttons[BTN.Y] = fromRaw(b[3]);
  buttons[BTN.LB] = fromRaw(b[4]);
  buttons[BTN.RB] = fromRaw(b[5]);
  buttons[BTN.LT] = btn(false, trig(ax[2]));
  buttons[BTN.RT] = btn(false, trig(ax[5]));
  buttons[BTN.VIEW] = fromRaw(b[6]);
  buttons[BTN.MENU] = fromRaw(b[7]);
  buttons[BTN.HOME] = fromRaw(b[8]);
  buttons[BTN.LS] = fromRaw(b[9]);
  buttons[BTN.RS] = fromRaw(b[10]);
  buttons[BTN.UP] = btn(dy < -0.5, dy < -0.5 ? 1 : 0);
  buttons[BTN.DOWN] = btn(dy > 0.5, dy > 0.5 ? 1 : 0);
  buttons[BTN.LEFT] = btn(dx < -0.5, dx < -0.5 ? 1 : 0);
  buttons[BTN.RIGHT] = btn(dx > 0.5, dx > 0.5 ? 1 : 0);
  return { buttons, axes: [ax[0] ?? 0, ax[1] ?? 0, ax[3] ?? 0, ax[4] ?? 0] };
}

export function normalizePad(pad) {
  if (!pad || pad.connected === false) return null;
  const type = padType(pad.id);
  let mapped;
  let layout;
  if (pad.mapping === 'standard') {
    const buttons = Array.from({ length: BUTTON_COUNT }, (_, i) => fromRaw(pad.buttons[i]));
    mapped = { buttons, axes: [pad.axes[0] ?? 0, pad.axes[1] ?? 0, pad.axes[2] ?? 0, pad.axes[3] ?? 0] };
    layout = 'standard';
  } else if (type === 'xbox' && pad.axes.length >= 6) {
    mapped = fromLinuxXbox(pad);
    layout = 'angepasst';
  } else {
    const buttons = Array.from({ length: BUTTON_COUNT }, (_, i) => fromRaw(pad.buttons[i]));
    mapped = { buttons, axes: [pad.axes[0] ?? 0, pad.axes[1] ?? 0, pad.axes[2] ?? 0, pad.axes[3] ?? 0] };
    layout = 'unbekannt';
  }
  return {
    index: pad.index,
    id: pad.id,
    type,
    name: padName(pad.id),
    layout,
    buttons: mapped.buttons,
    axes: mapped.axes,
    actuator: pad.vibrationActuator || null,
  };
}

// Radiale Totzone mit Neuskalierung: kleine Bewegungen werden ignoriert,
// außerhalb der Totzone beginnt der Wert wieder bei 0.
export function applyDeadzone(x, y, deadzone) {
  const mag = Math.hypot(x, y);
  if (mag <= deadzone) return [0, 0, 0];
  const scaled = Math.min(1, (mag - deadzone) / (1 - deadzone));
  return [(x / mag) * scaled, (y / mag) * scaled, scaled];
}

// Welche Aktion löst eine Taste aus? Kurz drücken (tap) bzw. halten (hold).
// Xbox: Xbox-Taste = Guide (halten: Ein/Aus), View = Control Center (halten: Guide).
// PlayStation: PS-Taste = Control Center (halten: Ein/Aus), Create = Guide.
export function buttonActions(type) {
  const common = {
    [BTN.A]: { tap: 'accept' },
    [BTN.B]: { tap: 'back' },
    [BTN.X]: { tap: 'x' },
    [BTN.Y]: { tap: 'y' },
    [BTN.LB]: { tap: 'lb' },
    [BTN.RB]: { tap: 'rb' },
    [BTN.LT]: { tap: 'lt', repeat: true },
    [BTN.RT]: { tap: 'rt', repeat: true },
    [BTN.MENU]: { tap: 'menu' },
    [BTN.LS]: { tap: 'ls' },
    [BTN.RS]: { tap: 'rs' },
  };
  if (type === 'playstation') {
    return {
      ...common,
      [BTN.VIEW]: { tap: 'guide' },
      [BTN.HOME]: { tap: 'cc', hold: 'power' },
      [BTN.SHARE]: { tap: 'guide' },
    };
  }
  return {
    ...common,
    [BTN.VIEW]: { tap: 'cc', hold: 'guide' },
    [BTN.HOME]: { tap: 'guide', hold: 'power' },
    [BTN.SHARE]: { tap: 'cc' },
  };
}
