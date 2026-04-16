export const HEROES = {
  tank: [
    { id: 'domina', name: 'Domina (도미나)', cfKey: 'domina' },
    { id: 'dva', name: 'D.Va', cfKey: 'dva' },
    { id: 'doomfist', name: 'Doomfist', cfKey: 'doomfist' },
    { id: 'hazard', name: 'Hazard', cfKey: 'hazard' },
    { id: 'junkerqueen', name: 'Junker Queen', cfKey: 'junker-queen' },
    { id: 'mauga', name: 'Mauga', cfKey: 'mauga' },
    { id: 'orisa', name: 'Orisa', cfKey: 'orisa' },
    { id: 'ramattra', name: 'Ramattra', cfKey: 'ramattra' },
    { id: 'reinhardt', name: 'Reinhardt', cfKey: 'reinhardt' },
    { id: 'roadhog', name: 'Roadhog', cfKey: 'roadhog' },
    { id: 'sigma', name: 'Sigma', cfKey: 'sigma' },
    { id: 'winston', name: 'Winston', cfKey: 'winston' },
    { id: 'wreckingball', name: 'Wrecking Ball', cfKey: 'wrecking-ball' },
    { id: 'zarya', name: 'Zarya', cfKey: 'zarya' },
  ],
  damage: [
    { id: 'anran', name: 'Anran (안란)', cfKey: 'anran' },
    { id: 'ashe', name: 'Ashe', cfKey: 'ashe' },
    { id: 'bastion', name: 'Bastion', cfKey: 'bastion' },
    { id: 'cassidy', name: 'Cassidy', cfKey: 'cassidy' },
    { id: 'echo', name: 'Echo', cfKey: 'echo' },
    { id: 'emre', name: 'Emre (엠레)', cfKey: 'emre' },
    { id: 'freja', name: 'Freja (프레야)', cfKey: 'freja' },
    { id: 'genji', name: 'Genji', cfKey: 'genji' },
    { id: 'hanzo', name: 'Hanzo', cfKey: 'hanzo' },
    { id: 'junkrat', name: 'Junkrat', cfKey: 'junkrat' },
    { id: 'mei', name: 'Mei', cfKey: 'mei' },
    { id: 'pharah', name: 'Pharah', cfKey: 'pharah' },
    { id: 'reaper', name: 'Reaper', cfKey: 'reaper' },
    { id: 'sierra', name: 'Sierra (시에라)', cfKey: 'sierra' },
    { id: 'sojourn', name: 'Sojourn', cfKey: 'sojourn' },
    { id: 'soldier76', name: 'Soldier: 76', cfKey: 'soldier-76' },
    { id: 'sombra', name: 'Sombra', cfKey: 'sombra' },
    { id: 'symmetra', name: 'Symmetra', cfKey: 'symmetra' },
    { id: 'torbjorn', name: 'Torbjörn', cfKey: 'torbjorn' },
    { id: 'tracer', name: 'Tracer', cfKey: 'tracer' },
    { id: 'vendetta', name: 'Vendetta (베데타)', cfKey: 'vendetta' },
    { id: 'venture', name: 'Venture', cfKey: 'venture' },
    { id: 'widowmaker', name: 'Widowmaker', cfKey: 'widowmaker' },
  ],
  support: [
    { id: 'ana', name: 'Ana', cfKey: 'ana' },
    { id: 'baptiste', name: 'Baptiste', cfKey: 'baptiste' },
    { id: 'brigitte', name: 'Brigitte', cfKey: 'brigitte' },
    { id: 'illari', name: 'Illari', cfKey: 'illari' },
    { id: 'juno', name: 'Juno', cfKey: 'juno' },
    { id: 'kiriko', name: 'Kiriko', cfKey: 'kiriko' },
    { id: 'lifeweaver', name: 'Lifeweaver', cfKey: 'lifeweaver' },
    { id: 'lucio', name: 'Lúcio', cfKey: 'lucio' },
    { id: 'mercy', name: 'Mercy', cfKey: 'mercy' },
    { id: 'mizuki', name: 'Mizuki (미즈키)', cfKey: 'mizuki' },
    { id: 'moira', name: 'Moira', cfKey: 'moira' },
    { id: 'wuyang', name: 'Wuyang (우양)', cfKey: 'wuyang' },
    { id: 'zenyatta', name: 'Zenyatta', cfKey: 'zenyatta' },
  ],
};

export const ALL_HEROES = [
  ...HEROES.tank.map(h => ({ ...h, role: 'tank', roleName: '탱커' })),
  ...HEROES.damage.map(h => ({ ...h, role: 'damage', roleName: '딜러' })),
  ...HEROES.support.map(h => ({ ...h, role: 'support', roleName: '서포터' })),
];

/** 포트레이트 캐시 (cfKey → URL) */
let _portraitCache = null;

/** OverFast API에서 영웅 포트레이트 URL을 가져와 캐시에 저장 */
export async function loadHeroPortraits() {
  if (_portraitCache) return _portraitCache;
  try {
    const res = await fetch('https://overfast-api.tekrop.fr/heroes?locale=ko-kr');
    const data = await res.json();
    _portraitCache = {};
    for (const hero of data) {
      if (hero.key && hero.portrait) {
        _portraitCache[hero.key] = hero.portrait;
      }
    }
  } catch {
    _portraitCache = {};
  }
  return _portraitCache;
}

/** 영웅 포트레이트 URL — 캐시 우선, fallback: Blizzard CloudFront */
export function getHeroPortraitUrl(heroId) {
  const hero = ALL_HEROES.find(h => h.id === heroId);
  if (!hero) return null;
  if (_portraitCache && _portraitCache[hero.cfKey]) return _portraitCache[hero.cfKey];
  return `https://d15f34w2p8l1cc.cloudfront.net/overwatch/${hero.cfKey}.png`;
}

const TIER_RANKS = ['브론즈', '실버', '골드', '플래티넘', '다이아몬드', '마스터', '그랜드마스터', '챔피언'];

/** 상세 티어 목록 (등급명 + 5~1, 탑500) */
export const TIERS_DETAILED = [
  '없음',
  '언랭',
  ...TIER_RANKS.flatMap(rank => [rank, ...([5, 4, 3, 2, 1].map(n => `${rank} ${n}`))]),
  '탑500',
];

// 하위 호환 유지
export const TIERS = TIERS_DETAILED;
