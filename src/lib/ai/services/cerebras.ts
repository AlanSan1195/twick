import Cerebras from '@cerebras/cerebras_cloud_sdk';
import type { AIService, AIServiceMessage } from '../types';

let cerebrasInstance: Cerebras | null = null;

function getCerebrasClient(): Cerebras {
  if (!cerebrasInstance) {
    const apiKey = import.meta.env.CEREBRAS_API_KEY;
    if (!apiKey) {
      throw new Error('CEREBRAS_API_KEY no está configurada en las variables de entorno');
    }
    cerebrasInstance = new Cerebras({ apiKey });
  }
  return cerebrasInstance;
}

export const cerebrasService: AIService = {
  name: 'Cerebras',
  async chat(messages: AIServiceMessage[]) {
    const cerebras = getCerebrasClient();
    
    const stream = await cerebras.chat.completions.create({
      messages: messages as Parameters<typeof cerebras.chat.completions.create>[0]['messages'],
      model: 'gpt-oss-120b',
      stream: true,
      max_completion_tokens: 6000,
      temperature: 0.7,
      top_p: 0.95
    });

    async function* generateStream() {
      for await (const chunk of stream) {
        const typedChunk = chunk as { choices: Array<{ delta?: { content?: string } }> };
        yield typedChunk.choices[0]?.delta?.content || '';
      }
    }

    return generateStream();
  }
};
