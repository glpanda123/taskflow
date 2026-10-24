'use client';

/**
 * "Draft with AI": paste a brief → review drafts → add the ones you keep.
 * Nothing is saved until the user clicks Add; every draft is editable first.
 * Native <dialog> + showModal(): focus is trapped and Escape closes it.
 */
import { priorityValues, type Priority, type TaskDraft } from '@taskflow/api-contract';
import { RotateCcw, Sparkles, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, FormError } from '@/components/ui/button';
import { errorMessage, fieldErrors } from '@/lib/api/errors';
import { useCreateTask, useDraftTasks } from '@/lib/api/queries';
import { priorityLabel } from '@/lib/format';

const SAMPLE_BRIEF = `We're launching the Acme spring campaign landing page next Friday. It needs a hero section with the new product shots, a pricing table and a signup form connected to Mailchimp. The client should review the copy by Wednesday. Also set up analytics events for signups, and make sure the page works on mobile. The client wants a quick demo call before launch.`;

type Row = TaskDraft & { keep: boolean };

export function AiDraftButton({
  projectId,
  onAdded,
}: {
  projectId: string;
  onAdded: (count: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const draft = useDraftTasks(projectId);
  const create = useCreateTask(projectId);

  const reset = () => {
    setRows(null);
    setSaveError(null);
    draft.reset();
  };
  const close = () => dialog.current?.close();

  function generate() {
    setSaveError(null);
    draft.mutate(
      { text },
      { onSuccess: (res) => setRows(res.drafts.map((d) => ({ ...d, keep: true }))) },
    );
  }

  async function addKept() {
    if (!rows) return;
    const kept = rows.filter((r) => r.keep && r.title.trim());
    setSaving(true);
    setSaveError(null);
    try {
      // One request per task keeps the API simple; a bulk endpoint is a Stage 3 question.
      for (const r of kept) {
        await create.mutateAsync({
          title: r.title.trim(),
          description: r.description,
          priority: r.priority,
          dueDate: r.dueDate,
        });
      }
      onAdded(kept.length);
      close();
      setText('');
      reset();
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const update = (i: number, patch: Partial<Row>) =>
    setRows((list) => list?.map((r, j) => (j === i ? { ...r, ...patch } : r)) ?? null);
  const keptCount = rows?.filter((r) => r.keep).length ?? 0;
  const textError = fieldErrors(draft.error).text;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="gap-2"
        onClick={() => dialog.current?.showModal()}
      >
        <Sparkles aria-hidden className="size-4 text-violet-600" />
        Draft with AI
      </Button>

      <dialog
        ref={dialog}
        aria-labelledby="ai-draft-title"
        className="m-auto w-[min(720px,calc(100vw-2rem))] rounded-card border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-foreground/30 backdrop:backdrop-blur-[2px]"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2
                id="ai-draft-title"
                className="flex items-center gap-2 text-section font-semibold"
              >
                <Sparkles aria-hidden className="size-5 text-violet-600" />
                Draft tasks from a brief
              </h2>
              <p className="text-caption text-muted-foreground">
                Paste what the client sent. You review every task before anything is saved.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="-m-1 inline-flex size-touch shrink-0 items-center justify-center rounded-control hover:bg-muted"
            >
              <X aria-hidden className="size-5" />
            </button>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {rows === null ? (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="ai-brief" className="text-caption font-semibold">
                      Brief
                    </label>
                    <button
                      type="button"
                      onClick={() => setText(SAMPLE_BRIEF)}
                      className="text-caption font-medium text-primary hover:underline"
                    >
                      Use a sample brief
                    </button>
                  </div>
                  <textarea
                    id="ai-brief"
                    rows={8}
                    maxLength={4000}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    aria-invalid={textError ? true : undefined}
                    aria-describedby="ai-brief-hint"
                    placeholder="We're launching the landing page next Friday. It needs…"
                    className="block w-full rounded-control border border-input px-3 py-2"
                  />
                  <p
                    id="ai-brief-hint"
                    className={`text-caption ${textError ? 'text-status-overdue-text' : 'text-muted-foreground'}`}
                  >
                    {textError ?? `${text.length} / 4,000 characters`}
                  </p>
                </div>
                {draft.isPending && <Thinking />}
                <FormError
                  message={draft.isError && !textError ? errorMessage(draft.error) : null}
                />
              </>
            ) : rows.length === 0 ? (
              <p className="text-muted-foreground">
                No tasks found in that text. Try adding a sentence per piece of work.
              </p>
            ) : (
              <>
                <p className="text-caption text-muted-foreground">
                  {rows.length} drafts. Untick the ones you don&apos;t want, edit the rest.
                </p>
                <ul className="space-y-2">
                  {rows.map((r, i) => (
                    <li
                      key={i}
                      style={{ animationDelay: `${Math.min(i, 10) * 60}ms` }}
                      className={`grid animate-fade-up gap-2 rounded-control border p-3 sm:grid-cols-[auto_1fr_120px_150px] sm:items-center ${r.keep ? 'border-border bg-card' : 'border-dashed border-input bg-muted opacity-60'}`}
                    >
                      <input
                        type="checkbox"
                        aria-label={`Keep "${r.title}"`}
                        checked={r.keep}
                        onChange={(e) => update(i, { keep: e.target.checked })}
                        className="size-4"
                      />
                      <input
                        aria-label="Title"
                        value={r.title}
                        maxLength={200}
                        onChange={(e) => update(i, { title: e.target.value })}
                        className="min-h-10 min-w-0 rounded-control border border-input px-2 font-medium"
                      />
                      <select
                        aria-label="Priority"
                        value={r.priority}
                        onChange={(e) => update(i, { priority: e.target.value as Priority })}
                        className="min-h-10 rounded-control border border-input bg-card px-2"
                      >
                        {priorityValues.map((p) => (
                          <option key={p} value={p}>
                            {priorityLabel[p]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        aria-label="Due date"
                        value={r.dueDate ?? ''}
                        onChange={(e) => update(i, { dueDate: e.target.value || null })}
                        className="min-h-10 rounded-control border border-input bg-card px-2"
                      />
                    </li>
                  ))}
                </ul>
                <FormError message={saveError} />
              </>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
            <p className="text-caption text-muted-foreground">
              Prototype: drafts come from a rule-based stand-in for the model.
            </p>
            <div className="flex gap-2">
              {rows === null ? (
                <Button
                  type="button"
                  className="gap-2"
                  onClick={generate}
                  pending={draft.isPending}
                  pendingLabel="Drafting…"
                  disabled={text.trim().length < 10}
                >
                  <Sparkles aria-hidden className="size-4" />
                  Draft tasks
                </Button>
              ) : (
                <>
                  <Button type="button" variant="secondary" className="gap-2" onClick={reset}>
                    <RotateCcw aria-hidden className="size-4" />
                    Edit brief
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void addKept()}
                    pending={saving}
                    pendingLabel="Adding…"
                    disabled={keptCount === 0}
                  >
                    Add {keptCount} {keptCount === 1 ? 'task' : 'tasks'}
                  </Button>
                </>
              )}
            </div>
          </footer>
        </div>
      </dialog>
    </>
  );
}

/** Shimmering placeholder rows while the model works. */
function Thinking() {
  return (
    <div role="status" className="space-y-2">
      <p className="flex items-center gap-2 text-caption font-medium text-violet-700">
        <Sparkles aria-hidden className="size-4 animate-pulse" />
        Reading the brief and drafting tasks…
      </p>
      {[90, 70, 80].map((w) => (
        <div
          key={w}
          style={{ width: `${w}%` }}
          className="h-10 animate-pulse rounded-control bg-violet-100/70"
        />
      ))}
    </div>
  );
}
