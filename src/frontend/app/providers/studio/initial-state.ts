

import { seedEvents } from "@fe/entities/event";

import type { StudioState } from "./types";

export const SEEDED_EVENTS = seedEvents();

export const INITIAL: StudioState = {
  section: 'agenda',
  query: '',
  status: '전체',
  sort: '최신',
  bulk: false,
  sel: [],
  events: SEEDED_EVENTS,
  customPresets: [],
  viewerOpen: false,
  dragOver: false,
  dragIdx: -1,
  device: 'mobile',
  saved: '방금 저장됨',
  paneW: 0,
};
