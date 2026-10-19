// Erfolge – werden von Client und Server gemeinsam verwendet.
// Punkte im Stil eines "Gamerscore", Seltenheit im Stil von Trophäen.

export const ACHIEVEMENTS = [
  { id: 'welcome', title: 'Willkommen an Bord', desc: 'Melde dich zum ersten Mal bei X-Station an.', points: 10, tier: 'bronze', icon: 'rocket' },
  { id: 'first-friend', title: 'Nicht mehr allein', desc: 'Füge deinen ersten Freund hinzu.', points: 30, tier: 'silver', icon: 'users' },
  { id: 'social', title: 'Gesellige Runde', desc: 'Habe 3 Freunde in deiner Freundesliste.', points: 50, tier: 'gold', icon: 'party-popper' },
  { id: 'first-message', title: 'Erste Worte', desc: 'Sende eine Nachricht an einen Freund.', points: 15, tier: 'bronze', icon: 'message-circle' },
  { id: 'surfer', title: 'Weltenbummler', desc: 'Öffne eine Webseite im X-Station-Browser.', points: 15, tier: 'bronze', icon: 'globe' },
  { id: 'dj', title: 'Ambient-DJ', desc: 'Spiele einen Titel in der Musik-App ab.', points: 15, tier: 'bronze', icon: 'disc-3' },
  { id: 'collector', title: 'Sammler', desc: 'Lade ein Spiel aus dem Store herunter.', points: 20, tier: 'bronze', icon: 'download' },
  { id: 'nice-try', title: 'Netter Versuch', desc: 'Versuche, ein Spiel zu starten.', points: 10, tier: 'bronze', icon: 'gamepad-2' },
  { id: 'stylist', title: 'Stilbewusst', desc: 'Ändere die Akzentfarbe des Systems.', points: 10, tier: 'bronze', icon: 'palette' },
  { id: 'reader', title: 'Kleingedrucktes', desc: 'Lies die Credits unter Einstellungen › Info.', points: 10, tier: 'bronze', icon: 'info' },
  { id: 'explorer', title: 'Entdecker', desc: 'Öffne das Control Center und den Guide.', points: 20, tier: 'silver', icon: 'compass' },
  { id: 'platinum', title: 'X-Station-Legende', desc: 'Schalte alle anderen Erfolge frei.', points: 100, tier: 'platinum', icon: 'crown' },
];

export const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));

export function achievementScore(unlocked) {
  const set = new Set(Object.keys(unlocked || {}));
  return ACHIEVEMENTS.filter((a) => set.has(a.id)).reduce((sum, a) => sum + a.points, 0);
}
