'use client';

import type { InviteMemberRequest } from '@taskflow/api-contract';
import { useState, type FormEvent } from 'react';
import { Avatar } from '@/components/task/task-bits';
import { Button, FormError } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ApiError, errorMessage, fieldErrors } from '@/lib/api/errors';
import { useCurrentWorkspace, useInviteMember, useMembers, useProjects } from '@/lib/api/queries';
import { roleLabel } from '@/lib/format';

type InviteRole = InviteMemberRequest['role'];

const roleHelp: Record<InviteRole, string> = {
  viewer: 'Viewer · can only look, at the projects you pick',
  member: 'Member · can create, edit and move tasks',
  admin: 'Admin · can also manage people and projects',
};

export default function MembersPage() {
  const { data: me, workspace, role, canManage } = useCurrentWorkspace();
  const members = useMembers(workspace?.id);
  const projects = useProjects(workspace?.id);
  const projectName = (id: string) => projects.data?.find((p) => p.id === id)?.name ?? 'Unknown';

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 md:px-8">
      <header className="space-y-1">
        <p className="text-caption text-muted-foreground">{workspace?.name} / Settings</p>
        <h1 className="text-title font-semibold">Members</h1>
      </header>

      {canManage && workspace ? (
        <InviteForm workspaceId={workspace.id} canInviteAdmin={role === 'owner'} />
      ) : (
        <p className="rounded-control bg-accent px-3 py-2 text-caption text-accent-foreground">
          Only owners and admins can invite people.
        </p>
      )}

      <section className="rounded-card border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-section font-semibold">
          Members{members.data ? ` · ${members.data.members.length}` : ''}
        </h2>
        {members.isPending ? (
          <p className="p-4 text-muted-foreground">Loading members…</p>
        ) : members.isError ? (
          <p role="alert" className="p-4 text-status-overdue-text">
            {errorMessage(members.error)}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {members.data.members.map((m) => (
              <li key={m.user.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={m.user.name} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {m.user.name}
                    {m.user.id === me?.user.id && (
                      <span className="text-muted-foreground"> (you)</span>
                    )}
                  </span>
                  {m.projectIds && (
                    <span className="text-caption text-muted-foreground">
                      Can see: {m.projectIds.map(projectName).join(', ')}
                    </span>
                  )}
                </span>
                <span className="rounded-pill bg-muted px-3 py-1 text-caption">
                  {roleLabel[m.role]}
                </span>
              </li>
            ))}
            {members.data.invitations.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span
                  aria-hidden
                  className="inline-flex size-8 items-center justify-center rounded-pill border border-dashed border-input text-caption"
                >
                  @
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{inv.email}</span>
                  <span className="text-caption text-muted-foreground">
                    Pending invite · expires{' '}
                    {new Date(inv.expiresAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                    {inv.projectIds && ` · ${inv.projectIds.map(projectName).join(', ')}`}
                  </span>
                </span>
                <span className="rounded-pill border border-input px-3 py-1 text-caption">
                  {roleLabel[inv.role]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function InviteForm({
  workspaceId,
  canInviteAdmin,
}: {
  workspaceId: string;
  canInviteAdmin: boolean;
}) {
  const invite = useInviteMember(workspaceId);
  const projects = useProjects(workspaceId);
  const [role, setRole] = useState<InviteRole>('member');
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get('email')).trim();
    setSentTo(null);
    invite.mutate(
      // projectIds only for viewers — the API rejects them for other roles (422).
      role === 'viewer' ? { email, role, projectIds } : { email, role },
      {
        onSuccess: () => {
          setSentTo(email);
          form.reset();
          setProjectIds([]);
        },
      },
    );
  }

  const fields = fieldErrors(invite.error);
  const duplicate = invite.error instanceof ApiError && invite.error.status === 409;
  const formError =
    invite.isError && !duplicate && Object.keys(fields).length === 0
      ? errorMessage(invite.error)
      : null;
  const roles: InviteRole[] = canInviteAdmin ? ['viewer', 'member', 'admin'] : ['viewer', 'member'];

  return (
    <section className="space-y-4 rounded-card border border-border bg-card p-4 md:p-6">
      <h2 className="text-section font-semibold">Invite people</h2>
      <form onSubmit={onSubmit} className="space-y-4">
        <FormError message={formError} />
        {sentTo && (
          <p
            role="status"
            className="rounded-control bg-accent px-3 py-2 text-caption text-accent-foreground"
          >
            Invite sent to {sentTo}.
          </p>
        )}
        <Field
          label="Email address"
          name="email"
          type="email"
          required
          error={duplicate ? 'Already a member or already invited.' : fields.email}
        />

        <fieldset className="space-y-2">
          <legend className="text-caption font-semibold">Role</legend>
          {roles.map((r) => (
            <label key={r} className="flex min-h-touch items-center gap-2">
              <input
                type="radio"
                name="role"
                value={r}
                checked={role === r}
                onChange={() => setRole(r)}
              />
              {roleHelp[r]}
            </label>
          ))}
        </fieldset>

        {role === 'viewer' && (
          <fieldset className="space-y-2">
            <legend className="text-caption font-semibold">
              Viewers can see only these projects
            </legend>
            {projects.data?.map((p) => (
              <label key={p.id} className="flex min-h-touch items-center gap-2">
                <input
                  type="checkbox"
                  checked={projectIds.includes(p.id)}
                  onChange={(e) =>
                    setProjectIds((ids) =>
                      e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id),
                    )
                  }
                />
                {p.name}
              </label>
            ))}
            {fields.projectIds && (
              <p className="text-caption text-status-overdue-text">{fields.projectIds}</p>
            )}
          </fieldset>
        )}

        <Button type="submit" pending={invite.isPending} pendingLabel="Sending…">
          Send invite
        </Button>
        <p className="text-caption text-muted-foreground">Invites expire after 7 days.</p>
      </form>
    </section>
  );
}
