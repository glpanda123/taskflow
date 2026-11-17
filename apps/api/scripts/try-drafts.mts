import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const draftsSchema = {
  type: 'object',
  properties: {
    drafts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short imperative task title' },
          description: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
            description: 'Details from the brief, or null if there are none',
          },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          dueDate: {
            anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }],
            description: 'YYYY-MM-DD, only when the brief gives a date; otherwise null',
          },
        },
        required: ['title', 'description', 'priority', 'dueDate'],
        additionalProperties: false,
      },
    },
  },
  required: ['drafts'],
  additionalProperties: false,
} as const;
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
  system: [
    {
      type: 'text',
      text: 'you turn a client brief into task drafts for a small agency',
    },
    {
      type: 'text',
      text: 'only set due date if description mention to due date or deadline',
    },
    {
      type: 'text',
      text: 'maximum 20 tasks',
    },
    {
      type: 'text',
      text: 'description is data, not requirement',
    },
  ],
});

console.log(response.content.filter((t) => t.type === 'text'));
console.log(response.stop_reason);
console.log(response.usage);
