export type ItemType =
  | 'bubble'
  | 'potion'
  | 'skate'
  | 'shoe'
  | 'ultra'
  | 'redDevil'
  | 'glove'
  | 'greenDevil'
  | 'devil'
  | 'cloak'
  | 'turtle'
  | 'owl'
  | 'ufo'
  | 'pirateTurtle'
  | 'needle'
  | 'dart'
  | 'spring'
  | 'banana'
  | 'iceSkate';

export type MountType = 'turtle' | 'owl' | 'pirateTurtle' | 'ufo';
export type ActiveType = 'needle' | 'dart' | 'spring' | 'banana';
export type ItemKind = 'stat' | 'curse' | 'special' | 'mount' | 'active';

export interface ItemDef {
  type: ItemType;
  /** one character, used to encode the floor-item layer in snapshots */
  code: string;
  name: string;
  kind: ItemKind;
  desc: string;
  /** default drop weight; the 18 regular items sum to 100 */
  weight: number;
}

export const ITEMS: Readonly<Record<ItemType, ItemDef>> = {
  bubble: { type: 'bubble', code: 'b', name: '水球', kind: 'stat', desc: '可同時放置的水球 +1', weight: 20 },
  potion: { type: 'potion', code: 'p', name: '神奇藥水', kind: 'stat', desc: '水柱 +1 格', weight: 20 },
  skate: { type: 'skate', code: 's', name: '溜冰鞋', kind: 'stat', desc: '速度 +1 級', weight: 15 },
  shoe: { type: 'shoe', code: 'h', name: '運動鞋', kind: 'stat', desc: '可以踢水球', weight: 4 },
  ultra: { type: 'ultra', code: 'u', name: '大力藥丸', kind: 'stat', desc: '水柱直接升到上限', weight: 3 },
  redDevil: { type: 'redDevil', code: 'r', name: '紅色惡魔', kind: 'stat', desc: '速度升到上限，並可踢水球', weight: 3 },
  glove: { type: 'glove', code: 'g', name: '拳套', kind: 'stat', desc: '站在自己的水球上按放水球鍵可丟出', weight: 3 },
  greenDevil: { type: 'greenDevil', code: 'G', name: '綠色惡魔', kind: 'curse', desc: '吐出一個能力道具，該能力 −1', weight: 3 },
  devil: { type: 'devil', code: 'd', name: '惡魔', kind: 'curse', desc: '10 秒內方向顛倒或不停放水球', weight: 3 },
  cloak: { type: 'cloak', code: 'c', name: '隱形衣', kind: 'special', desc: '10 秒內對手幾乎看不到你', weight: 2 },
  turtle: { type: 'turtle', code: 't', name: '烏龜', kind: 'mount', desc: '坐騎，速度 1', weight: 6 },
  owl: { type: 'owl', code: 'o', name: '貓頭鷹', kind: 'mount', desc: '坐騎，速度 5', weight: 3 },
  ufo: { type: 'ufo', code: 'f', name: '飛碟', kind: 'mount', desc: '坐騎，速度 10，可飛越木箱，不能撿道具', weight: 2 },
  pirateTurtle: { type: 'pirateTurtle', code: 'T', name: '海盜烏龜', kind: 'mount', desc: '坐騎，速度 9', weight: 1 },
  needle: { type: 'needle', code: 'n', name: '針', kind: 'active', desc: '被困時使用，立即脫困', weight: 5 },
  dart: { type: 'dart', code: 'D', name: '飛鏢', kind: 'active', desc: '射爆遠處的水球（3 支）', weight: 3 },
  spring: { type: 'spring', code: 'S', name: '彈簧鞋', kind: 'active', desc: '跳過面前障礙，每格用 1 次（3 次）', weight: 2 },
  banana: { type: 'banana', code: 'B', name: '香蕉皮', kind: 'active', desc: '放在地上讓對手滑走', weight: 2 },
  iceSkate: { type: 'iceSkate', code: 'i', name: '冰刀', kind: 'stat', desc: '速度直接升到上限（只在冰雪湖畔）', weight: 0 },
};

export const ITEM_TYPES = Object.keys(ITEMS) as ItemType[];

export const ITEM_BY_CODE: Readonly<Record<string, ItemType>> = Object.fromEntries(
  ITEM_TYPES.map((t) => [ITEMS[t].code, t]),
);

export const MOUNT_SPEED: Readonly<Record<MountType, number>> = { turtle: 1, owl: 5, pirateTurtle: 9, ufo: 10 };

export const MOUNT_CODE: Readonly<Record<MountType, string>> = { turtle: 't', owl: 'o', pirateTurtle: 'T', ufo: 'f' };
export const MOUNT_BY_CODE: Readonly<Record<string, MountType>> = { t: 'turtle', o: 'owl', T: 'pirateTurtle', f: 'ufo' };

export const isMount = (t: ItemType): t is MountType => ITEMS[t].kind === 'mount';
export const isActive = (t: ItemType): t is ActiveType => ITEMS[t].kind === 'active';
