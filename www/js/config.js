// Flash Attack — tuning + map data
export const TILE = 64;

// # wall   c crate (cover)   w water (blocks feet, not bullets)
// A / B charge sites   T raider spawn   D guard spawn
export const MAP = [
  '########################################',
  '#......#.........#...........#.........#',
  '#......#.........#...........#..AAAA...#',
  '#......#...cc........cc......#..AAAA...#',
  '#..........cc....#...cc.........AAAA.c.#',
  '#......#.........#...........#..AAAA...#',
  '#......####..#####....####...#.c.......#',
  '#TT....#.........#....#..#...###..######',
  '#TT....#.........#.......#.............#',
  '#TT.......ww.........c...#....c......DD#',
  '#TT....#..ww...c.........#...........DD#',
  '#TT....#.................#....##.....DD#',
  '#TT....#.....c...#....c..........c...DD#',
  '#TT.......ww.....#.......#...........DD#',
  '#TT....#..ww.....#....#..#....c........#',
  '#......####..#####....####...###..######',
  '#......#.........#...........#.c.......#',
  '#..........cc....#...cc.........BBBB.c.#',
  '#......#...cc........cc......#..BBBB...#',
  '#......#.........#...........#..BBBB...#',
  '#......#.........#...........#..BBBB...#',
  '########################################',
];

export const WEAPONS = {
  pip:      { name: 'Pip',      kind: 'Sidearm', price: 0,    dmg: 19,  rate: 0.24,  spread: 0.045, mag: 12, reload: 1.0, speed: 1300, range: 640,  pellets: 1, len: 20, move: 1 },
  buzzer:   { name: 'Buzzer',   kind: 'SMG',     price: 1200, dmg: 13,  rate: 0.075, spread: 0.11,  mag: 30, reload: 1.6, speed: 1350, range: 560,  pellets: 1, len: 28, move: 1 },
  thumper:  { name: 'Thumper',  kind: 'Shotgun', price: 1500, dmg: 15,  rate: 0.8,   spread: 0.24,  mag: 6,  reload: 2.0, speed: 1150, range: 340,  pellets: 7, len: 32, move: 0.97 },
  lancer:   { name: 'Lancer',   kind: 'Rifle',   price: 2700, dmg: 27,  rate: 0.115, spread: 0.045, mag: 25, reload: 1.9, speed: 1550, range: 800,  pellets: 1, len: 38, move: 0.95 },
  longshot: { name: 'Longshot', kind: 'Sniper',  price: 4200, dmg: 105, rate: 1.25,  spread: 0.004, mag: 5,  reload: 2.6, speed: 2500, range: 1400, pellets: 1, len: 48, move: 0.86 },
};

export const ITEMS = {
  vest:  { name: 'Vest',  desc: 'Soaks 40% damage',  price: 650 },
  flash: { name: 'Flash', desc: 'Blinds on sight',   price: 250, max: 2 },
  frag:  { name: 'Frag',  desc: 'Big boom',          price: 350, max: 1 },
  kit:   { name: 'Kit',   desc: 'Defuse 2x faster',  price: 400 },
};

export const RULES = {
  teamSize: 4,
  winScore: 5,
  swapAfter: 4,
  buyTime: 9,
  roundTime: 100,
  chargeTime: 35,
  endTime: 4.5,
  plantTime: 3,
  defuseTime: 5,
  startMoney: 800,
  maxMoney: 9000,
  killReward: 300,
  winReward: 2900,
  lossReward: 1700,
  plantReward: 300,
  speed: 235,
};

export const BOT_NAMES = ['Pixel', 'Mango', 'Bolt', 'Nori', 'Zuzu', 'Waffle', 'Tango', 'Echo', 'Biscuit', 'Juno', 'Rook', 'Sprout'];
