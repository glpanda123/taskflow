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
  InviteMemberRequest,
  MoveTaskRequest,
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

// ── Writes ─────────────────────────────────────────────────────────────────

/** A task write changes the project's lists and the Today overview counts. */
function invalidateTaskViews(qc: QueryClient, projectId: string) {
  void qc.invalidateQueries({ queryKey: qk.allTasksOf(projectId) });
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
    onSettled: () => invalidateTaskViews(qc, projectId),
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
