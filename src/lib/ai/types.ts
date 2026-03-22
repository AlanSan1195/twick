export interface AIServiceMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIService {
  name: string;
  chat: (messages: AIServiceMessage[]) => Promise<AsyncGenerator<string>>;
}