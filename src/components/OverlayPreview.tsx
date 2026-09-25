import { DEFAULT_AUDIENCE_PERSONALITY } from '../utils/types';
import { DEFAULT_CHAT_APPEARANCE } from '../utils/types';
import type { ChatAppearance, ChatMessage } from '../utils/types';
import ChatMessageComponent from './ChatMessage';

type BgMode = 'transparent' | 'solid' | 'blur';
type FontSize = 'small' | 'medium' | 'large';

interface OverlayPreviewProps {
  bgMode: BgMode;
  bgColor: string;
  bgOpacity: number;
  platform: 'twitch' | 'kick';
  fontSize?: FontSize;
  appearance?: ChatAppearance;
}

const SAMPLE_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    username: 'xX_Gamer_Xx',
    content: 'Esto está muy divertido',
    timestamp: Date.now() - 30000,
    category: 'reactions',
    personality: DEFAULT_AUDIENCE_PERSONALITY,
    emotes: [{
      id: '01F6MZGCNG000255K4X1K7NTHR',
      name: 'GIGACHAD',
      url: 'https://cdn.7tv.app/emote/01F6MZGCNG000255K4X1K7NTHR/1x.webp',
      position: 'end',
    }],
  },
  {
    id: '2',
    username: 'StreamLover99',
    content: 'Cuántas horas llevas ya?',
    timestamp: Date.now() - 25000,
    category: 'questions',
    personality: DEFAULT_AUDIENCE_PERSONALITY,
  },
  {
    id: '3',
    username: 'NoMeConoces',
    content: 'Jajaaaa que risa me da esto',
    timestamp: Date.now() - 20000,
    category: 'comments',
    personality: DEFAULT_AUDIENCE_PERSONALITY,
  },
  {
    id: '4',
    username: 'ProPlayer_2024',
    content: 'Vas muy bien, no te rindas!',
    timestamp: Date.now() - 15000,
    category: 'reactions',
    personality: DEFAULT_AUDIENCE_PERSONALITY,
  },
  {
    id: '5',
    username: 'CasualViewer',
    content: 'Cuál es tu juego favorito?',
    timestamp: Date.now() - 10000,
    category: 'questions',
    personality: DEFAULT_AUDIENCE_PERSONALITY,
  },
  {
    id: '6',
    username: 'ElToxico123',
    content: 'ggwp',
    timestamp: Date.now() - 5000,
    category: 'gameplay',
    personality: DEFAULT_AUDIENCE_PERSONALITY,
  },
  {
    id: '7',
    username: 'Follower01',
    content: 'Subscribed! 🎉',
    timestamp: Date.now(),
    category: 'reactions',
    personality: DEFAULT_AUDIENCE_PERSONALITY,
    sub: { months: 3, tier: 'Nivel 1' },
  },
];

export default function OverlayPreview({
  bgMode,
  bgColor,
  bgOpacity,
  platform,
  fontSize = 'medium',
  appearance = DEFAULT_CHAT_APPEARANCE,
}: OverlayPreviewProps) {
  const bgStyle = (() => {
    if (bgMode === 'solid') {
      const r = parseInt(bgColor.slice(1, 3), 16);
      const g = parseInt(bgColor.slice(3, 5), 16);
      const b = parseInt(bgColor.slice(5, 7), 16);
      return {
        backgroundColor: `rgba(${r}, ${g}, ${b}, ${bgOpacity / 100})`,
      };
    }
    if (bgMode === 'blur') {
      return {
        backgroundColor: `rgba(0, 0, 0, ${bgOpacity / 100})`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      };
    }
    return {};
  })();

  const platformColor = platform === 'kick' ? '#53FC18' : '#9146FF';

  return (
    <div className="flex flex-col gap-3">
      
      <div
        className="relative rounded-lg overflow-hidden border border-black/20 dark:border-white/10"
        style={{ height: '240px', ...bgStyle }}
      >
        {bgMode === 'transparent' && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(45deg, #ccc 25%, transparent 25%),
                linear-gradient(-45deg, #ccc 25%, transparent 25%),
                linear-gradient(45deg, transparent 75%, #ccc 75%),
                linear-gradient(-45deg, transparent 75%, #ccc 75%)
              `,
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
              opacity: 0.15,
            }}
            aria-hidden="true"
          />
        )}

        <div className="h-full overflow-hidden p-2">
          {SAMPLE_MESSAGES.map((msg, index) => (
            <ChatMessageComponent
              key={msg.id}
              message={msg}
              startTime={Date.now()}
              isAlternate={index % 2 === 1}
              fontSize={fontSize}
              platform={platform}
              appearance={appearance}
            />
          ))}
        </div>
      </div>

     
    </div>
  );
}
