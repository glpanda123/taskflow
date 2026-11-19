/**
 * The seam between TaskFlow and the AI provider. The service asks for drafts; how
 * they are produced (Claude, or a stand-in in tests) is behind this class.
 *
 * Nest can use an abstract class as an injection token: provide it with
 * `{ provide: TaskDrafter, useClass: ClaudeTaskDrafter }`, and the tests replace
 * `draft()` on the instance they get back from `app.get(TaskDrafter)`.
 */
export type DraftInput = {
  /** The brief exactly as the user wrote it. */
  brief: string;
  /** Today's date (YYYY-MM-DD, UTC), so "next Friday" can become a real date. */
  today: string;
};

export abstract class TaskDrafter {
  /**
   * Raw drafts as the provider returned them. Untrusted: the caller validates every
   * item against the contract's TaskDraft before anything leaves the API.
   * Throws when the provider fails or does not answer in time.
   */
  abstract draft(input: DraftInput): Promise<unknown[]>;
}
