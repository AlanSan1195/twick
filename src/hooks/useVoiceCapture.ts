import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { VoiceStatus } from '../utils/types';

// ============================================
// useVoiceCapture — captura de micrófono con auto-corte por silencio (VAD)
// ============================================
//
// El MediaRecorder graba segmentos COMPLETOS (no usamos start(timeslice):
// los chunks intermedios de webm no llevan cabecera de contenedor y Whisper
// no puede decodificarlos). Lo que decide CUÁNDO cortar es una máquina de
// estados dirigida por el nivel de audio (RMS), evaluada en el muestreo:
//
//   - El streamer empieza a hablar  → se detecta voz (histéresis de umbral)
//   - Deja de hablar ~SILENCE_HANGOVER_MS → corta y envía la frase (fluido)
//   - Habla más de MAX_UTTERANCE_MS  → corta por seguridad y envía
//   - Silencio prolongado → reinicia el recorder y DESCARTA el blob, para
//     no acumular audio vacío (deja un pequeño pre-roll que evita cortar la
//     primera palabra de la siguiente frase).

export interface UseVoiceCaptureOptions {
  /** Activa/desactiva el ciclo de captura */
  enabled: boolean;
  /** Duración máxima de una frase en ms antes de cortar por seguridad (default 10000) */
  maxUtteranceMs?: number;
  /** Umbral de RMS para activar la voz (más alto = micro más cerrado). Se aplica en caliente */
  speechStartRms?: number;
  /** Tiempo (ms) que la voz debe sostenerse para confirmarse (más alto = filtra más ruidos cortos). En caliente */
  speechConfirmMs?: number;
  /** Callback con el blob de audio cuando el segmento contiene voz */
  onSegment: (blob: Blob) => Promise<void>;
}

export interface UseVoiceCaptureResult {
  status: VoiceStatus;
  errorMessage: string | null;
  /** Ref al nivel de audio actual (RMS 0–1 aprox), para animar visualizaciones sin re-renderizar */
  audioLevel: RefObject<number>;
}

/** Tope por defecto de duración de una frase (ms) */
const DEFAULT_MAX_UTTERANCE_MS = 10000;

// Umbrales "cerrados": exigen voz directa al micro y dejan fuera el ruido
// ambiental (zumbido de PC, ventilador, aire). Súbelos para hacerlo aún más
// estricto, bájalos si cuesta que active la voz.

/** Umbral de RMS por defecto para considerar INICIO de voz (ajustable desde la UI) */
const DEFAULT_SPEECH_START_RMS = 0.08;

/** Umbral de RMS por encima del cual la voz se considera aún activa */
const SPEECH_KEEP_RMS = 0.035;

/** Tiempo por defecto que la voz debe sostenerse para confirmarse (ajustable desde la UI) */
const DEFAULT_SPEECH_CONFIRM_MS = 180;

/** Silencio sostenido tras el cual se corta la frase y se procesa (ms) */
const SILENCE_HANGOVER_MS = 1200;

/** Si no hay voz, se reinicia el recorder cada N ms y se descarta el blob de silencio */
const IDLE_RESET_MS = 3000;

/** Cada cuánto se muestrea el nivel de audio (VAD + alimentar la animación) */
const LEVEL_SAMPLE_MS = 80;

/** Elige el mimeType soportado por el navegador (webm en Chrome/Firefox, mp4 en Safari) */
function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return '';
}

export function useVoiceCapture({
  enabled,
  maxUtteranceMs = DEFAULT_MAX_UTTERANCE_MS,
  speechStartRms = DEFAULT_SPEECH_START_RMS,
  speechConfirmMs = DEFAULT_SPEECH_CONFIRM_MS,
  onSegment,
}: UseVoiceCaptureOptions): UseVoiceCaptureResult {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // El callback y los umbrales se guardan en refs para que cambiar las perillas
  // de la UI tome efecto EN CALIENTE, sin reiniciar la captura del micrófono
  const onSegmentRef = useRef(onSegment);
  onSegmentRef.current = onSegment;
  const speechStartRmsRef = useRef(speechStartRms);
  speechStartRmsRef.current = speechStartRms;
  const speechConfirmMsRef = useRef(speechConfirmMs);
  speechConfirmMsRef.current = speechConfirmMs;

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Evita que el onstop de un ciclo cancelado reinicie la grabación
  const stoppingRef = useRef(false);
  // true si el RMS superó el umbral de voz durante la grabación actual
  const voiceDetectedRef = useRef(false);
  // Evita disparar un segundo stop() mientras ya se está cortando
  const cuttingRef = useRef(false);
  // Marcas de tiempo (performance.now) para la máquina de estados VAD
  const recordingStartRef = useRef(0);
  const speechStartRef = useRef(0);
  const lastSpeechRef = useRef(0);
  // Instante en que el RMS empezó a superar el umbral de inicio (0 = sin candidato)
  const speechCandidateSinceRef = useRef(0);
  // Nivel de audio actual (RMS), expuesto para animar las ondas de sonido
  const audioLevelRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      setErrorMessage(null);
      return;
    }

    let cancelled = false;
    stoppingRef.current = false;

    const startCapture = async () => {
      setStatus('requesting');
      setErrorMessage(null);

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // autoGainControl desactivado: no amplificar el silencio/ruido ambiental
          // (mantiene el micro "cerrado" a la voz directa)
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        });
      } catch (error) {
        if (cancelled) return;
        const err = error as DOMException;
        if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
          setStatus('permission-denied');
          setErrorMessage('Permiso de micrófono denegado o no disponible');
        } else {
          setStatus('error');
          setErrorMessage('No se pudo acceder al micrófono');
        }
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      // Analizador de nivel: alimenta tanto el VAD como la animación de ondas
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const levelBuffer = new Uint8Array(analyser.fftSize);

      const mimeType = pickMimeType();
      if (!mimeType) {
        setStatus('error');
        setErrorMessage('Este navegador no soporta grabación de audio');
        return;
      }

      // Corta la grabación actual; onstop decide si enviar o descartar
      const cut = () => {
        const recorder = recorderRef.current;
        if (!recorder || cuttingRef.current) return;
        cuttingRef.current = true;
        if (recorder.state === 'recording') recorder.stop();
      };

      // Muestreo periódico: calcula RMS y aplica la máquina de estados VAD
      levelTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(levelBuffer);
        let sumSquares = 0;
        for (let i = 0; i < levelBuffer.length; i++) {
          const normalized = (levelBuffer[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / levelBuffer.length);
        audioLevelRef.current = rms;

        if (cuttingRef.current || !recorderRef.current) return;
        const now = performance.now();

        // Por encima del umbral de mantenimiento, la voz sigue activa
        if (rms > SPEECH_KEEP_RMS) {
          lastSpeechRef.current = now;
        }
        // Inicio de frase: el RMS debe superar el umbral de arranque de forma
        // SOSTENIDA (SPEECH_CONFIRM_MS) para confirmarse, así un ruido breve
        // (golpe, click, palabra de fondo) no dispara la captura
        if (!voiceDetectedRef.current) {
          if (rms > speechStartRmsRef.current) {
            if (speechCandidateSinceRef.current === 0) {
              speechCandidateSinceRef.current = now;
            } else if (now - speechCandidateSinceRef.current >= speechConfirmMsRef.current) {
              voiceDetectedRef.current = true;
              speechStartRef.current = speechCandidateSinceRef.current; // contar desde el inicio real
            }
          } else {
            speechCandidateSinceRef.current = 0; // fue un transitorio, descartar
          }
        }

        if (voiceDetectedRef.current) {
          // Fin de frase por silencio sostenido → cortar y procesar
          if (now - lastSpeechRef.current >= SILENCE_HANGOVER_MS) {
            cut();
          // Tope de seguridad de duración → cortar y procesar
          } else if (now - speechStartRef.current >= maxUtteranceMs) {
            cut();
          }
        } else if (now - recordingStartRef.current >= IDLE_RESET_MS) {
          // Silencio prolongado: reiniciar el recorder y descartar el blob vacío
          cut();
        }
      }, LEVEL_SAMPLE_MS);

      // Ciclo de grabación por segmentos completos, cortados por el VAD
      const recordSegment = () => {
        if (stoppingRef.current || !streamRef.current) return;

        const recorder = new MediaRecorder(streamRef.current, { mimeType });
        recorderRef.current = recorder;
        const chunks: Blob[] = [];
        voiceDetectedRef.current = false;
        cuttingRef.current = false;
        speechCandidateSinceRef.current = 0;
        recordingStartRef.current = performance.now();

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };

        recorder.onstop = () => {
          if (stoppingRef.current) return;

          // Solo enviar si hubo voz; los blobs de silencio se descartan sin red
          if (voiceDetectedRef.current && chunks.length > 0) {
            const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
            setStatus('processing');
            onSegmentRef.current(blob)
              .catch((error) => console.error('[Voz] Error enviando segmento:', error))
              .finally(() => {
                if (!stoppingRef.current) setStatus('listening');
              });
          }

          // Encadenar el siguiente segmento sin esperar a la red
          recordSegment();
        };

        recorder.start();
      };

      setStatus('listening');
      recordSegment();
    };

    void startCapture();

    return () => {
      cancelled = true;
      stoppingRef.current = true;

      if (levelTimerRef.current) {
        clearInterval(levelTimerRef.current);
        levelTimerRef.current = null;
      }
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      recorderRef.current = null;
      // Detener los tracks apaga el indicador de micrófono del navegador
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      audioLevelRef.current = 0;
    };
  }, [enabled, maxUtteranceMs]);

  return { status, errorMessage, audioLevel: audioLevelRef };
}
