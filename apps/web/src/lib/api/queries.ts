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
  TaskStatus,
  UpdateTaskRequest,
} from '@taskflow/api-contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.allTasksOf(projectId) }),
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
    onSettled: () => qc.invalidateQueries({ queryKey: qk.allTasksOf(projectId) }),
  });
}
