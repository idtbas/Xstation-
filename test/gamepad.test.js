import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BTN, padType, padName, normalizePad, applyDeadzone, buttonActions } from '../public/js/core/gamepad-map.js';
import { deviceKind } from '../public/js/core/device.js';

const buttons = (n, pressed = []) => Array.from({ length: n }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));

describe('Controller-Erkennung', () => {
  test('Xbox-Controller werden erkannt – auch wenn sie „Wireless Controller“ heißen', () => {
    for (const id of [
      'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
      'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
      '045e-0b12-Microsoft Xbox Series S|X Controller',
      'Microsoft X-Box One S pad',
    ]) {
      assert.equal(padType(id), 'xbox', id);
    }
    assert.equal(padType('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'), 'playstation');
    assert.equal(padType('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)'), 'playstation');
    assert.equal(padType('8BitDo Pro 2'), 'generic');
  });

  test('Modellnamen', () => {
    assert.equal(padName('Xbox Wireless Controller (Vendor: 045e Product: 0b13)'), 'Xbox Series X|S Controller');
    assert.equal(padName('Xbox Elite Wireless Controller Series 2 (Vendor: 045e Product: 0b00)'), 'Xbox Elite Controller');
    assert.equal(padName('Xbox 360 Controller (XInput STANDARD GAMEPAD)'), 'Xbox 360 Controller');
    assert.equal(padName('Vendor: 045e Product: 02ea'), 'Xbox One Controller');
  });
});

describe('Normalisierung', () => {
  test('Standard-Layout bleibt erhalten, inkl. Trigger-Wert', () => {
    const raw = buttons(17, [BTN.A]);
    raw[BTN.RT] = { pressed: false, value: 0.8 };
    const pad = normalizePad({ id: 'Xbox 045e', index: 0, mapping: 'standard', connected: true, buttons: raw, axes: [0.1, -0.2, 0.3, 0.4] });
    assert.equal(pad.type, 'xbox');
    assert.equal(pad.layout, 'standard');
    assert.equal(pad.buttons.length, 18);
    assert.equal(pad.buttons[BTN.A].pressed, true);
    assert.equal(pad.buttons[BTN.RT].pressed, true, 'Trigger über 50 % zählt als gedrückt');
    assert.equal(pad.buttons[BTN.SHARE].pressed, false);
    assert.deepEqual(pad.axes, [0.1, -0.2, 0.3, 0.4]);
  });

  test('Firefox/Linux-Layout (xpad) wird auf Standard umgerechnet', () => {
    // Tasten: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 View, 7 Menu, 8 Xbox, 9 LS, 10 RS
    const pad = normalizePad({
      id: '045e-02ea-Microsoft X-Box One S pad',
      index: 1,
      mapping: '',
      connected: true,
      buttons: buttons(11, [6, 8]),
      // LX LY LT RX RY RT DX DY – LT gedrückt, RT in Ruhe, Steuerkreuz links
      axes: [0, 0, 1, 0.5, -0.5, -1, -1, 0],
    });
    assert.equal(pad.layout, 'angepasst');
    assert.equal(pad.buttons[BTN.VIEW].pressed, true);
    assert.equal(pad.buttons[BTN.HOME].pressed, true);
    assert.equal(pad.buttons[BTN.MENU].pressed, false);
    assert.equal(pad.buttons[BTN.LT].value, 1);
    assert.equal(pad.buttons[BTN.RT].value, 0);
    assert.equal(pad.buttons[BTN.LEFT].pressed, true);
    assert.deepEqual(pad.axes, [0, 0, 0.5, -0.5]);
  });

  test('Getrennte Controller werden ignoriert', () => {
    assert.equal(normalizePad(null), null);
    assert.equal(normalizePad({ connected: false }), null);
  });
});

describe('Totzone und Tastenbelegung', () => {
  test('Radiale Totzone mit Neuskalierung', () => {
    assert.deepEqual(applyDeadzone(0.1, 0.1, 0.2), [0, 0, 0]);
    const [x, y, m] = applyDeadzone(1, 0, 0.2);
    assert.equal(x, 1);
    assert.equal(y, 0);
    assert.equal(m, 1);
    const [, , half] = applyDeadzone(0.6, 0, 0.2);
    assert.ok(Math.abs(half - 0.5) < 1e-9);
  });

  test('Xbox: Xbox-Taste = Guide, View = Control Center, Halten-Funktionen', () => {
    const map = buttonActions('xbox');
    assert.deepEqual(map[BTN.HOME], { tap: 'guide', hold: 'power' });
    assert.deepEqual(map[BTN.VIEW], { tap: 'cc', hold: 'guide' });
    assert.equal(map[BTN.MENU].tap, 'menu');
    assert.equal(map[BTN.LT].tap, 'lt');
    assert.equal(map[BTN.SHARE].tap, 'cc');
  });

  test('PlayStation: PS-Taste = Control Center, Create = Guide', () => {
    const map = buttonActions('playstation');
    assert.equal(map[BTN.HOME].tap, 'cc');
    assert.equal(map[BTN.VIEW].tap, 'guide');
  });
});

describe('Unterstützte Geräte', () => {
  test('Desktop ja, iPad (mit Controller) ja, Smartphones und andere Tablets nein', () => {
    const ua = (userAgent, extra = {}) => ({ userAgent, maxTouchPoints: 0, ...extra });
    assert.equal(deviceKind(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36')), 'desktop');
    assert.equal(deviceKind(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15')), 'desktop');
    assert.equal(deviceKind(ua('Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0')), 'desktop');
    assert.equal(deviceKind(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', { maxTouchPoints: 5 })), 'ipad', 'iPadOS meldet sich als Mac');
    assert.equal(deviceKind(ua('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')), 'ipad');
    assert.equal(deviceKind(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')), 'mobile');
    assert.equal(deviceKind(ua('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36')), 'mobile');
    assert.equal(deviceKind(ua('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/140 Safari/537.36')), 'mobile', 'Android-Tablet');
    assert.equal(deviceKind({ userAgent: '', userAgentData: { mobile: true } }), 'mobile');
  });
});
