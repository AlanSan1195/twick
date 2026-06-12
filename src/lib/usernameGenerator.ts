// ============================================
// GENERADOR DE USERNAMES — nombres realistas estilo Twitch/Kick
// ============================================
//
// Genera usernames procedurales que imitan los patrones reales de un chat:
// palabras inventadas (zajeric, jawiyo), nombre+número (salvadorj6709),
// mezclas de palabras (lubaigamer), CamelCase (DobleRelleno), guiones bajos
// (nanu_np, Darth_Deagle28), prefijos (iAmPrano, xdy11_), etc.
// Sin prefijos del tema del juego — los nombres son independientes del contexto.

// ─── Pools de construcción ────────────────────────────────────────────────────

const NOMBRES = [
  'salvador', 'israel', 'dario', 'mateo', 'nico', 'leo', 'iker', 'axel',
  'bruno', 'dante', 'elias', 'gael', 'ivan', 'joel', 'marco', 'noah',
  'oscar', 'rafa', 'samu', 'teo', 'victor', 'yago', 'alan', 'david',
  'santi', 'tomi', 'facu', 'agus', 'lucho', 'seba', 'rodri', 'manu',
  'memo', 'checo', 'pancho', 'lalo', 'chuy', 'beto', 'kike', 'juanjo',
];

const PALABRAS = [
  'shadow', 'nova', 'pixel', 'dark', 'ghost', 'frost', 'storm', 'blaze',
  'viper', 'raven', 'wolf', 'fox', 'cyber', 'neon', 'retro', 'toxic',
  'mystic', 'lunar', 'nexo', 'titan', 'rojo', 'negro', 'loco', 'tigre',
  'lobo', 'gato', 'panda', 'mono', 'taco', 'relleno', 'doble', 'flaco',
  'primo', 'vecino', 'jefe', 'capo', 'manco', 'sniper', 'rusher', 'camper',
  'jungler', 'support', 'carry', 'deagle', 'clutch', 'aim', 'best', 'real',
];

// Sílabas para inventar palabras pronunciables (zajeric, jawiyo, nanu)
const SILABAS = [
  'na', 'ne', 'ni', 'no', 'nu', 'ka', 'ke', 'ki', 'ko', 'ku',
  'ta', 'te', 'ti', 'to', 'tu', 'ra', 're', 'ri', 'ro', 'ru',
  'sa', 'se', 'si', 'so', 'su', 'va', 've', 'vi', 'vo', 'ja',
  'je', 'jo', 'ju', 'wa', 'wi', 'wo', 'ya', 'yo', 'yu', 'za',
  'ze', 'zi', 'zo', 'lu', 'li', 'la', 'lo', 'le', 'ba', 'bi',
  'bo', 'mi', 'ma', 'mo', 'xa', 'xi', 'xo', 'pra', 'tre', 'dra',
];

// Consonantes de cierre para que algunas palabras inventadas no terminen en vocal
const CIERRES = ['c', 'k', 'n', 'r', 's', 't', 'x', 'th', 'm'];

const PREFIJOS = ['iAm', 'el', 'x', 'im', 'its', 'soy', 'mr', 'don'];

// ─── Helpers de aleatoriedad ──────────────────────────────────────────────────

function pick<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function chance(probability: number): boolean {
  return Math.random() < probability;
}

/** Número estilo año de nacimiento o dígitos aleatorios: '07', '96', '330', '6709' */
function numeroAleatorio(): string {
  const tipo = Math.random();
  if (tipo < 0.45) {
    // Año de dos dígitos (85–09)
    const year = 85 + Math.floor(Math.random() * 25);
    return String(year % 100).padStart(2, '0');
  }
  if (tipo < 0.75) {
    return String(Math.floor(Math.random() * 900) + 100); // 3 dígitos
  }
  if (tipo < 0.9) {
    return String(Math.floor(Math.random() * 9000) + 1000); // 4 dígitos
  }
  return String(Math.floor(Math.random() * 10)); // 1 dígito
}

/** Palabra inventada pronunciable de 2 a 4 sílabas: 'zajeric', 'jawiyo', 'nanu' */
function palabraInventada(): string {
  const numSilabas = 2 + Math.floor(Math.random() * 3);
  let palabra = '';
  for (let i = 0; i < numSilabas; i++) {
    palabra += pick(SILABAS);
  }
  if (chance(0.35)) {
    palabra += pick(CIERRES);
  }
  return palabra;
}

/** Estira una vocal al estilo 'styveeenth' (steve → steveee) */
function estirarVocal(palabra: string): string {
  const indices = [...palabra].reduce<number[]>((acc, char, i) => {
    if ('aeiou'.includes(char)) acc.push(i);
    return acc;
  }, []);
  if (indices.length === 0) return palabra;

  const indice = pick(indices);
  const vocal = palabra[indice];
  const repeticiones = 1 + Math.floor(Math.random() * 2);
  return palabra.slice(0, indice) + vocal.repeat(repeticiones) + palabra.slice(indice);
}

function capitalizar(palabra: string): string {
  return palabra.charAt(0).toUpperCase() + palabra.slice(1);
}

// ─── Patrones de username ─────────────────────────────────────────────────────

type PatronUsername = () => string;

interface PatronPonderado {
  patron: PatronUsername;
  weight: number;
}

const PATRONES: PatronPonderado[] = [
  // 'zajeric', 'jawiyo' — palabra inventada en minúsculas
  { weight: 0.14, patron: () => palabraInventada() },

  // 'exitium330', 'nexonr96' — inventada + número
  { weight: 0.14, patron: () => palabraInventada() + numeroAleatorio() },

  // 'salvadorj6709', 'israelvalad' — nombre real + letra/sílaba + número opcional
  {
    weight: 0.13,
    patron: () => {
      const base = pick(NOMBRES) + (chance(0.5) ? pick('bcdjklmnrstv'.split('')) : pick(SILABAS));
      return chance(0.7) ? base + numeroAleatorio() : base;
    },
  },

  // 'lubaigamer', 'nenobest' — inventada/palabra + palabra, todo en minúsculas
  {
    weight: 0.13,
    patron: () => (chance(0.5) ? palabraInventada() : pick(PALABRAS)) + pick(PALABRAS),
  },

  // 'DobleRelleno', 'Darth_Deagle28' — CamelCase, con guion bajo y número opcionales
  {
    weight: 0.12,
    patron: () => {
      const separador = chance(0.35) ? '_' : '';
      const base = capitalizar(pick(PALABRAS)) + separador + capitalizar(pick(PALABRAS));
      return chance(0.4) ? base + numeroAleatorio() : base;
    },
  },

  // 'Westerntitan85', 'Manetheren07' — inventada/palabra capitalizada + año
  {
    weight: 0.11,
    patron: () => capitalizar(chance(0.5) ? palabraInventada() : pick(PALABRAS) + pick(PALABRAS)) + numeroAleatorio(),
  },

  // 'iAmPrano', 'elprimoloco', 'xdy11_' — prefijo + palabra
  {
    weight: 0.11,
    patron: () => {
      const prefijo = pick(PREFIJOS);
      const cuerpo = chance(0.5) ? palabraInventada() : pick(PALABRAS);
      const base = prefijo + (prefijo === 'iAm' || prefijo === 'mr' ? capitalizar(cuerpo) : cuerpo);
      return chance(0.3) ? base + numeroAleatorio() : base;
    },
  },

  // 'nanu_np', 'xdy11_' — corto con guion bajo: sufijo abreviado o underscore final
  {
    weight: 0.12,
    patron: () => {
      const base = chance(0.6) ? pick(SILABAS) + pick(SILABAS) : pick(NOMBRES).slice(0, 4);
      if (chance(0.5)) {
        // Sufijo abreviado de 1-2 letras: 'nanu_np'
        const sufijo = pick('bcdkmnprstvx'.split('')) + (chance(0.6) ? pick('bcdkmnprstvx'.split('')) : '');
        return `${base}_${sufijo}`;
      }
      // Underscore final: 'xdy11_'
      return base + numeroAleatorio() + '_';
    },
  },
];

function generarUsername(): string {
  const random = Math.random();
  let sum = 0;
  for (const { patron, weight } of PATRONES) {
    sum += weight;
    if (random < sum) {
      const username = patron();
      // Estiramiento de vocal ocasional: 'styveeenth'
      return chance(0.08) ? estirarVocal(username) : username;
    }
  }
  return palabraInventada();
}

/**
 * Genera un pool de usernames únicos y realistas.
 * Cada llamada produce un pool distinto (no determinista).
 */
export function generateUsernamePool(count: number): string[] {
  const pool = new Set<string>();
  // Tope de intentos por si las colisiones se acumulan en pools grandes
  let intentos = 0;
  const maxIntentos = count * 10;

  while (pool.size < count && intentos < maxIntentos) {
    pool.add(generarUsername());
    intentos++;
  }

  return [...pool];
}
