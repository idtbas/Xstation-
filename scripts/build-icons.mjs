// Erzeugt public/js/ui/icons.js aus dem Paket "lucide-static" (ISC-Lizenz).
// Aufruf: npm run icons   (nach npm install)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const nodes = require('lucide-static/icon-nodes.json');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NAMES = `
house search settings bell bell-ring users user user-plus user-check user-x user-minus user-round
message-circle message-square send trophy award crown medal gamepad-2 joystick globe list-music disc-3 headphones
download shopping-bag library-big layout-grid power moon refresh-cw rotate-cw log-out volume-2 volume-x
accessibility wifi chevron-left chevron-right chevron-up chevron-down arrow-left arrow-right x plus check
lock shield shield-check info palette monitor sparkles sparkle star play pause skip-forward skip-back ellipsis
compass rocket party-popper hard-drive keyboard external-link bookmark clock trash pencil eye-off zap flame
leaf snowflake cat dog bird rabbit turtle fish bot ghost gem sword swords anchor feather sun cloud heart
mountain tv film image newspaper circle triangle square cpu file-text sliders-horizontal contrast hand mail
radio activity flag map-pin orbit ship car trees castle app-window mouse-pointer-click wand-sparkles
`
  .trim()
  .split(/\s+/);

const out = {};
for (const name of NAMES) {
  const node = nodes[name];
  if (!node) throw new Error(`Icon fehlt: ${name}`);
  out[name] = node
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
}

const file = `// Automatisch erzeugt durch scripts/build-icons.mjs – nicht von Hand bearbeiten.
// Symbole: Lucide (https://lucide.dev), ISC-Lizenz, © Lucide Contributors.
export const ICONS = ${JSON.stringify(out, null, 0).replace(/","/g, '",\n"')};
`;
fs.writeFileSync(path.join(__dirname, '..', 'public', 'js', 'ui', 'icons.js'), file);
console.log(`${NAMES.length} Icons geschrieben.`);
