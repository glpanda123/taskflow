/**
 * TanStack Query hooks for the TaskFlow API. Screens use these, never `fetch` directly.
 *
 * - Query keys come from one factory (`qk`), so invalidation can't drift from the keys used to read.
 * - Mutations invalidate exactly the queries whose data they change.
 */

import type {
  CreateProjectRequest,
  CreateTaskRequest,
  CreateWorkspaceRequest,
  DraftTasksRequest,
  InviteMemberRequest,
  MoveTaskRequest,
  Task,
  TaskPage,
  TaskStatus,
  UpdateTaskRequest,
} from '@taskflow/api-contract';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from './client';
import { unwrap } from './errors';

export const qk = {
  me: ['me'] as const,
  projects: (workspaceId: string) => ['workspaces', workspaceId, 'projects'] as const,
  today: (workspaceId: string) => ['workspaces', workspaceId, 'today'] as const,
  members: (workspaceId: string) => ['workspaces', workspaceId, 'members'] as const,
  tasks: (projectId: string, status?: TaskStatus[]) =>
    ['projects', projectId, 'tasks', { status: status ?? 'all' }] as const,
  allTasksOf: (projectId: string) => ['projects', projectId, 'tasks'] as const,
  activity: (projectId: string) => ['projects', projectId, 'activity'] as const,
};

// ── Reads ──────────────────────────────────────────────────────────────────

/** Shared so non-hook code (e.g. after login) can `queryClient.fetchQuery(meQuery)`. */
export const meQuery = { queryKey: qk.me, queryFn: () => unwrap(api.GET('/me')) };

export function useMe(enabled = true) {
  return useQuery({ ...meQuery, enabled });
}

/**
 * The workspace the user is working in, with their role in it.
 * v1 has one workspace per user in practice; a switcher comes later.
 */
export function useCurrentWorkspace() {
  const me = useMe();
  const membership = me.data?.workspaces[0];
  return {
    ...me,
    workspace: membership,
    role: membership?.role,
    canEditTasks: membership !== undefined && membership.role !== 'viewer',
    canManage: membership?.role === 'owner' || membership?.role === 'admin',
  };
}

export function useMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: qk.members(workspaceId ?? ''),
    queryFn: () =>
      unwrap(
        api.GET('/workspaces/{workspaceId}/members', {
          params: { path: { workspaceId: workspaceId! } },
        }),
      ),
    enabled: !!workspaceId,
  });
}

export function useProjects(workspaceId: string | undefined) {
  return useQuery({
    queryKey: qk.projects(workspaceId ?? ''),
    queryFn: () =>
      unwrap(
        api.GET('/workspaces/{workspaceId}/projects', {
          params: { path: { workspaceId: workspaceId! } },
        }),
      ),
    enabled: !!workspaceId,
    select: (page) => page.items,
  });
}

export function useToday(workspaceId: string | undefined) {
  return useQuery({
    queryKey: qk.today(workspaceId ?? ''),
    queryFn: () =>
      unwrap(
        api.GET('/workspaces/{workspaceId}/today', {
          params: { path: { workspaceId: workspaceId! } },
        }),
      ),
    enabled: !!workspaceId,
  });
}

/** First page only for now; switch to useInfiniteQuery + nextCursor when lists get long. */
export function useTasks(projectId: string | undefined, status?: TaskStatus[]) {
  return useQuery({
    queryKey: qk.tasks(projectId ?? '', status),
    queryFn: () =>
      unwrap(
        api.GET('/projects/{projectId}/tasks', {
          params: {
            path: { projectId: projectId! },
            query: { limit: 100, ...(status ? { status } : {}) },
          },
        }),
      ),
    enabled: !!projectId,
    select: (page) => page.items,
  });
}

/** Newest first; first page is enough for the prototype. */
export function useActivity(projectId: string) {
  return useQuery({
    queryKey: qk.activity(projectId),
    queryFn: () =>
      unwrap(
        api.GET('/projects/{projectId}/activity', {
          params: { path: { projectId }, query: { limit: 100 } },
        }),
      ),
    select: (page) => page.items,
  });
}

// ── Writes ─────────────────────────────────────────────────────────────────

/** A task write changes the project's lists and the Today overview counts. */
function invalidateTaskViews(qc: QueryClient, projectId: string) {
  void qc.invalidateQueries({ queryKey: qk.allTasksOf(projectId) });
  void qc.invalidateQueries({ queryKey: qk.activity(projectId) });
  void qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] === 'workspaces' && q.queryKey[2] === 'today',
  });
}

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done'];

/** Same order the API returns: status column, then fractional position. */
export function byBoardOrder(a: Task, b: Task): number {
  const s = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  if (s !== 0) return s;
  return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
}

/**
 * Put a task straight into the cached lists (a realtime push, a move's response, or an
 * optimistic move) instead of refetching, so the board updates without a flicker.
 * Today's counts are cheap to refetch.
 */
export function putTaskInCache(qc: QueryClient, task: Task) {
  qc.setQueriesData<TaskPage>({ queryKey: qk.allTasksOf(task.projectId) }, (page) => {
    if (!page) return page;
    const items = page.items.some((t) => t.id === task.id)
      ? page.items.map((t) => (t.id === task.id ? task : t))
      : [...page.items, task];
    return { ...page, items: items.sort(byBoardOrder) };
  });
  void qc.invalidateQueries({ queryKey: qk.activity(task.projectId) });
  void qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] === 'workspaces' && q.queryKey[2] === 'today',
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWorkspaceRequest) => unwrap(api.POST('/workspaces', { body })),
    // `me.workspaces` changed → refetch it so guards and the workspace switcher see the new one.
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}

export function useCreateProject(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProjectRequest) =>
      unwrap(
        api.POST('/workspaces/{workspaceId}/projects', { params: { path: { workspaceId } }, body }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projects(workspaceId) }),
  });
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskRequest) =>
      unwrap(api.POST('/projects/{projectId}/tasks', { params: { path: { projectId } }, body })),
    onSuccess: () => invalidateTaskViews(qc, projectId),
  });
}

/**
 * PATCH a task. On 409 the error carries the server's current task (see `conflictTask`);
 * the caller decides what to show. We never retry a 409 automatically.
 */
export function useUpdateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, ...body }: UpdateTaskRequest & { taskId: string }) =>
      unwrap(api.PATCH('/tasks/{taskId}', { params: { path: { taskId } }, body })),
    onSettled: () => invalidateTaskViews(qc, projectId),
  });
}

/** Move to a status (bottom of the column, or between afterId/beforeId). 409 like PATCH. */
export function useMoveTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, ...body }: MoveTaskRequest & { taskId: string }) =>
      unwrap(api.POST('/tasks/{taskId}/move', { params: { path: { taskId } }, body })),
    // The response has the new version: cache it at once so a quick second drag isn't a 409.
    onSuccess: (task) => putTaskInCache(qc, task),
    onSettled: () => invalidateTaskViews(qc, projectId),
  });
}

/** AI drafts for a brief. Nothing is saved; the caller creates the tasks the user keeps. */
export function useDraftTasks(projectId: string) {
  return useMutation({
    mutationFn: (body: DraftTasksRequest) =>
      unwrap(
        api.POST('/projects/{projectId}/task-drafts', { params: { path: { projectId } }, body }),
      ),
  });
}

export function useInviteMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InviteMemberRequest) =>
      unwrap(
        api.POST('/workspaces/{workspaceId}/invitations', {
          params: { path: { workspaceId } },
          body,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.members(workspaceId) }),
  });
}
