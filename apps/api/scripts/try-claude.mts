import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const response = await client.messages.create({
  model: process.env.ANTHROPIC_MODEL!,
  max_tokens: 16000,
  messages: [
    {
      role: 'user',
      content: 'In one sentence, what is a kanban board?',
    },
  ],
  output_config: {
    effort: 'high',
  },
});

console.log(response.content.filter((t) => t.type === 'text'));
console.log(response.stop_reason);
console.log(response.usage);
