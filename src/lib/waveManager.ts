import type { WaveType } from '../utils/types';

// ─── Frases por tipo de oleada ────────────────────────────────────────────────

const WAVE_PHRASES: Record<WaveType, string[]> = {
  laugh: [
    'JAJAJA',
    'jajajaja',
    'AJAJAJAJAJA',
    'me meo',
    'jajaj no puede ser',
    'me parto tio',
    'JAJAJAJAJAJAJA',
    'ajajajaja dios mio',
    'jajajaj que crack',
    'me parto en dos',
    'jajaja muerto',
    'LOOOOL',
    'jajajajajajajaj',
    'me estoy meando',
    'jajaja que payaso',
  ],
  hype: [
    'VAMOS',
    'LETS GOOOOO',
    'AAAAAAA',
    'GO GO GO',
    'SIIIIII',
    'VAMOOOOS',
    'ASI SE HACE',
    'VAMOS CRACK',
    'GOOOOO',
    'FUERZAAAAA',
    'A TOPE',
    'QUE MAQUINA',
    'VAMOS CAMPEON',
    'INSANO',
    'BRUTAL',
  ],
  fear: [
    'NO NO NO',
    'CORRE',
    'DIOS MIO',
    'NOOOOO',
    'ay madre',
    'NO LO HAGAS',
    'CUIDADO',
    'PARA PARA PARA',
    'no mires atras',
    'ALEJATE',
    'HUYE',
    'me da miedo',
    'no no no no no',
    'QUE MIEDO',
    'ay dios',
  ],
  omg: [
    'QUE ES ESTO',
    'imposible',
    'esto no es real',
    'W',
    'LITERALMENTE NO',
    'no me lo creo',
    'QUE ACABA DE PASAR',
    'esto es una locura',
    'no puede ser',
    'WTF',
    'eso no deberia ser posible',
    'COMO',
    'me has flipado',
    'increible',
    'la madre que lo pario',
  ],
};

// ─── Estado interno ───────────────────────────────────────────────────────────

interface ActiveWave {
  type: WaveType;
  phrases: string[];   // frases shuffleadas, se van consumiendo
  index: number;       // siguiente frase a emitir
}

/**
 * Cola de oleadas por userId.
 * Cada entrada es un array: la primera es la oleada activa, el resto son las encoladas.
 */
const waveQueues = new Map<string, ActiveWave[]>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildWave(type: WaveType): ActiveWave {
  // Elegir entre 6 y 9 frases al azar del pool shuffleado
  const count = Math.floor(Math.random() * 4) + 6; // 6..9
  const phrases = shuffle(WAVE_PHRASES[type]).slice(0, count);
  return { type, phrases, index: 0 };
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Encola una nueva oleada para el usuario.
 * Si hay una activa, la nueva se añade detrás.
 */
export function enqueueWave(userId: string, type: WaveType): void {
  const queue = waveQueues.get(userId) ?? [];
  queue.push(buildWave(type));
  waveQueues.set(userId, queue);
}

/**
 * Devuelve true si el usuario tiene alguna oleada activa o encolada.
 */
export function hasActiveWave(userId: string): boolean {
  const queue = waveQueues.get(userId);
  return !!queue && queue.length > 0;
}

/**
 * Consume y devuelve la siguiente frase de la oleada activa.
 * Cuando se agota la oleada activa, pasa automáticamente a la siguiente en cola.
 * Devuelve null si no hay ninguna oleada.
 */
export function getNextWavePhrase(userId: string): string | null {
  const queue = waveQueues.get(userId);
  if (!queue || queue.length === 0) return null;

  const current = queue[0];

  if (current.index >= current.phrases.length) {
    // Esta oleada ya se agotó: descartarla y pasar a la siguiente
    queue.shift();
    if (queue.length === 0) {
      waveQueues.delete(userId);
      return null;
    }
  }

  const wave = queue[0];
  const phrase = wave.phrases[wave.index];
  wave.index++;
  return phrase;
}

/**
 * Limpia todas las oleadas de un usuario (al desconectarse).
 */
export function clearWaves(userId: string): void {
  waveQueues.delete(userId);
}
