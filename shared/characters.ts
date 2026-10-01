export type AnimalKey = 'hippo' | 'otter' | 'octopus' | 'crab' | 'frog' | 'penguin';

export interface CharacterDef {
  id: number;
  key: AnimalKey;
  name: string;
  animal: string;
  role: string;
  desc: string;
  /** [initial, max] on the original 1–10 scale */
  bal: readonly [number, number];
  pow: readonly [number, number];
  spd: readonly [number, number];
}

// Stat profiles reuse six original characters' published values (see design doc).
export const CHARACTERS: readonly CharacterDef[] = [
  { id: 0, key: 'hippo', name: '波波', animal: '河馬', role: '水球型', desc: '水球上限最高，跑不快', bal: [1, 10], pow: [1, 7], spd: [5, 7] },
  { id: 1, key: 'otter', name: '阿迅', animal: '水獺', role: '速度型', desc: '速度上限 9，水球少', bal: [1, 6], pow: [1, 7], spd: [5, 9] },
  { id: 2, key: 'octopus', name: '大砲', animal: '章魚', role: '火力型', desc: '水柱上限 9，開局 2 顆水球', bal: [2, 7], pow: [1, 9], spd: [4, 8] },
  { id: 3, key: 'crab', name: '鐵鉗', animal: '螃蟹', role: '速攻型', desc: '開局水柱 2 格，上限偏低', bal: [1, 6], pow: [2, 7], spd: [5, 8] },
  { id: 4, key: 'frog', name: '呱呱', animal: '青蛙', role: '連發型', desc: '開局 2 顆水球，水柱短', bal: [2, 9], pow: [1, 6], spd: [4, 8] },
  { id: 5, key: 'penguin', name: '小冰', animal: '企鵝', role: '晚成型', desc: '開局慢，三項上限都高', bal: [1, 10], pow: [1, 8], spd: [4, 8] },
];
