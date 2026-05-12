import Groq from 'groq-sdk';
import type { AIService, AIServiceMessage } from '../types';

let groqInstance: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqInstance) {
    const apiKey = import.meta.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error('GROQ_API_KEY no está configurada en las variables de entorno');
    }
    groqInstance = new Groq({ apiKey });
  }
  return groqInstance;
}

export const groqService: AIService = {
  name: 'Groq',
  async chat(messages: AIServiceMessage[]) {
    const groq = getGroqClient();
    
    const chatCompletion = await groq.chat.completions.create({
      messages,
      model: 'openai/gpt-oss-120b',
      temperature: 0.7,
      max_tokens: 6000,
      stream: true,
    });

    async function* generateStream() {
      for await (const chunk of chatCompletion) {
        yield chunk.choices[0]?.delta?.content || '';
      }
    }

    return generateStream();
  }
};
