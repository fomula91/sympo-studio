export { SLUG_PATTERN, RESERVED_SLUGS, slugFormatError, slugLockedMessage } from '@/lib/slug';
export { EVENT_STATUSES, isEventStatus, statusBadRequestMessage, PUBLIC_STATUSES, EVENT_PHASES, todayKst, eventPhase } from '@/lib/status';
export type { EventStatus, EventPhase } from '@/lib/status';
export { EVENT_TEXT_MAX, isEventTextField, eventTextPatchError, MAX_CAPACITY, CAPACITY_MAX_DIGITS, isValidCapacity, capacityBadRequestMessage, textTooLongMessage } from '@/lib/event-limits';
export type { EventTextField } from '@/lib/event-limits';
export { venueSlug, autoSlug } from '@/lib/event-slug';
export { SESSIONS0 } from '@/lib/demo-sessions';
export { SESSION_KINDS, SESSION_TITLE_MAX, SESSION_SPEAKER_MAX } from '@/lib/agenda-limits';
