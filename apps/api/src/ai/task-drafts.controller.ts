import { Body, Controller, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type {
  DraftTasksRequest,
  DraftTasksResponse,
  TaskDraft,
} from '@taskflow/api-contract/schema';
import { AccessService } from '../access/access.service';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard';
import { assertBody, matchesSchema } from '../common/contract';
import { draftingUnavailable } from '../common/problem';
import { TaskDrafter } from './task-drafter';

const MAX_DRAFTS = 20;

/** A draft we can hand to the client: the contract's TaskDraft, and a title that isn't blank. */
function isUsableDraft(item: unknown): item is TaskDraft {
  return matchesSchema('TaskDraft', item) && (item as TaskDraft).title.trim() !== '';
}

@Controller('projects/:projectId/task-drafts')
@UseGuards(AuthGuard)
export class TaskDraftsController {
  constructor(
    private readonly access: AccessService,
    private readonly drafter: TaskDrafter,
  ) {}

  /** Turns a brief into task drafts. Nothing is saved: the client creates the ones the user keeps. */
  @Post()
  @HttpCode(200)
  async draft(
    @Req() req: AuthedRequest,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
  ): Promise<DraftTasksResponse> {
    // Every check that can refuse runs before the paid call.
    await this.access.requireProject(req.userId, projectId, 'task:create');
    const { text } = assertBody<DraftTasksRequest>('DraftTasksRequest', body);
    const today = new Date().toISOString().slice(0, 10);

    let raw: unknown[];
    try {
      raw = await this.drafter.draft({ brief: text, today });
    } catch (error) {
      // Log why (never the brief: it is the client's text), answer a plain 503.
      console.error('Task drafting failed:', error instanceof Error ? error.message : error);
      throw draftingUnavailable();
    }

    // The model's output is untrusted: keep what matches the contract, at most 20.
    return { drafts: raw.filter(isUsableDraft).slice(0, MAX_DRAFTS) };
  }
}
