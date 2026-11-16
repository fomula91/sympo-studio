export type StatePatch<T> = (patch: Partial<T> | null | ((state: T) => Partial<T> | null)) => void;
