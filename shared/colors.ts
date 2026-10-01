export interface ColorDef {
  id: number;
  name: string;
  main: string;
  dark: string;
  light: string;
}

export const COLORS: readonly ColorDef[] = [
  { id: 0, name: '紅', main: '#e84a4a', dark: '#9e2633', light: '#ff9a8c' },
  { id: 1, name: '橙', main: '#f39233', dark: '#a85818', light: '#ffc47e' },
  { id: 2, name: '黃', main: '#f2d23a', dark: '#a8891a', light: '#fff19a' },
  { id: 3, name: '綠', main: '#4cbf5c', dark: '#24803a', light: '#9fe8a4' },
  { id: 4, name: '青', main: '#36c5cf', dark: '#1a8790', light: '#97ecf1' },
  { id: 5, name: '藍', main: '#3d7be0', dark: '#234c9e', light: '#93b9ff' },
  { id: 6, name: '紫', main: '#9b59d0', dark: '#62308f', light: '#d2a8f6' },
  { id: 7, name: '粉', main: '#f07ab8', dark: '#ae4580', light: '#ffbfe0' },
];

/** Team markers are gold and silver so they never clash with the eight body colours. */
export const TEAMS = [
  { name: 'A', ring: '#f2c230', label: 'A 隊' },
  { name: 'B', ring: '#c3ccd6', label: 'B 隊' },
] as const;
