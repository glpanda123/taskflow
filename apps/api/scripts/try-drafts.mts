import Anthropic from '@anthropic-ai/sdk';
import { draftSystemPrompt } from '../src/ai/draft-prompt.ts';
import { draftsSchema } from '../src/ai/draft-schema.ts';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const response = await client.messages.create({
  model: process.env.ANTHROPIC_MODEL!,
  max_tokens: 16000,
  messages: [
    {
      role: 'user',
      content: `Client Acme wants the new landing page live next Friday. We need a hero banner with the new product photo,
a pricing table with 3 plans (urgent, sales is waiting for it), and the footer links updated.
Someone should also check the mobile layout before launch.`,
    },
  ],
  output_config: {
    effort: 'high',
    format: {
      type: 'json_schema',
      schema: draftsSchema,
    },
  },
  system: draftSystemPrompt(new Date().toISOString().slice(0, 10)),
});

console.log(response.content.filter((t) => t.type === 'text'));
console.log(response.stop_reason);
console.log(response.usage);
