/**
 * The shape Claude must answer in (structured output). Shape only: the API rejects
 * minLength / maxLength / maxItems here, so the contract's limits are checked
 * afterwards with Ajv against TaskDraft.
 */
export const draftsSchema = {
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
            description:
              'YYYY-MM-DD. Relative dates resolved against today; null only when the brief gives no timing for this task',
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
