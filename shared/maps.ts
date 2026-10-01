import type { ItemType } from './items';

/**
 * Tile legend (one character per tile, 15 columns x 13 rows):
 *   .  floor          #  hard wall (indestructible)   x  crate (destructible, may drop an item)
 *   *  bush (hides)   o  pushable barrel               ~  water channel (players cannot enter)
 *   =  ice (slide)    < > ^ v  conveyor belt           @  portal (links to the point-symmetric portal)
 *   M  balloon machine (3x3 block in 水球工廠, fires balloons)
 *   1-4  spawn points (floor)
 * At run time the shrink turns closed rings into `%` (solid, like `#`).
 * Every map is mirror-symmetric on both axes; tests/maps.test.ts enforces this and spawn safety.
 */
export type ThemeKey =
  | 'village'
  | 'jungle'
  | 'pirate'
  | 'snow'
  | 'factory'
  | 'pyramid'
  | 'candy'
  | 'graveyard'
  | 'arena'
  | 'maze'
  | 'balloonworks';

export interface MapDef {
  id: number;
  key: ThemeKey;
  name: string;
  tag: string;
  stars: number;
  desc: string;
  grid: readonly string[];
  night?: boolean;
  dropRate?: number;
  weights?: Partial<Record<ItemType, number>>;
}

export const MAPS: readonly MapDef[] = [
  {
    id: 0,
    key: 'village',
    name: '陽光村莊',
    tag: '經典配置',
    stars: 1,
    desc: '規則最單純，適合第一局',
    grid: [
      '1.xxx.xxx.xxx.2',
      '.#x#x#x#x#x#x#.',
      'xx.xxx.x.xxx.xx',
      'x#x#.#x#x#.#x#x',
      '.xxxxxx.xxxxxx.',
      'x#x#x#.#.#x#x#x',
      'x.x.x.x.x.x.x.x',
      'x#x#x#.#.#x#x#x',
      '.xxxxxx.xxxxxx.',
      'x#x#.#x#x#.#x#x',
      'xx.xxx.x.xxx.xx',
      '.#x#x#x#x#x#x#.',
      '3.xxx.xxx.xxx.4',
    ],
  },
  {
    id: 1,
    key: 'jungle',
    name: '綠野叢林',
    tag: '草叢',
    stars: 2,
    desc: '大片草叢，可埋伏、藏水球',
    grid: [
      '1..x**x.x**x..2',
      '.#x#**#x#**#x#.',
      'xx**xx***xx**xx',
      '*#*##x*x*x##*#*',
      '**xx**x.x**xx**',
      'x#**#*#*#*#**#x',
      'xx*x*.*.*.*x*xx',
      'x#**#*#*#*#**#x',
      '**xx**x.x**xx**',
      '*#*##x*x*x##*#*',
      'xx**xx***xx**xx',
      '.#x#**#x#**#x#.',
      '3..x**x.x**x..4',
    ],
  },
  {
    id: 2,
    key: 'pirate',
    name: '海盜港灣',
    tag: '水道 + 可推木桶',
    stars: 2,
    desc: '中央水道分隔上下，只有 3 座橋；水柱可隔水攻擊',
    weights: { pirateTurtle: 5 },
    grid: [
      '1.xoxx.x.xxox.2',
      '.#x#x#o#o#x#x#.',
      'xo.xoxx.xxox.ox',
      'xx#x.#xxx#.x#xx',
      'oxxoxxoxoxxoxxo',
      'x#.x#xx.xx#x.#x',
      '~~.~~~~.~~~~.~~',
      'x#.x#xx.xx#x.#x',
      'oxxoxxoxoxxoxxo',
      'xx#x.#xxx#.x#xx',
      'xo.xoxx.xxox.ox',
      '.#x#x#o#o#x#x#.',
      '3.xoxx.x.xxox.4',
    ],
  },
  {
    id: 3,
    key: 'snow',
    name: '冰雪湖畔',
    tag: '冰面滑行',
    stars: 3,
    desc: '左右兩座冰湖，滑行最快但不能轉向',
    weights: { iceSkate: 4 },
    grid: [
      '1.xx#xx.xx#xx.2',
      '.#xxxx#x#xxxx#.',
      'xx#===xxx===#xx',
      'xx==#==x==#==xx',
      '#x=====.=====x#',
      'x#x=#=xxx=#=x#x',
      'xxx..=====..xxx',
      'x#x=#=xxx=#=x#x',
      '#x=====.=====x#',
      'xx==#==x==#==xx',
      'xx#===xxx===#xx',
      '.#xxxx#x#xxxx#.',
      '3.xx#xx.xx#xx.4',
    ],
  },
  {
    id: 4,
    key: 'factory',
    name: '機械工廠',
    tag: '輸送帶',
    stars: 3,
    desc: '四角各一圈輸送帶，水球放上去會被帶走',
    grid: [
      '1.xxx.x.x.xxx.2',
      '.#x#x#x#x#x#x#.',
      'xx>>>vxxxv<<<xx',
      'x#^##v...v##^#x',
      'xx^<<<xxx>>>^xx',
      'x#x.x#x#x#x.x#x',
      '.xxx.xx.xx.xxx.',
      'x#x.x#x#x#x.x#x',
      'xxv<<<xxx>>>vxx',
      'x#v##^...^##v#x',
      'xx>>>^xxx^<<<xx',
      '.#x#x#x#x#x#x#.',
      '3.xxx.x.x.xxx.4',
    ],
  },
  {
    id: 5,
    key: 'pyramid',
    name: '沙漠金字塔',
    tag: '傳送門 + 中央密室',
    stars: 3,
    desc: '傳送門通往對角；中央密室要先炸開木箱才進得去',
    grid: [
      '1.xx#xx.xx#xx.2',
      '.#xxxx#x#xxxx#.',
      'xx@x#xx.xx#x@xx',
      'xxx#xx.#.xx#xxx',
      '#xxxx.x.x.xxxx#',
      'xx#x.x...x.x#xx',
      'x.x.#.....#.x.x',
      'xx#x.x...x.x#xx',
      '#xxxx.x.x.xxxx#',
      'xxx#xx.#.xx#xxx',
      'xx@x#xx.xx#x@xx',
      '.#xxxx#x#xxxx#.',
      '3.xx#xx.xx#xx.4',
    ],
  },
  {
    id: 6,
    key: 'candy',
    name: '糖果工坊',
    tag: '木箱極密',
    stars: 2,
    desc: '幾乎全是木箱，道具多、節奏快',
    dropRate: 0.65,
    grid: [
      '1.xxxxxxxxxxx.2',
      '.xx#xxx#xxx#xx.',
      'xxxxx#xxx#xxxxx',
      'x#xxxxxxxxxxx#x',
      'xxx#xx#x#xx#xxx',
      'xx#xxxxxxxxx#xx',
      'xxxx#xxxxx#xxxx',
      'xx#xxxxxxxxx#xx',
      'xxx#xx#x#xx#xxx',
      'x#xxxxxxxxxxx#x',
      'xxxxx#xxx#xxxxx',
      '.xx#xxx#xxx#xx.',
      '3.xxxxxxxxxxx.4',
    ],
  },
  {
    id: 7,
    key: 'graveyard',
    name: '月夜墓園',
    tag: '夜晚視野',
    stars: 3,
    desc: '只看得到周圍 3 格，靠水球亮光判斷敵人位置',
    night: true,
    grid: [
      '1.x#x*x.x*x#x.2',
      '.#xxx#xxx#xxx#.',
      'xx#*xx#*#xx*#xx',
      '#xx*#xxxxx#*xx#',
      'x*xxx#*.*#xxx*x',
      '*#x#xxx#xxx#x#*',
      'xx*x.*x.x*.x*xx',
      '*#x#xxx#xxx#x#*',
      'x*xxx#*.*#xxx*x',
      '#xx*#xxxxx#*xx#',
      'xx#*xx#*#xx*#xx',
      '.#xxx#xxx#xxx#.',
      '3.x#x*x.x*x#x.4',
    ],
  },
  {
    id: 8,
    key: 'arena',
    name: '圓形競技場',
    tag: '開闊、木箱少',
    stars: 3,
    desc: '開場很快近身，比反應與走位',
    grid: [
      '1..x..x.x..x..2',
      '.#..#.....#..#.',
      '..x...#.#...x..',
      'x..#.x...x.#..x',
      '.#..x..#..x..#.',
      '..#...x.x...#..',
      'x...#.....#...x',
      '..#...x.x...#..',
      '.#..x..#..x..#.',
      'x..#.x...x.#..x',
      '..x...#.#...x..',
      '.#..#.....#..#.',
      '3..x..x.x..x..4',
    ],
  },
  {
    id: 9,
    key: 'maze',
    name: '古代迷宮',
    tag: '長走廊',
    stars: 3,
    desc: '走廊長、轉角多，一顆水球就能封路',
    grid: [
      '1..x.#...#.x..2',
      '.###.#.#.#.###.',
      'x..#...#...#..x',
      '##.###x#x###.##',
      '...x.......x...',
      '.###x##.##x###.',
      'x..#..x.x..#..x',
      '.###x##.##x###.',
      '...x.......x...',
      '##.###x#x###.##',
      'x..#...#...#..x',
      '.###.#.#.#.###.',
      '3..x.#...#.x..4',
    ],
  },
  {
    id: 10,
    key: 'balloonworks',
    name: '水球工廠',
    tag: '中央水球機',
    stars: 3,
    desc: '中央的水球機每 20 秒朝四周吐出 4–8 顆水球（水柱 2 格）',
    grid: [
      '1.xxxx.x.xxxx.2',
      '.#x#xx#x#xx#x#.',
      'xxx.x.xxx.x.xxx',
      'x#x#x#...#x#x#x',
      'xx.xx.....xx.xx',
      '.x#x..MMM..x#x.',
      'xx.x..MMM..x.xx',
      '.x#x..MMM..x#x.',
      'xx.xx.....xx.xx',
      'x#x#x#...#x#x#x',
      'xxx.x.xxx.x.xxx',
      '.#x#xx#x#xx#x#.',
      '3.xxxx.x.xxxx.4',
    ],
  },
];

export const RANDOM_MAP = -1;
