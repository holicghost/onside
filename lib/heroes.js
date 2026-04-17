export const HEROES = {
  tank: [
    { id: 'domina', name: '도미나', cfKey: 'domina' },
    { id: 'dva', name: 'D.Va', cfKey: 'dva' },
    { id: 'doomfist', name: '둠피스트', cfKey: 'doomfist' },
    { id: 'hazard', name: '해저드', cfKey: 'hazard' },
    { id: 'junkerqueen', name: '정커 퀸', cfKey: 'junker-queen' },
    { id: 'mauga', name: '마우가', cfKey: 'mauga' },
    { id: 'orisa', name: '오리사', cfKey: 'orisa' },
    { id: 'ramattra', name: '라마트라', cfKey: 'ramattra' },
    { id: 'reinhardt', name: '라인하르트', cfKey: 'reinhardt' },
    { id: 'roadhog', name: '로드호그', cfKey: 'roadhog' },
    { id: 'sigma', name: '시그마', cfKey: 'sigma' },
    { id: 'winston', name: '윈스턴', cfKey: 'winston' },
    { id: 'wreckingball', name: '레킹볼', cfKey: 'wrecking-ball' },
    { id: 'zarya', name: '자리야', cfKey: 'zarya' },
  ],
  damage: [
    { id: 'anran', name: '안란', cfKey: 'anran' },
    { id: 'ashe', name: '애쉬', cfKey: 'ashe' },
    { id: 'bastion', name: '바스티온', cfKey: 'bastion' },
    { id: 'cassidy', name: '캐서디', cfKey: 'cassidy' },
    { id: 'echo', name: '에코', cfKey: 'echo' },
    { id: 'emre', name: '엠레', cfKey: 'emre' },
    { id: 'freja', name: '프레야', cfKey: 'freja' },
    { id: 'genji', name: '겐지', cfKey: 'genji' },
    { id: 'hanzo', name: '한조', cfKey: 'hanzo' },
    { id: 'junkrat', name: '정크랫', cfKey: 'junkrat' },
    { id: 'mei', name: '메이', cfKey: 'mei' },
    { id: 'pharah', name: '파라', cfKey: 'pharah' },
    { id: 'reaper', name: '리퍼', cfKey: 'reaper' },
    { id: 'sierra', name: '시에라', cfKey: 'sierra' },
    { id: 'sojourn', name: '소전', cfKey: 'sojourn' },
    { id: 'soldier76', name: '솔저: 76', cfKey: 'soldier-76' },
    { id: 'sombra', name: '솜브라', cfKey: 'sombra' },
    { id: 'symmetra', name: '시메트라', cfKey: 'symmetra' },
    { id: 'torbjorn', name: '토르비욘', cfKey: 'torbjorn' },
    { id: 'tracer', name: '트레이서', cfKey: 'tracer' },
    { id: 'vendetta', name: '벤데타', cfKey: 'vendetta' },
    { id: 'venture', name: '벤처', cfKey: 'venture' },
    { id: 'widowmaker', name: '위도우메이커', cfKey: 'widowmaker' },
  ],
  support: [
    { id: 'ana', name: '아나', cfKey: 'ana' },
    { id: 'baptiste', name: '바티스트', cfKey: 'baptiste' },
    { id: 'brigitte', name: '브리기테', cfKey: 'brigitte' },
    { id: 'illari', name: '일라리', cfKey: 'illari' },
    { id: 'juno', name: '주노', cfKey: 'juno' },
    { id: 'kiriko', name: '키리코', cfKey: 'kiriko' },
    { id: 'lifeweaver', name: '라이프위버', cfKey: 'lifeweaver' },
    { id: 'lucio', name: '루시우', cfKey: 'lucio' },
    { id: 'mercy', name: '메르시', cfKey: 'mercy' },
    { id: 'mizuki', name: '미즈키', cfKey: 'mizuki' },
    { id: 'moira', name: '모이라', cfKey: 'moira' },
    { id: 'wuyang', name: '우양', cfKey: 'wuyang' },
    { id: 'zenyatta', name: '젠야타', cfKey: 'zenyatta' },
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
    if (!res.ok) throw new Error('API error');
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
