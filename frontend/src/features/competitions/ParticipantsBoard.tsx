import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CompetitionDTO, CompetitionParticipantDTO, ProfileDTO } from '@caraoke/shared';
import clsx from 'clsx';
import { GripVertical, Music, Plus, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import {
  useAddCompetitionSongMutation,
  useRemoveCompetitionSongMutation,
  useSetParticipantsMutation,
} from '../../api/competitions';
import { useProfilesQuery } from '../../api/profiles';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { toast } from '../../stores/useToastStore';
import { CreateProfileModal } from '../profiles/CreateProfileModal';
import { SongPickerModal } from './SongPickerModal';

const PROFILE_PREFIX = 'profile:';
const PARTICIPANT_PREFIX = 'participant:';
const DROP_ZONE_ID = 'participants-zone';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function AvailableProfile({ profile, onAdd }: { profile: ProfileDTO; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `${PROFILE_PREFIX}${profile.id}`,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={clsx(
        'flex items-center gap-2 rounded-xl bg-surface-2 p-2',
        isDragging && 'relative z-20 shadow-2xl',
      )}
    >
      <button
        type="button"
        aria-label={`Arrastar ${profile.name} para a disputa`}
        className="inline-flex size-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" className="size-5" />
      </button>
      <Avatar avatarId={profile.avatar} size="sm" />
      <span className="min-w-0 flex-1 truncate">{profile.name}</span>
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Pôr ${profile.name} na disputa`}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface"
      >
        <Plus aria-hidden="true" className="size-5" />
      </button>
    </li>
  );
}

interface ParticipantRowProps {
  participant: CompetitionParticipantDTO;
  limit: number;
  onRemove: () => void;
  onAddSong: () => void;
  onRemoveSong: (entryId: string) => void;
}

function ParticipantRow({ participant, limit, onRemove, onAddSong, onRemoveSong }: ParticipantRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: `${PARTICIPANT_PREFIX}${participant.profile.id}`,
    });
  const name = participant.profile.name;
  const isFull = participant.songs.length >= limit;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        'flex flex-col gap-2 rounded-xl bg-surface p-3',
        isDragging && 'relative z-10 shadow-2xl',
      )}
    >
      <div className="flex items-center gap-2">
        <button
          ref={setActivatorNodeRef}
          type="button"
          aria-label={`Mudar a posição de ${name}`}
          className="inline-flex size-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" className="size-5" />
        </button>
        <Avatar avatarId={participant.profile.avatar} size="sm" />
        <span className="min-w-0 flex-1 truncate text-lg font-semibold">{name}</span>
        <span className={clsx('shrink-0 text-sm', isFull ? 'text-muted' : 'text-primary')}>
          {participant.songs.length}/{limit}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Tirar ${name} da disputa`}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface-2"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <ul aria-label={`Músicas de ${name}`} className="flex flex-wrap gap-2 pl-12">
        {participant.songs.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center gap-1 rounded-full bg-surface-2 py-1 pr-1 pl-3 text-sm"
          >
            <Music aria-hidden="true" className="size-4 text-muted" />
            <span className="max-w-48 truncate">{entry.song.title}</span>
            <button
              type="button"
              onClick={() => onRemoveSong(entry.id)}
              aria-label={`Tirar ${entry.song.title} de ${name}`}
              className="inline-flex size-8 items-center justify-center rounded-full hover:bg-surface"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </li>
        ))}
        {!isFull && (
          <li>
            <button
              type="button"
              onClick={onAddSong}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-muted px-3 text-sm hover:bg-surface-2"
            >
              <Plus aria-hidden="true" className="size-4" />
              Música para {name}
            </button>
          </li>
        )}
      </ul>
    </li>
  );
}

function ParticipantsZone({ children, isEmpty }: { children: React.ReactNode; isEmpty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: DROP_ZONE_ID });
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'flex min-h-40 flex-col gap-2 rounded-2xl border-2 border-dashed p-3 transition',
        isOver ? 'border-primary bg-primary/10' : 'border-surface-2',
      )}
    >
      {isEmpty && (
        <p className="m-auto text-center text-base text-muted">Arraste as pessoas para cá (ou toque no +)</p>
      )}
      {children}
    </div>
  );
}

export function ParticipantsBoard({ competition }: { competition: CompetitionDTO }) {
  const profiles = useProfilesQuery();
  const setParticipants = useSetParticipantsMutation(competition.id);
  const addSong = useAddCompetitionSongMutation(competition.id);
  const removeSong = useRemoveCompetitionSongMutation(competition.id);
  const [songFor, setSongFor] = useState<CompetitionParticipantDTO | null>(null);
  const [isCreatingGuest, setIsCreatingGuest] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const participantIds = competition.participants.map((participant) => participant.profile.id);
  const available = (profiles.data ?? []).filter((profile) => !participantIds.includes(profile.id));

  function save(ids: string[]) {
    setParticipants.mutate(ids, {
      onError: (error) => toast.error(errorMessage(error, 'Não foi possível salvar os participantes')),
    });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const overIndex = overId.startsWith(PARTICIPANT_PREFIX)
      ? participantIds.indexOf(overId.slice(PARTICIPANT_PREFIX.length))
      : participantIds.length;

    if (activeId.startsWith(PROFILE_PREFIX)) {
      if (overId !== DROP_ZONE_ID && !overId.startsWith(PARTICIPANT_PREFIX)) return;
      const ids = [...participantIds];
      ids.splice(overIndex, 0, activeId.slice(PROFILE_PREFIX.length));
      save(ids);
      return;
    }
    if (
      activeId.startsWith(PARTICIPANT_PREFIX) &&
      overId.startsWith(PARTICIPANT_PREFIX) &&
      activeId !== overId
    ) {
      const from = participantIds.indexOf(activeId.slice(PARTICIPANT_PREFIX.length));
      save(arrayMove(participantIds, from, overIndex));
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section aria-label="Perfis" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">Perfis</h2>
            <Button variant="ghost" onClick={() => setIsCreatingGuest(true)}>
              <UserPlus aria-hidden="true" className="size-5" />
              Convidado
            </Button>
          </div>
          <ul className="flex flex-col gap-2">
            {available.map((profile) => (
              <AvailableProfile
                key={profile.id}
                profile={profile}
                onAdd={() => save([...participantIds, profile.id])}
              />
            ))}
            {profiles.isSuccess && available.length === 0 && (
              <li className="text-sm text-muted">Todos já estão na disputa.</li>
            )}
          </ul>
        </section>

        <section aria-label="Na disputa" className="flex min-w-0 flex-col gap-3">
          <h2 className="text-xl font-semibold">
            Na disputa{' '}
            <span className="text-base font-normal text-muted">({competition.participants.length})</span>
          </h2>
          <ParticipantsZone isEmpty={competition.participants.length === 0}>
            <SortableContext
              items={participantIds.map((id) => `${PARTICIPANT_PREFIX}${id}`)}
              strategy={verticalListSortingStrategy}
            >
              <ol className="flex flex-col gap-2">
                {competition.participants.map((participant) => (
                  <ParticipantRow
                    key={participant.profile.id}
                    participant={participant}
                    limit={competition.rules.songsPerParticipant}
                    onRemove={() => save(participantIds.filter((id) => id !== participant.profile.id))}
                    onAddSong={() => setSongFor(participant)}
                    onRemoveSong={(entryId) =>
                      removeSong.mutate(entryId, {
                        onError: (error) =>
                          toast.error(errorMessage(error, 'Não foi possível tirar a música')),
                      })
                    }
                  />
                ))}
              </ol>
            </SortableContext>
          </ParticipantsZone>
        </section>
      </div>

      <SongPickerModal
        isOpen={songFor !== null}
        title={songFor ? `Música para ${songFor.profile.name}` : ''}
        excludedIds={songFor?.songs.map((entry) => entry.song.id) ?? []}
        onClose={() => setSongFor(null)}
        onPick={(song) => {
          const participant = songFor;
          setSongFor(null);
          if (!participant) return;
          addSong.mutate(
            { profileId: participant.profile.id, songId: song.id },
            { onError: (error) => toast.error(errorMessage(error, 'Não foi possível adicionar a música')) },
          );
        }}
      />
      <CreateProfileModal
        isOpen={isCreatingGuest}
        isGuest
        onClose={() => setIsCreatingGuest(false)}
        onCreated={(profile) => save([...participantIds, profile.id])}
      />
    </DndContext>
  );
}
