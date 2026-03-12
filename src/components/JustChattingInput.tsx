import { useState, useCallback } from 'react';
import { IconSearch, IconLoader2, IconAlertCircle, IconCheck, IconMessageCircle } from '@tabler/icons-react';
import type { GeneratePhrasesResponse } from '../utils/types';

const SUGGESTED_TOPICS = [
  'Mi vida',
  'Música',
  'Viajes',
  'Tecnología',
  'Películas y series',
  'Comida',
  'Deporte',
  'Anime',
];

interface JustChattingInputProps {
  selectedTopic: string | null;
  onTopicSelect: (topic: string) => void;
  disabled?: boolean;
}

export default function JustChattingInput({
  selectedTopic,
  onTopicSelect,
  disabled,
}: JustChattingInputProps) {
  const [inputValue, setInputValue] = useState(selectedTopic || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validateInput = (value: string): string | null => {
    const trimmed = value.trim();
    if (trimmed.length < 2) return 'Escribe un tema para el chat';
    if (trimmed.length > 60) return 'El tema es demasiado largo';
    if (/^\d+$/.test(trimmed)) return 'Eso no parece un tema 👀';
    if (/^[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]+$/.test(trimmed)) return 'Eso no parece un tema 👀';
    return null;
  };

  const handleSubmit = useCallback(async (topic?: string) => {
    const topicName = (topic ?? inputValue).trim();
    if (!topicName || disabled) return;

    const formatError = validateInput(topicName);
    if (formatError) {
      setError(formatError);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/generate-phrases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameName: topicName, mode: 'justchatting' }),
      });

      const data: GeneratePhrasesResponse = await response.json();

      if (!response.ok || !data.success) {
        if (data.error === 'INVALID_TOPIC') {
          setError('Eso no parece un tema válido 👀 prueba con algo como "mi vida", "música" o "tecnología"');
        } else if (data.limitReached) {
          setError(`Límite alcanzado (4 temas). Tus temas: ${data.currentGames?.join(', ')}`);
        } else {
          setError(data.error || 'Error generando frases');
        }
        return;
      }

      setSuccess(true);
      if (topic) setInputValue(topic);
      onTopicSelect(data.gameName);

      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError('Error de conexión. Intenta de nuevo.');
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, disabled, onTopicSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between font-jet px-1">
        <label htmlFor="jc-input" className="flex items-center gap-1.5 text-xs">
          Sobre qué quieres charlar?
        </label>
      </div>

      <div className="relative">
        <input
          id="jc-input"
          type="text"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setError(null); }}
          onKeyDown={handleKeyDown}
          disabled={disabled || isLoading}
          placeholder="Puedes escoger un tema..."
          className="w-full bg-bg-secundary dark:bg-black border-[2px] border-black/20 dark:border-bg-secundary/20 pl-6 pr-14 py-3 text-black dark:text-white placeholder-black/40 dark:placeholder-white/10 focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed transition font-mono text-sm rounded-sm"
        />

        <button
          onClick={() => handleSubmit()}
          disabled={disabled || isLoading || !inputValue.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary hover:opacity-80 disabled:bg-black/20 dark:disabled:bg-white/20 disabled:cursor-not-allowed transition-all rounded-xs"
          title="Generar chat para este tema"
          style={{ color: 'var(--color-primary-text)' }}
        >
          {isLoading ? (
            <IconLoader2 size={18} className="animate-spin" />
          ) : success ? (
            <IconCheck size={18} />
          ) : (
            <IconSearch size={18} />
          )}
        </button>
      </div>

      {/* Error message */}
      {error && (
          <div className="flex items-start gap-2 px-3 py-2 bg-terminal dark:bg-black border dark:border-white/20 rounded-xs">
          <IconAlertCircle size={18} className="text-primary flex-shrink-0 mt-0.5" />
          <p className=" text-white/40 font-jet text-xs ">{error}</p>
        </div>
      )}

      {/* Chips de temas sugeridos */}
      <div className="flex flex-wrap gap-2">
        {SUGGESTED_TOPICS.map((topic) => (
          <button
            key={topic}
            onClick={() => {
              setInputValue(topic);
              handleSubmit(topic);
            }}
            disabled={disabled || isLoading}
            className={`flex-1 px-4 py-1.5 text-xs border-[1px] transition-colors font-jet rounded-xs border ${
              selectedTopic === topic.toLowerCase()
                ? 'bg-primary text-bg-primary border-primary'
                  : disabled || isLoading
                    ? 'bg-transparent border-black/50 dark:border-white/20 dark:bg-black text-black/60 dark:text-white/35 cursor-not-allowed'
                    : 'bg-transparent dark:hover:bg-primary/30 border-black/50 dark:border-white/50 dark:bg-black text-black/50 dark:text-white/50 hover:border-primary/60 hover:bg-primary/40 hover:text-black dark:hover:text-white'
            }`}
            style={selectedTopic === topic.toLowerCase() ? { color: 'var(--color-primary-text)' } : undefined}
          >
            {topic}
          </button>
        ))}
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <p className="text-xs flex items-center gap-2 font-mono">
          <IconLoader2 size={14} className="animate-spin" />
          Generando frases con IA para "{inputValue}"...
        </p>
      )}
    </div>
  );
}
