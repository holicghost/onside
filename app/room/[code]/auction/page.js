'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ref, onValue, update } from 'firebase/database';
import { db } from '@/lib/firebase';
import { getHeroPortraitUrl, loadHeroPortraits, ALL_HEROES } from '@/lib/heroes';

const ROLE_BG = { tank: 'bg-yellow-900/50 text-yellow-300', damage: 'bg-red-900/50 text-red-300', support: 'bg-green-900/50 text-green-300' };
const ROLE_LABEL = { tank: '탱커', damage: '딜러', support: '서포터' };
const toArr = (val) => !val ? [] : Array.isArray(val) ? val : Object.values(val);

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={copy} className={`px-3 py-1 text-sm rounded-lg transition-all flex-shrink-0 ${copied ? 'bg-green-700 text-green-200' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
      {copied ? '복사됨!' : '복사'}
    </button>
  );
}

function BlurCode({ text, className = '' }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);
  const handleClick = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
    setRevealed(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setRevealed(false), 3000);
  };
  return (
    <span className={`relative inline-block cursor-pointer select-none ${className}`} onClick={handleClick}>
      <span style={{ filter: revealed ? 'none' : 'blur(6px)', transition: 'filter 0.3s' }}>{text}</span>
      {copied && (
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-green-700 text-green-100 text-xs font-bold rounded-full whitespace-nowrap pointer-events-none z-50">복사됨!</span>
      )}
    </span>
  );
}

export default function AuctionPage() {
  const { code } = useParams();
  const router = useRouter();

  const [role, setRole] = useState('spectator');
  const [captainId, setCaptainId] = useState(null);
  const [roomInfo, setRoomInfo] = useState(null);
  const [captains, setCaptains] = useState({});
  const [players, setPlayers] = useState({});
  const [auction, setAuction] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [countdownLeft, setCountdownLeft] = useState(0);
  const [maxDuration, setMaxDuration] = useState(10000);
  const [bidAmount, setBidAmount] = useState('');
  const [bidError, setBidError] = useState('');
  const [showLinks, setShowLinks] = useState(false);
  const [origin, setOrigin] = useState('');

  const auctionRef = useRef(null);
  const captainsRef = useRef({});
  const roleRef = useRef('spectator');
  const lastTimerEndRef = useRef(null);
  const goToNextPlayerRef = useRef(null);

  useEffect(() => { auctionRef.current = auction; }, [auction]);
  useEffect(() => { captainsRef.current = captains; }, [captains]);
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { setOrigin(window.location.origin); }, []);

  // 영웅 포트레이트 프리로드 (OverFast API)
  const [, setPortraitsReady] = useState(false);
  useEffect(() => {
    loadHeroPortraits().then(() => setPortraitsReady(true));
  }, []);

  useEffect(() => {
    const r = localStorage.getItem('ow_role') || 'spectator';
    const cid = localStorage.getItem('ow_captain_id') || null;
    setRole(r);
    setCaptainId(cid);
  }, []);

  useEffect(() => {
    if (!code) return;
    const unsubs = [
      onValue(ref(db, `rooms/${code}/info`), s => setRoomInfo(s.val())),
      onValue(ref(db, `rooms/${code}/captains`), s => setCaptains(s.val() || {})),
      onValue(ref(db, `rooms/${code}/players`), s => setPlayers(s.val() || {})),
      onValue(ref(db, `rooms/${code}/auction`), s => setAuction(s.val())),
    ];
    return () => unsubs.forEach(u => u());
  }, [code]);

  // Bidding timer (100ms for decimal)
  useEffect(() => {
    if (!auction?.timerEnd || auction?.status !== 'bidding') { setTimeLeft(0); return; }
    const tick = () => setTimeLeft(Math.max(0, auction.timerEnd - Date.now()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [auction?.timerEnd, auction?.status]);

  // Track max duration for progress bar (reset on each new timerEnd)
  useEffect(() => {
    if (!auction?.timerEnd || auction?.status !== 'bidding') return;
    if (auction.timerEnd !== lastTimerEndRef.current) {
      lastTimerEndRef.current = auction.timerEnd;
      setMaxDuration(Math.max(1000, auction.timerEnd - Date.now()));
    }
  }, [auction?.timerEnd, auction?.status]);

  // Pre-player countdown
  useEffect(() => {
    if (!auction?.countdownEnd || auction?.status !== 'countdown') { setCountdownLeft(0); return; }
    const tick = () => setCountdownLeft(Math.max(0, auction.countdownEnd - Date.now()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [auction?.countdownEnd, auction?.status]);

  // Auto-start bidding after countdown (admin only)
  useEffect(() => {
    if (countdownLeft !== 0 || auction?.status !== 'countdown' || roleRef.current !== 'admin') return;
    startBidding();
  }, [countdownLeft]);

  // Auto-finalize when bidding timer hits 0 (admin only)
  useEffect(() => {
    if (timeLeft !== 0 || auction?.status !== 'bidding' || roleRef.current !== 'admin') return;
    finalizeSale();
  }, [timeLeft]);

  // Auto-advance 2s after sold/passed (admin only)
  useEffect(() => {
    if (!['sold', 'passed'].includes(auction?.status) || roleRef.current !== 'admin') return;
    const timer = setTimeout(() => {
      if (['sold', 'passed'].includes(auctionRef.current?.status)) {
        goToNextPlayerRef.current?.();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [auction?.status]);

  const startBidding = useCallback(async () => {
    const a = auctionRef.current;
    if (!a || a.status !== 'countdown') return;
    await update(ref(db), {
      [`rooms/${code}/auction/status`]: 'bidding',
      [`rooms/${code}/auction/timerEnd`]: Date.now() + 10000,
      [`rooms/${code}/auction/countdownEnd`]: null,
    });
  }, [code]);

  const finalizeSale = useCallback(async () => {
    const a = auctionRef.current;
    const caps = captainsRef.current;
    if (!a || a.status !== 'bidding') return;
    const updates = {};
    if (a.currentBidCaptainId && a.currentBid > 0) {
      const cap = caps[a.currentBidCaptainId];
      updates[`rooms/${code}/auction/status`] = 'sold';
      updates[`rooms/${code}/players/${a.currentPlayerId}/soldTo`] = a.currentBidCaptainId;
      updates[`rooms/${code}/players/${a.currentPlayerId}/soldPrice`] = a.currentBid;
      updates[`rooms/${code}/captains/${a.currentBidCaptainId}/budget`] = Math.max(0, (cap?.budget || 0) - a.currentBid);
      updates[`rooms/${code}/auction/history/${Date.now()}`] = { playerId: a.currentPlayerId, captainId: a.currentBidCaptainId, price: a.currentBid, timestamp: Date.now() };
    } else {
      updates[`rooms/${code}/auction/status`] = 'passed';
    }
    updates[`rooms/${code}/auction/timerEnd`] = null;
    await update(ref(db), updates);
  }, [code]);

  const buildPlayerOrder = (playerMap) => {
    const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
    const GROUPS = [
      { tierType: '고티어', position: '딜러' },
      { tierType: '저티어', position: '딜러' },
      { tierType: '고티어', position: '탱커' },
      { tierType: '저티어', position: '탱커' },
      { tierType: '고티어', position: '힐러' },
      { tierType: '저티어', position: '힐러' },
    ];
    const ordered = [];
    for (const g of GROUPS) {
      const group = Object.entries(playerMap)
        .filter(([, p]) => p.tierType === g.tierType && p.position === g.position)
        .map(([id]) => id);
      ordered.push(...shuffle(group));
    }
    const assigned = new Set(ordered);
    const rest = Object.keys(playerMap).filter(id => !assigned.has(id));
    ordered.push(...shuffle(rest));
    return ordered;
  };

  const startAuction = async () => {
    const ordered = buildPlayerOrder(players);
    await update(ref(db), {
      [`rooms/${code}/auction/playerOrder`]: ordered,
      [`rooms/${code}/auction/currentIndex`]: 0,
      [`rooms/${code}/auction/currentPlayerId`]: ordered[0],
      [`rooms/${code}/auction/status`]: 'countdown',
      [`rooms/${code}/auction/currentBid`]: 0,
      [`rooms/${code}/auction/currentBidCaptainId`]: null,
      [`rooms/${code}/auction/countdownEnd`]: Date.now() + 10000,
      [`rooms/${code}/auction/timerEnd`]: null,
    });
  };

  const goToNextPlayer = useCallback(async () => {
    const a = auctionRef.current;
    if (!a) return;
    const order = toArr(a.playerOrder);
    const nextIndex = (a.currentIndex || 0) + 1;
    if (nextIndex >= order.length) {
      await update(ref(db), { [`rooms/${code}/auction/status`]: 'done', [`rooms/${code}/info/status`]: 'result' });
      return;
    }
    await update(ref(db), {
      [`rooms/${code}/auction/currentIndex`]: nextIndex,
      [`rooms/${code}/auction/currentPlayerId`]: order[nextIndex],
      [`rooms/${code}/auction/status`]: 'countdown',
      [`rooms/${code}/auction/currentBid`]: 0,
      [`rooms/${code}/auction/currentBidCaptainId`]: null,
      [`rooms/${code}/auction/countdownEnd`]: Date.now() + 10000,
      [`rooms/${code}/auction/timerEnd`]: null,
    });
  }, [code]);

  useEffect(() => { goToNextPlayerRef.current = goToNextPlayer; }, [goToNextPlayer]);

  const startReAuction = async () => {
    const unsoldIds = Object.entries(players).filter(([, p]) => !p.soldTo).map(([id]) => id);
    if (!unsoldIds.length) return;
    const shuffled = [...unsoldIds].sort(() => Math.random() - 0.5);
    await update(ref(db), {
      [`rooms/${code}/auction/playerOrder`]: shuffled,
      [`rooms/${code}/auction/currentIndex`]: 0,
      [`rooms/${code}/auction/currentPlayerId`]: shuffled[0],
      [`rooms/${code}/auction/status`]: 'countdown',
      [`rooms/${code}/auction/currentBid`]: 0,
      [`rooms/${code}/auction/currentBidCaptainId`]: null,
      [`rooms/${code}/auction/countdownEnd`]: Date.now() + 10000,
      [`rooms/${code}/auction/timerEnd`]: null,
      [`rooms/${code}/info/status`]: 'auction',
    });
  };

  const pauseAuction = async () => {
    const remaining = Math.max(1000, (auction?.timerEnd || Date.now()) - Date.now());
    await update(ref(db), {
      [`rooms/${code}/auction/status`]: 'paused',
      [`rooms/${code}/auction/timerEnd`]: null,
      [`rooms/${code}/auction/pausedTimeLeft`]: remaining,
    });
  };

  const resumeAuction = async () => {
    await update(ref(db), {
      [`rooms/${code}/auction/status`]: 'bidding',
      [`rooms/${code}/auction/timerEnd`]: Date.now() + (auction?.pausedTimeLeft || 10000),
      [`rooms/${code}/auction/pausedTimeLeft`]: null,
    });
  };

  const passCurrent = async () => {
    await update(ref(db), {
      [`rooms/${code}/auction/status`]: 'passed',
      [`rooms/${code}/auction/timerEnd`]: null,
    });
  };

  const placeBid = async (amount) => {
    setBidError('');
    const a = auction;
    const amt = Number(amount);
    if (!a || a.status !== 'bidding') return;
    if (!amt || amt <= (a.currentBid || 0)) { setBidError('현재 입찰가보다 높아야 합니다.'); return; }
    const myCap = captains[captainId];
    if (!myCap || amt > myCap.budget) { setBidError('예산이 부족합니다.'); return; }
    const newTimerEnd = Math.max(a.timerEnd || Date.now(), Date.now()) + 5000;
    await update(ref(db), {
      [`rooms/${code}/auction/currentBid`]: amt,
      [`rooms/${code}/auction/currentBidCaptainId`]: captainId,
      [`rooms/${code}/auction/timerEnd`]: newTimerEnd,
    });
  };

  // Derived
  const currentPlayer = auction?.currentPlayerId ? players[auction.currentPlayerId] : null;
  const captainsList = Object.entries(captains).map(([id, c]) => ({ id, ...c }));
  const myCaptain = captainId ? captains[captainId] : null;
  const playerOrder = toArr(auction?.playerOrder);
  const currentIdx = auction?.currentIndex || 0;
  const queuePlayers = playerOrder.slice(currentIdx + 1).map(pid => players[pid]).filter(Boolean);
  const nextQueuePlayer = queuePlayers[0] || null;
  const historyList = auction?.history ? Object.values(auction.history).sort((a, b) => b.timestamp - a.timestamp) : [];
  const unsoldPlayers = Object.values(players).filter(p => !p.soldTo);
  const curBid = auction?.currentBid || 0;
  const myBudget = myCaptain?.budget || 0;
  const quickBids = [
    { label: '+10', val: curBid + 10 },
    { label: '+20', val: curBid + 20 },
    { label: '+50', val: curBid + 50 },
    { label: '최대', val: myBudget },
  ].filter(q => q.val > curBid && q.val <= myBudget);

  const displayTime = (timeLeft / 1000).toFixed(1);
  const displayCountdown = Math.ceil(countdownLeft / 1000);
  const progressPct = maxDuration > 0 ? Math.max(0, (timeLeft / maxDuration) * 100) : 0;

  const statusLabel = { idle: '⏳ 대기 중', countdown: '⏱ 경매 준비', bidding: '🔨 경매 중', paused: '⏸ 일시정지', sold: '✅ 낙찰', passed: '⏭ 유찰', done: '🏆 완료' };
  const statusColor = {
    idle: 'bg-gray-800 text-gray-400',
    countdown: 'bg-yellow-900/60 text-yellow-300 border border-yellow-700',
    bidding: 'bg-green-900/60 text-green-300 border border-green-700',
    paused: 'bg-orange-900/60 text-orange-300 border border-orange-700',
    sold: 'bg-blue-900/60 text-blue-300 border border-blue-700',
    passed: 'bg-gray-700/60 text-gray-400',
    done: 'bg-purple-900/60 text-purple-300 border border-purple-700',
  };

  const bidderCap = auction?.currentBidCaptainId ? captains[auction.currentBidCaptainId] : null;

  // Reusable player card for center panel
  const PlayerCard = ({ player }) => {
    if (!player) return null;
    const heroIdsList = toArr(player.heroIds).filter(Boolean);
    return (
      <div className="w-full bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden">
        {/* Photo + info row */}
        <div className="flex gap-4 p-5">
          <div className="w-28 h-36 rounded-xl overflow-hidden bg-gray-800 flex-shrink-0 flex items-center justify-center">
            {player.photo
              ? <img src={player.photo} alt={player.name} className="w-full h-full object-cover" />
              : <span className="text-5xl">👤</span>
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex gap-1.5 flex-wrap mb-1.5">
              {player.tierType && (
                <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${
                  player.tierType === '고티어'
                    ? 'bg-rose-900/60 text-rose-300 border-rose-700/60'
                    : 'bg-sky-900/60 text-sky-300 border-sky-700/60'
                }`}>{player.tierType}</span>
              )}
              {player.position && (
                <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${
                  player.position === '탱커' ? 'bg-yellow-900/60 text-yellow-300 border-yellow-700/60' :
                  player.position === '딜러' ? 'bg-red-900/60 text-red-300 border-red-700/60' :
                  'bg-green-900/60 text-green-300 border-green-700/60'
                }`}>{player.position}</span>
              )}
              {player.tierCurrent && (
                <span className="px-2 py-0.5 bg-purple-900/60 text-purple-300 text-xs font-bold rounded-full border border-purple-700/60">{player.tierCurrent}</span>
              )}
              {player.heroRole && (
                <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${ROLE_BG[player.heroRole] || 'bg-gray-700 text-gray-300'}`}>
                  {ROLE_LABEL[player.heroRole] || player.heroRole}
                </span>
              )}
              {curBid > 0 && auction?.status === 'bidding' && (
                <span className="px-2 py-0.5 bg-orange-500/80 text-white text-xs font-bold rounded-full animate-pulse">입찰 중</span>
              )}
            </div>
            <h2 className="text-3xl font-black text-white leading-tight">{player.name}</h2>
            <div className="grid grid-cols-3 gap-1.5 mt-2">
              {[
                { label: '현재티어', val: player.tierCurrent, color: 'text-purple-400' },
                { label: '전시즌', val: player.tierPrevious, color: 'text-gray-300' },
                { label: '역대최고', val: player.tierBest, color: 'text-yellow-400' },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-gray-800/80 rounded-lg px-2 py-1.5">
                  <p className="text-[9px] text-gray-500 mb-0.5 uppercase tracking-wide">{label}</p>
                  <p className={`text-xs font-bold ${color} leading-tight`}>{val || '—'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Hero portraits */}
        {heroIdsList.length > 0 && (
          <div className="px-5 pb-4 flex gap-3">
            {heroIdsList.map((hid, i) => {
              const url = getHeroPortraitUrl(hid);
              const hero = ALL_HEROES.find(h => h.id === hid);
              const roleKey = hero?.role;
              const roleName = ROLE_LABEL[roleKey] || '';
              const roleColor = { tank: 'text-yellow-300', damage: 'text-red-300', support: 'text-green-300' }[roleKey] || 'text-gray-400';
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-700 border border-gray-600 flex items-center justify-center flex-shrink-0">
                    {url ? (
                      <img src={url} alt={hero?.name || hid} className="absolute inset-0 w-full h-full object-cover"
                        onError={e => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <span className="text-gray-500 text-xl">?</span>
                    )}
                    {roleName && (
                      <span className={`absolute bottom-0 left-0 right-0 text-center text-[8px] font-bold py-0.5 ${roleColor}`}
                        style={{ background: 'rgba(0,0,0,0.7)' }}>
                        {roleName}
                      </span>
                    )}
                  </div>
                  <span className="text-gray-400 text-[9px] text-center leading-tight w-14 truncate">{hero?.name || hid}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Style tag */}
        {player.style && (
          <div className="px-5 pb-3">
            <span className="px-3 py-1 bg-gray-800 text-gray-300 rounded-full text-xs border border-gray-600">⚔️ {player.style}</span>
          </div>
        )}

        {/* Comment speech bubble */}
        {player.comment && (
          <div className="mx-5 mb-4 bg-gray-800 rounded-2xl p-3 border-l-4 border-orange-500">
            <p className="text-gray-300 text-sm leading-relaxed">" {player.comment} "</p>
          </div>
        )}

        {/* Current bid + bidder */}
        <div className="px-5 pb-5 flex items-end justify-between">
          <div>
            <p className="text-gray-500 text-xs mb-0.5">현재 입찰</p>
            <p className="text-4xl font-black text-orange-400 leading-none tabular-nums">
              {curBid > 0 ? `${curBid} pt` : '—'}
            </p>
            {bidderCap && (
              <p className="text-white text-sm font-bold mt-1">👑 {bidderCap.name} 입찰 중</p>
            )}
          </div>
          {auction?.status === 'sold' && bidderCap && (
            <div className="text-right">
              <p className="text-blue-300 text-2xl font-black">낙찰!</p>
              <p className="text-gray-400 text-sm">{bidderCap.name} 팀</p>
            </div>
          )}
          {auction?.status === 'passed' && (
            <div className="text-right">
              <p className="text-gray-400 text-2xl font-black">유찰</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0f0f1a' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800 flex-shrink-0 gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-white truncate">{roomInfo?.name || '경매'}</h1>
          <span className="text-sm text-gray-500">코드: <BlurCode text={code} className="font-mono text-orange-400 font-bold" /></span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${
            role === 'admin' ? 'bg-purple-900 text-purple-300' :
            role === 'captain' ? 'bg-orange-900 text-orange-300' : 'bg-gray-800 text-gray-400'
          }`}>
            {role === 'admin' ? '관리자' : role === 'captain' ? (captains[captainId]?.name || '팀장') : '관전자'}
          </span>
        </div>
      </header>

      {/* 3-column layout */}
      <div className="flex-1 grid overflow-hidden" style={{ gridTemplateColumns: '240px 1fr 240px' }}>

        {/* LEFT: Team Rosters */}
        <aside className="border-r border-gray-800 overflow-y-auto p-4 space-y-3">
          <h2 className="text-base font-bold text-gray-300 sticky top-0 bg-[#0f0f1a] pb-2">팀 로스터</h2>
          {captainsList.map(cap => {
            const teamPlayers = Object.values(players).filter(p => p.soldTo === cap.id);
            const isLeader = cap.id === auction?.currentBidCaptainId;
            return (
              <div key={cap.id} className={`rounded-xl p-3 border transition-all ${isLeader ? 'border-orange-500 bg-orange-950/30' : 'border-gray-700 bg-gray-900/40'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {cap.photo ? <img src={cap.photo} alt={cap.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" /> : <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-base flex-shrink-0">👤</div>}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-bold text-white text-sm truncate">{cap.name}</p>
                      {cap.position && (
                        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full flex-shrink-0 ${
                          cap.position === '탱커' ? 'bg-yellow-900/60 text-yellow-300' :
                          cap.position === '딜러' ? 'bg-red-900/60 text-red-300' :
                          'bg-green-900/60 text-green-300'
                        }`}>{cap.position}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">예산 <span className="text-green-400 font-bold">{cap.budget}</span><span className="text-gray-600">/{roomInfo?.budget}</span>P</p>
                  </div>
                </div>
                {teamPlayers.length > 0
                  ? <div className="space-y-1 border-t border-gray-700 pt-2">
                      {teamPlayers.map(p => (
                        <div key={p.id} className="flex items-center gap-2 text-xs">
                          {p.photo ? <img src={p.photo} alt={p.name} className="w-5 h-5 rounded-full object-cover" /> : <span>👤</span>}
                          <span className="text-gray-300 truncate flex-1">{p.name}</span>
                          <span className="text-orange-400 font-bold">{p.soldPrice}P</span>
                        </div>
                      ))}
                    </div>
                  : <p className="text-xs text-gray-600 border-t border-gray-800 pt-2">팀원 없음</p>
                }
              </div>
            );
          })}

          {/* Link sharing — bottom of left panel */}
          <div className="border-t border-gray-800 pt-3">
            <button
              onClick={() => setShowLinks(v => !v)}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-300 transition-all w-full"
            >
              <span>🔗</span>
              <span>링크 공유</span>
              <span className="ml-auto">{showLinks ? '▲' : '▼'}</span>
            </button>
            {showLinks && (
              <div className="mt-3 space-y-2">
                {captainsList.map(cap => (
                  <div key={cap.id} className="flex items-center gap-2">
                    <span className="text-white text-xs font-bold truncate flex-1 min-w-0">{cap.name}</span>
                    <CopyButton text={`${origin}/room/${code}/captain/${cap.id}`} />
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <span className="text-blue-400 text-xs font-bold flex-shrink-0">관전자</span>
                  <CopyButton text={`${origin}/room/${code}/spectator`} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-purple-400 text-xs font-bold flex-shrink-0">관리자</span>
                  <CopyButton text={`${origin}/room/${code}/admin`} />
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* CENTER: Main auction */}
        <main className="overflow-y-auto p-5 flex flex-col gap-4">

          {/* Status pill */}
          <div className={`px-5 py-2 rounded-full text-base font-bold self-center ${statusColor[auction?.status] || 'bg-gray-800 text-gray-400'}`}>
            {statusLabel[auction?.status] || '⏳ 대기 중'}
          </div>

          {/* Pre-player countdown */}
          {auction?.status === 'countdown' && currentPlayer && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-yellow-400 text-sm font-bold">다음 선수 경매 준비</p>
              <PlayerCard player={currentPlayer} />
              <div key={displayCountdown} className="text-7xl font-black text-yellow-400 animate-count-down">{displayCountdown}</div>
              <p className="text-gray-500 text-sm">초 후 경매 시작</p>
              {/* Countdown progress bar */}
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-400 rounded-full transition-none"
                  style={{ width: `${Math.max(0, Math.min(100, (countdownLeft / 10000) * 100))}%` }}
                />
              </div>
            </div>
          )}

          {/* Active / resolved player */}
          {['bidding', 'paused', 'sold', 'passed'].includes(auction?.status) && (
            <PlayerCard player={currentPlayer} />
          )}

          {/* Timer + progress bar */}
          {auction?.status === 'bidding' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-gray-800 rounded-xl px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-white font-bold text-sm">입찰 중</span>
                </div>
                <span className={`text-4xl font-black tabular-nums leading-none ${
                  timeLeft <= 3000 ? 'text-red-500 animate-timer-blink' : timeLeft <= 6000 ? 'text-yellow-400' : 'text-white'
                }`}>
                  {displayTime}초
                </span>
              </div>
              {/* Shrinking progress bar */}
              <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-none ${
                    progressPct > 60 ? 'bg-green-500' : progressPct > 30 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {/* NEXT preview */}
              {nextQueuePlayer && (
                <div className="flex items-center gap-2 bg-gray-800/60 rounded-xl px-4 py-2">
                  <span className="text-gray-500 text-xs font-bold flex-shrink-0">NEXT</span>
                  {nextQueuePlayer.photo ? <img src={nextQueuePlayer.photo} alt={nextQueuePlayer.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" /> : <span className="flex-shrink-0">👤</span>}
                  <span className="text-gray-300 text-sm font-bold flex-1 truncate">{nextQueuePlayer.name}</span>
                  {nextQueuePlayer.tierCurrent && <span className="text-purple-400 text-xs flex-shrink-0">{nextQueuePlayer.tierCurrent}</span>}
                </div>
              )}
            </div>
          )}

          {auction?.status === 'paused' && (
            <div className="text-center bg-orange-900/20 border border-orange-800 rounded-xl p-3">
              <p className="text-orange-400 font-bold">⏸ 일시정지됨</p>
              <p className="text-gray-500 text-sm">남은 시간: {((auction.pausedTimeLeft || 0) / 1000).toFixed(1)}초</p>
            </div>
          )}

          {/* Auto-advance notice */}
          {['sold', 'passed'].includes(auction?.status) && role === 'admin' && (
            <div className="bg-gray-800/50 rounded-xl p-3 text-center">
              <p className="text-gray-400 text-sm">2초 후 다음 선수로 이동...</p>
              <button onClick={goToNextPlayer} className="mt-2 px-5 py-1.5 text-sm font-bold bg-blue-600 hover:bg-blue-500 rounded-xl transition-all">
                ▶ 지금 이동
              </button>
            </div>
          )}

          {/* Captain bid UI */}
          {role === 'captain' && auction?.status === 'bidding' && captainId && (
            <div className="space-y-3">
              <p className="text-center text-gray-400 text-sm">
                내 포인트: <span className="text-green-400 font-black text-lg">{myBudget}pt</span>
              </p>
              {bidError && <p className="text-red-400 text-center text-sm">{bidError}</p>}
              <div className="grid grid-cols-4 gap-2">
                {quickBids.map(q => (
                  <button key={q.label}
                    onClick={() => { placeBid(q.val); setBidAmount(String(q.val)); }}
                    className="py-3 text-center font-bold bg-orange-900/60 hover:bg-orange-800 border border-orange-700 rounded-xl transition-all text-orange-300 active:scale-95">
                    <div className="text-sm">{q.label}</div>
                    <div className="text-xs text-orange-400 mt-0.5">{q.val}pt</div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={bidAmount}
                  onChange={e => setBidAmount(e.target.value)}
                  placeholder={String(curBid + 1)}
                  className="flex-1 px-4 py-3 text-2xl font-bold bg-gray-800 border border-gray-600 rounded-xl text-center focus:border-orange-400 focus:outline-none"
                />
                <button
                  onClick={() => placeBid(Number(bidAmount))}
                  disabled={!bidAmount || Number(bidAmount) <= curBid || Number(bidAmount) > myBudget}
                  className="px-6 py-3 text-xl font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all"
                >
                  입찰
                </button>
              </div>
            </div>
          )}

          {/* Admin controls */}
          {role === 'admin' && (
            <div className="space-y-2">
              {(!auction || auction.status === 'idle') && (
                <button onClick={startAuction} className="w-full py-4 text-2xl font-bold bg-green-600 hover:bg-green-500 rounded-xl transition-all">
                  🔨 경매 시작
                </button>
              )}
              {auction?.status === 'bidding' && (
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={pauseAuction} className="py-3 text-sm font-bold bg-orange-700 hover:bg-orange-600 rounded-xl transition-all">⏸ 일시정지</button>
                  <button onClick={finalizeSale} className="py-3 text-sm font-bold bg-blue-700 hover:bg-blue-600 rounded-xl transition-all">🔨 강제낙찰</button>
                  <button onClick={passCurrent} className="py-3 text-sm font-bold bg-gray-600 hover:bg-gray-500 rounded-xl transition-all">⏭ 강제유찰</button>
                </div>
              )}
              {auction?.status === 'paused' && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={resumeAuction} className="py-3 text-lg font-bold bg-green-600 hover:bg-green-500 rounded-xl transition-all">▶ 재진행</button>
                  <button onClick={passCurrent} className="py-3 text-lg font-bold bg-gray-600 hover:bg-gray-500 rounded-xl transition-all">⏭ 강제유찰</button>
                </div>
              )}
              {auction?.status === 'done' && (
                <div className="space-y-2">
                  {unsoldPlayers.length > 0 && (
                    <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4">
                      <p className="text-yellow-300 text-sm font-bold mb-2">유찰 선수 {unsoldPlayers.length}명</p>
                      {unsoldPlayers.slice(0, 4).map(p => <p key={p.id} className="text-gray-300 text-xs">• {p.name}</p>)}
                      {unsoldPlayers.length > 4 && <p className="text-gray-500 text-xs">외 {unsoldPlayers.length - 4}명...</p>}
                      <button onClick={startReAuction} className="w-full mt-3 py-2 text-sm font-bold bg-yellow-600 hover:bg-yellow-500 rounded-xl transition-all">
                        🔄 유찰 선수 재경매
                      </button>
                    </div>
                  )}
                  <button onClick={() => router.push(`/room/${code}/result`)} className="w-full py-4 text-xl font-bold bg-purple-600 hover:bg-purple-500 rounded-xl transition-all">
                    🏆 결과 보기
                  </button>
                </div>
              )}
            </div>
          )}

          {(!auction || auction?.status === 'idle') && role !== 'admin' && (
            <div className="text-center py-16 text-gray-600 text-lg">관리자가 경매를 시작할 때까지 대기하세요.</div>
          )}
        </main>

        {/* RIGHT: Queue + History */}
        <aside className="border-l border-gray-800 overflow-y-auto p-4 space-y-6">
          <div>
            <h2 className="text-base font-bold text-gray-300 sticky top-0 bg-[#0f0f1a] pb-2">
              대기 <span className="text-orange-400">{queuePlayers.length}</span>명
            </h2>
            {queuePlayers.length > 0
              ? <div className="space-y-2">
                  {queuePlayers.map((p, i) => (
                    <div key={p.id} className={`flex items-center gap-2 p-2 rounded-lg ${i === 0 ? 'bg-blue-900/30 border border-blue-800' : 'bg-gray-900/60'}`}>
                      {p.photo ? <img src={p.photo} alt={p.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" /> : <span className="text-xl flex-shrink-0">👤</span>}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white truncate">{p.name}</p>
                        <p className="text-xs text-gray-500">{p.tierCurrent || p.hero || ''}</p>
                      </div>
                      {i === 0 && <span className="text-xs text-blue-400 font-bold flex-shrink-0">NEXT</span>}
                    </div>
                  ))}
                </div>
              : <p className="text-gray-600 text-sm">대기 선수 없음</p>
            }
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-300 sticky top-0 bg-[#0f0f1a] pb-2">낙찰 내역</h2>
            {historyList.length > 0
              ? <div className="space-y-2">
                  {historyList.map((h, i) => {
                    const p = players[h.playerId];
                    const cap = captains[h.captainId];
                    if (!p || !cap) return null;
                    return (
                      <div key={i} className="p-2 bg-gray-900/60 rounded-lg">
                        <div className="flex justify-between text-sm">
                          <span className="text-white font-bold truncate">{p.name}</span>
                          <span className="text-orange-400 font-bold ml-2">{h.price}P</span>
                        </div>
                        <p className="text-xs text-gray-500">→ {cap.name} 팀</p>
                      </div>
                    );
                  })}
                </div>
              : <p className="text-gray-600 text-sm">낙찰 내역 없음</p>
            }
          </div>
        </aside>

      </div>
    </div>
  );
}
