import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { draftSystemPrompt } from './draft-prompt';
import { draftsSchema } from './draft-schema';
import { type DraftInput, TaskDrafter } from './task-drafter';

/** Drafts tasks with Claude (structured output). Every failure is thrown; the controller turns it into a 503. */
@Injectable()
export class ClaudeTaskDrafter extends TaskDrafter {
  // Built only when a key is configured: without one the API must still start
  // (tests, a server that has no key yet) and drafting answers 503.
  private readonly client = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        timeout: 20_000, // per attempt (ADR: drafting waits at most ~20 s)
        maxRetries: 1, // the SDK retries 429, 5xx and network errors once, with backoff
      })
    : null;

  private readonly model = process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5';

  /** The request as sent: the eval records it next to the answer. */
  buildRequest({ brief, today }: DraftInput) {
    return {
      model: this.model,
      max_tokens: 16000,
      system: draftSystemPrompt(today),
      // The brief is data, not instructions: it stays inside its own tags.
      messages: [{ role: 'user' as const, content: `<brief>\n${brief}\n</brief>` }],
      output_config: {
        effort: 'high' as const,
        format: { type: 'json_schema' as const, schema: draftsSchema },
      },
    };
  }

  /** One call to Claude, answer returned whole (model, usage, stop reason) for the eval. */
  async request(input: DraftInput): Promise<Anthropic.Message> {
    if (!this.client) throw new Error('ANTHROPIC_API_KEY is not set');
    return this.client.messages.create(this.buildRequest(input));
  }

  async draft(input: DraftInput): Promise<unknown[]> {
    return ClaudeTaskDrafter.parseDrafts(await this.request(input));
  }

  /** The drafts in an answer, or an error saying why there are none. */
  static parseDrafts(response: Anthropic.Message): unknown[] {
    // max_tokens: the JSON was cut off. refusal: no drafts at all.
    if (response.stop_reason !== 'end_turn') {
      throw new Error(`Drafting stopped early: ${response.stop_reason}`);
    }
    // The answer is a list of blocks (thinking, text…); the JSON is in the text block.
    const text = response.content.find((block) => block.type === 'text');
    if (!text) throw new Error('Drafting returned no text');

    const parsed = JSON.parse(text.text) as { drafts?: unknown };
    if (!Array.isArray(parsed.drafts)) throw new Error('Drafting returned no drafts array');
    return parsed.drafts as unknown[];
  }
}
