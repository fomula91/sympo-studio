export interface StudioShellProps {
 children: React.ReactNode; preview: React.ReactNode; accountMenu: React.ReactNode;
 s: import('../model/state').StudioState; patch: import('../model/state').PatchFn;
 ev: import("@fe/entities/event").EventItem;
 presets: import("@fe/entities/theme").Preset[];
 resetSessions: () => void; createEvent: () => Promise<number>; isServerEvent: boolean;
 setEventStatus: (status: import("@fe/entities/event").EventStatus) => Promise<void>; serverIds: ReadonlySet<number>;
}
