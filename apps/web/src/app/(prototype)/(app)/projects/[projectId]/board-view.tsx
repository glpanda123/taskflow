'use client';

/**
 * Kanban board with drag and drop (dnd-kit).
 *
 * - Mouse/touch: drag a card (a 6px move starts a drag, so a click still opens it).
 * - Keyboard: Space picks a card up, arrows move it, Space drops, Escape cancels;
 *   Enter opens it. Screen readers hear where the card is at each step.
 * - Drop = optimistic: the card stays where you put it while POST /move runs; the
 *   server's answer (or a 409) then replaces the guess.
 */
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { taskStatusValues, type Task, type TaskStatus } from '@taskflow/api-contract';
import { useQueryClient } from '@tanstack/react-query';
import { generateKeyBetween } from 'fractional-indexing';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Avatar, DueLabel } from '@/components/task/task-bits';
import { conflictTask, errorMessage } from '@/lib/api/errors';
import { putTaskInCache, useMoveTask } from '@/lib/api/queries';
import { priorityLabel, statusLabel } from '@/lib/format';

type Columns = Record<TaskStatus, string[]>;

const columnDot: Record<TaskStatus, string> = {
  todo: 'bg-status-todo',
  in_progress: 'bg-status-in-progress',
  in_review: 'bg-status-in-review',
  done: 'bg-status-done',
};

const priorityStyle: Record<Task['priority'], string> = {
  high: 'bg-rose-50 text-rose-700 ring-rose-200',
  medium: 'bg-amber-50 text-amber-800 ring-amber-200',
  low: 'bg-muted text-muted-foreground ring-border',
};

function toColumns(tasks: Task[]): Columns {
  const columns: Columns = { todo: [], in_progress: [], in_review: [], done: [] };
  for (const t of tasks) columns[t.status].push(t.id); // tasks arrive in board order
  return columns;
}

const isStatus = (id: UniqueIdentifier): id is TaskStatus =>
  (taskStatusValues as readonly string[]).includes(String(id));

function containerOf(id: UniqueIdentifier, columns: Columns): TaskStatus | undefined {
  if (isStatus(id)) return id;
  return taskStatusValues.find((s) => columns[s].includes(String(id)));
}

export function BoardView({
  projectId,
  tasks,
  canEdit,
  selectedId,
  highlighted,
  onSelect,
}: {
  projectId: string;
  tasks: Task[];
  canEdit: boolean;
  selectedId: string | null;
  /** Tasks just changed by a teammate, shown with a ring for a few seconds. */
  highlighted: ReadonlySet<string>;
  onSelect: (id: string) => void;
}) {
  const qc = useQueryClient();
  const move = useMoveTask(projectId);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  // While dragging we own the column order; otherwise it comes from the server data.
  const [dragColumns, setDragColumns] = useState<Columns | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const start = useRef<{ status: TaskStatus; index: number } | null>(null);
  const columns = dragColumns ?? toColumns(tasks);
  const columnsRef = useRef(columns);
  useEffect(() => {
    columnsRef.current = columns;
  });

  /** Left/Right jump to the neighbouring column; Up/Down reorder inside it. */
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
    if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') {
      return sortableKeyboardCoordinates(event, args);
    }
    const { active, droppableRects } = args.context;
    if (!active) return undefined;
    const current = containerOf(active.id, columnsRef.current);
    if (!current) return undefined;
    const next =
      taskStatusValues[taskStatusValues.indexOf(current) + (event.code === 'ArrowRight' ? 1 : -1)];
    const rect = next && droppableRects.get(next);
    if (!rect) return undefined;
    event.preventDefault();
    return { x: rect.left + 8, y: rect.top + 8 };
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      // Enter is kept free for "open the task".
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  const title = (id: UniqueIdentifier) => byId.get(String(id))?.title ?? 'Task';
  const place = (id: UniqueIdentifier) => {
    const status = containerOf(id, columns);
    if (!status) return 'nowhere';
    if (isStatus(id)) return statusLabel[status];
    const list = columns[status];
    return `${statusLabel[status]}, position ${list.indexOf(String(id)) + 1} of ${list.length}`;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${title(active.id)}. It is in ${place(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${title(active.id)} is over ${place(over.id)}.`
        : `${title(active.id)} is not over a column.`,
    onDragEnd: ({ active, over }) =>
      over ? `${title(active.id)} dropped in ${place(active.id)}.` : `${title(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${title(active.id)} was cancelled.`,
  };

  function onDragStart({ active }: DragStartEvent) {
    const initial = toColumns(tasks);
    const status = containerOf(active.id, initial);
    if (!status) return;
    start.current = { status, index: initial[status].indexOf(String(active.id)) };
    setDragColumns(initial);
    setActiveId(String(active.id));
    setMoveError(null);
  }

  /** Crossing into another column: move the card there now, so the gap opens under the pointer. */
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    setDragColumns((cols) => {
      if (!cols) return cols;
      const from = containerOf(active.id, cols);
      const to = containerOf(over.id, cols);
      if (!from || !to || from === to) return cols;
      const target = [...cols[to]];
      const overIndex = target.indexOf(String(over.id));
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, String(active.id));
      return { ...cols, [from]: cols[from].filter((id) => id !== active.id), [to]: target };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const cols = dragColumns;
    setActiveId(null);
    setDragColumns(null);
    if (!over || !cols) return;

    const id = String(active.id);
    const status = containerOf(id, cols);
    const task = byId.get(id);
    if (!status || !task) return;

    let list = cols[status];
    const from = list.indexOf(id);
    const to = list.indexOf(String(over.id));
    if (to >= 0 && to !== from) list = arrayMove(list, from, to);
    const index = list.indexOf(id);
    if (start.current?.status === status && start.current.index === index) return; // no change

    const afterId = list[index - 1] ?? null;
    const beforeId = list[index + 1] ?? null;

    // Optimistic: same key the server will compute (between the two neighbours).
    try {
      const position = generateKeyBetween(
        afterId ? (byId.get(afterId)?.position ?? null) : null,
        beforeId ? (byId.get(beforeId)?.position ?? null) : null,
      );
      putTaskInCache(qc, { ...task, status, position });
    } catch {
      // Neighbours out of order in our copy: skip the guess, the refetch will settle it.
    }

    move.mutate(
      { taskId: id, version: task.version, status, afterId, beforeId },
      {
        onError: (error) =>
          setMoveError(
            conflictTask(error)
              ? `"${task.title}" was just changed by someone else. The board now shows the latest — try again.`
              : errorMessage(error),
          ),
      },
    );
  }

  const active = activeId ? byId.get(activeId) : undefined;

  return (
    <div className="space-y-3">
      {moveError && (
        <p
          role="alert"
          className="rounded-control bg-status-overdue-subtle px-3 py-2 text-caption text-status-overdue-text"
        >
          {moveError}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setDragColumns(null);
        }}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'To move a task, press Space, use the arrow keys, then press Space to drop it or Escape to cancel. Press Enter to open it.',
          },
        }}
      >
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
          {taskStatusValues.map((status) => (
            <Column key={status} status={status} count={columns[status].length}>
              <SortableContext items={columns[status]} strategy={verticalListSortingStrategy}>
                {columns[status].map((id) => {
                  const task = byId.get(id);
                  if (!task) return null;
                  return (
                    <SortableCard
                      key={id}
                      task={task}
                      canEdit={canEdit}
                      selected={id === selectedId}
                      highlighted={highlighted.has(id)}
                      onSelect={onSelect}
                    />
                  );
                })}
              </SortableContext>
            </Column>
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
          {active ? <CardBody task={active} lifted /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  status,
  count,
  children,
}: {
  status: TaskStatus;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      aria-labelledby={`col-${status}`}
      className={`flex w-[272px] shrink-0 flex-col rounded-card ring-1 transition-colors ${isOver ? 'bg-accent/60 ring-primary/40' : 'bg-muted ring-border'}`}
    >
      <h2
        id={`col-${status}`}
        className="flex items-center gap-2 px-3 pt-3 pb-2 text-caption font-semibold"
      >
        <span aria-hidden className={`size-2 rounded-pill ${columnDot[status]}`} />
        {statusLabel[status]}
        <span className="rounded-pill bg-card px-2 font-normal text-muted-foreground ring-1 ring-border">
          {count}
        </span>
      </h2>
      <ol ref={setNodeRef} className="flex min-h-28 flex-1 flex-col gap-2 px-2 pb-2">
        {children}
        {count === 0 && (
          <li className="flex flex-1 items-center justify-center rounded-control border border-dashed border-input p-4 text-caption text-muted-foreground">
            No tasks
          </li>
        )}
      </ol>
    </section>
  );
}

function SortableCard({
  task,
  canEdit,
  selected,
  highlighted,
  onSelect,
}: {
  task: Task;
  canEdit: boolean;
  selected: boolean;
  highlighted: boolean;
  onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !canEdit,
  });

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSelect(task.id);
      return;
    }
    listeners?.onKeyDown?.(event);
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'opacity-40' : ''}
    >
      <div
        {...attributes}
        {...listeners}
        // Viewers can't drag, but the card still opens: don't let dnd-kit announce it as
        // disabled or read out drag instructions.
        aria-disabled={undefined}
        aria-describedby={canEdit ? attributes['aria-describedby'] : undefined}
        aria-roledescription={canEdit ? 'draggable task' : 'task'}
        aria-label={`${task.title}, ${priorityLabel[task.priority]} priority`}
        onKeyDown={onKeyDown}
        onClick={() => onSelect(task.id)}
        className={`rounded-control outline-offset-2 ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
      >
        <CardBody task={task} selected={selected} highlighted={highlighted} />
      </div>
    </li>
  );
}

function CardBody({
  task,
  selected,
  highlighted,
  lifted,
}: {
  task: Task;
  selected?: boolean;
  highlighted?: boolean;
  lifted?: boolean;
}) {
  const ring = selected
    ? 'ring-2 ring-primary'
    : highlighted
      ? 'ring-2 ring-emerald-400'
      : 'ring-1 ring-border hover:ring-input';
  return (
    <div
      className={`space-y-2.5 rounded-control bg-card p-3 shadow-xs transition-shadow ${ring} ${lifted ? 'rotate-2 shadow-xl' : 'hover:shadow-md'} ${highlighted ? 'animate-fade-up' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 font-medium">{task.title}</p>
        {task.assignee && <Avatar name={task.assignee.name} />}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-pill px-2 py-px text-[12px] font-medium ring-1 ${priorityStyle[task.priority]}`}
        >
          {priorityLabel[task.priority]}
        </span>
        {task.dueDate && <DueLabel dueDate={task.dueDate} status={task.status} />}
      </div>
    </div>
  );
}
