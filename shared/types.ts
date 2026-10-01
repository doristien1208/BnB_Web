/** 0 none, 1 up, 2 down, 3 left, 4 right */
export type Dir = 0 | 1 | 2 | 3 | 4;

export const DX: readonly number[] = [0, 0, 0, -1, 1];
export const DY: readonly number[] = [0, -1, 1, 0, 0];
export const OPPOSITE: readonly Dir[] = [0, 2, 1, 4, 3];

export const isDir = (v: unknown): v is Dir => v === 0 || v === 1 || v === 2 || v === 3 || v === 4;
