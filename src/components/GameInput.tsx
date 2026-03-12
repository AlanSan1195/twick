import { useState, useCallback } from 'react';
import { IconSearch, IconLoader2, IconAlertCircle, IconCheck } from '@tabler/icons-react';
import type { GeneratePhrasesResponse } from '../utils/types';

interface GameInputProps {
  selectedGame: string | null;
  onGameSelect: (gameName: string) => void;
  disabled?: boolean;
  userGames?: string[];
  remainingSlots?: number;
}

export default function GameInput({ 
  selectedGame, 
  onGameSelect, 
  disabled,
  userGames = [],
  remainingSlots = 4
}: GameInputProps) {
  const [inputValue, setInputValue] = useState(selectedGame || '');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const validateInput = (value: string): string | null => {
    const trimmed = value.trim();
    if (trimmed.length < 2) return 'El nombre del juego debe tener al menos 2 caracteres';
    if (trimmed.length > 50) return 'Eso no parece un nombre de juego, es muy largo';
    if (/^\d+$/.test(trimmed)) return 'Eso no parece un juego';
    if (/^[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ]+$/.test(trimmed)) return 'Eso no parece un juego';
    return null;
  };

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    const gameName = inputValue.trim();
    if (!gameName || disabled) return;

    const formatError = validateInput(gameName);
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
        body: JSON.stringify({ gameName })
      });

      const data: GeneratePhrasesResponse = await response.json();

      if (!response.ok || !data.success) {
        if (data.error === 'INVALID_GAME') {
          setError('Eso no parece un juego prueba con uno que si exista');
        } else if (data.limitReached) {
          setError(`Límite alcanzado (4 juegos). Tus juegos: ${data.currentGames?.join(', ')}`);
        } else {
          setError(data.error || 'Error generando frases');
        }
        return;
      }

      setSuccess(true);
      onGameSelect(data.gameName);
      
      // Limpiar éxito después de 2 segundos
      setTimeout(() => setSuccess(false), 2000);

    } catch (err) {
      setError('Error de conexion. Intenta de nuevo.');
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, disabled, onGameSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="space-y-2  ">
      <div className="flex items-center justify-between font-jet px-1">
        <label htmlFor="game-input" className="block text-xs  ">
          A que jugaras hoy ?
        </label>
          <span className="text-xs text-black dark:text-white">
          {remainingSlots} juego{remainingSlots !== 1 ? 's' : ''} disponible{remainingSlots !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="relative">
        <input
          id="game-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isLoading}
          placeholder="Ej: Elden Ring, Silkson, Minecraft, Valorant..."
          className="w-full bg-bg-secundary dark:bg-black border-[2px] border-black/20 dark:border-bg-secundary/20 pl-6 pr-14 py-3 text-black dark:text-white placeholder-black/40 dark:placeholder-white/20 focus:outline-none  focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed transition font-mono text-sm rounded-sm "
        />
        
        <button
          onClick={() => handleSubmit()}
          disabled={disabled || isLoading || !inputValue.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary hover:opacity-80 disabled:bg-black/20 dark:disabled:bg-white/20 disabled:cursor-not-allowed transition-all rounded-xs "
          title="Generar chat para este juego"
          style={{ color: 'var(--color-primary-text)' }}
        >
          {isLoading ? (
            <IconLoader2 size={18} className="animate-spin " />
          ) : success ? (
            <IconCheck size={18} />
          ) : (
            <IconSearch size={18} />
          )}
        </button>
      </div>

      {/* Error message */}
      {error && (
          <div className="flex items-start gap-2 py-1 px-2 border rounded-sm border-black/15 dark:border-white/10 bg-terminal dark:bg-black transition-colors  ">
          <IconAlertCircle size={18} className="text-primary flex-shrink-0 mt-0.5" />
          <p className="text-white text-xs font-jet leading-relaxed">{error}</p>
        </div>
      )}

      {/* Tags*/}
      {userGames.length > 0 && (
        <div className="flex flex-wrap gap-2  ">
          {userGames.map((game) => (
            <button
              key={game}
              onClick={() => {
                setInputValue(game);
                onGameSelect(game);
              }}
              disabled={disabled}
              className={`flex-1 px-4 py-1.5 text-xs border-[1px] transition-colors font-jet rounded-xs border ${
                selectedGame === game
                  ? 'bg-primary text-bg-primary border-primary'
                  : disabled
                    ? 'bg-transparent border-black/50 dark:border-white/20 dark:bg-black text-black/60 dark:text-white/35 cursor-not-allowed'
                    : 'bg-transparent dark:hover:bg-primary/30 border-black/50 dark:border-white/50 dark:bg-black text-black/50 dark:text-white/50 hover:border-primary/60 hover:bg-primary/40 hover:text-black dark:hover:text-white'
              }`}
              style={selectedGame === game ? { color: 'var(--color-primary-text)' } : undefined}
            >
              {game}
            </button>
          ))}
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <p className="text-xs  flex items-center gap-2 font-mono">
          <IconLoader2 size={14} className="animate-spin" />
          Generando frases con IA para "{inputValue}"...
        </p>
      )}
    </div>
  );
}
