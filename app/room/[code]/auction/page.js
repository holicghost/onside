'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ref, onValue, update } from 'firebase/database';
import { db } from '@/lib/firebase';
import { getHeroPortraitUrl, ALL_HEROES } from '@/lib/heroes';

const ROLE_BG = { tank: 'bg-yellow-900/50 text-yellow-300', damage: 'bg-red-900/50 text-red-300', support: 'bg-green-900/50 text-green-300' };
const ROLE_LABEL = { tank: '탱커', damage: '딜러', support: '서포터' };
const toArr = (val) => !val ? [] : Array.isArray(val) ? val : Object.values(val);

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className={`px-3 py-1 text-sm rounded-lg transition-all flex-shrink-0 ${copied ? 'bg-green-700 text-green-200' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
      {copied ? '복사됨!' : '복사'}
    </button>
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
  const [timeLeft, setTimeLeft] = useState(0);       // ms
  const [countdownLeft, setCountdownLeft] = useState(0); // ms
  const [bidAmount, setBidAmount] = useState('');
  const [bidError, setBidError] = useState('');
  const [showLinks, setShowLinks] = useState(false);
  const [origin, setOrigin] = useState('');

  const auctionRef = useRef(null);
  const captainsRef = useRef({});
  const roleRef = useRef('spectator');

  useEffect(() => { auctionRef.current = auction; }, [auction]);
  useEffect(() => { captainsRef.current = captains; }, [captains]);
  useEffect(() => { roleRef.current = role; }, [role]);
  useEffect(() => { setOrigin(window.location.origin); }, []);

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

  // Bidding timer (100ms for decimal display)
  useEffect(() => {
    if (!auction?.timerEnd || auction?.status !== 'bidding') { setTimeLeft(0); return; }
    const tick = () => setTimeLeft(Math.max(0, auction.timerEnd - Date.now()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [auction?.timerEnd, auction?.status]);

  // Per-player countdown
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

  const startAuction = async () => {
    const shuffled = Object.keys(players).sort(() => Math.random() - 0.5);
    await update(ref(db), {
      [`rooms/${code}/auction/playerOrder`]: shuffled,
      [`rooms/${code}/auction/currentIndex`]: 0,
      [`rooms/${code}/auction/currentPlayerId`]: shuffled[0],
      [`rooms/${code}/auction/status`]: 'countdown',
      [`rooms/${code}/auction/currentBid`]: 0,
      [`rooms/${code}/auction/currentBidCaptainId`]: null,
      [`rooms/${code}/auction/countdownEnd`]: Date.now() + 10000,
      [`rooms/${code}/auction/timerEnd`]: null,
    });
  };

  const goToNextPlayer = async () => {
    const a = auction;
    if (!a) return;
    const order = toArr(a.playerOrder);
    const nextIndex = (a.currentIndex || 0) + 1;
    if (nextIndex >= order.length) {
      await update(ref(db), {
        [`rooms/${code}/auction/status`]: 'done',
        [`rooms/${code}/info/status`]: 'result',
      });
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
  };

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
    // Add 5 seconds to current timer
    const newTimerEnd = Math.max(a.timerEnd || Date.now(), Date.now()) + 5000;
    await update(ref(db), {
      [`rooms/${code}/auction/currentBid`]: amt,
      [`rooms/${code}/auction/currentBidCaptainId`]: captainId,
      [`rooms/${code}/auction/timerEnd`]: newTimerEnd,
    });
  };

  // Derived data
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

  const statusLabel = { idle: '⏳ 대기 중', countdown: '⏱ 경매 준비', bidding: '🔨 경매 중', paused: '⏸ 일시정지', sold: '✅ 낙찰', passed: '⏭ 유찰', done: '🏆 완료' };
  const statusColor = {
    idle: 'bg-gray-800 text-gray-400', countdown: 'bg-yellow-900/60 text-yellow-300 border border-yellow-700',
    bidding: 'bg-green-900/60 text-green-300 border border-green-700', paused: 'bg-orange-900/60 text-orange-300 border border-orange-700',
    sold: 'bg-blue-900/60 text-blue-300 border border-blue-700', passed: 'bg-gray-700/60 text-gray-400',
    done: 'bg-purple-900/60 text-purple-300 border border-purple-700',
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0f0f1a' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800 flex-shrink-0 gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-white truncate">{roomInfo?.name || '경매'}</h1>
          <span className="text-sm text-gray-500">코드: <span className="font-mono text-orange-400 font-bold">{code}</span></span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setShowLinks(v => !v)} className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-all">
            🔗 링크 공유
          </button>
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${
            role === 'admin' ? 'bg-purple-900 text-purple-300' :
            role === 'captain' ? 'bg-orange-900 text-orange-300' : 'bg-gray-800 text-gray-400'
          }`}>
            {role === 'admin' ? '관리자' : role === 'captain' ? (captains[captainId]?.name || '팀장') : '관전자'}
          </span>
        </div>
      </header>

      {/* Link Sharing Panel */}
      {showLinks && (
        <div className="border-b border-gray-800 bg-gray-900/70 px-6 py-4">
          <h3 className="text-sm font-bold text-gray-400 mb-3">링크 공유</h3>
          <div className="space-y-2 max-w-2xl">
            {captainsList.map(cap => (
              <div key={cap.id} className="flex items-center gap-3">
                <span className="text-white text-sm font-bold w-20 truncate flex-shrink-0">{cap.name}</span>
                <span className="text-gray-500 text-xs flex-1 truncate font-mono min-w-0">{origin}/room/{code}/captain/{cap.id}</span>
                <CopyButton text={`${origin}/room/${code}/captain/${cap.id}`} />
              </div>
            ))}
            <div className="flex items-center gap-3">
              <span className="text-blue-400 text-sm font-bold w-20 flex-shrink-0">관전자</span>
              <span className="text-gray-500 text-xs flex-1 truncate font-mono min-w-0">{origin}/room/{code}/spectator</span>
              <CopyButton text={`${origin}/room/${code}/spectator`} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-purple-400 text-sm font-bold w-20 flex-shrink-0">관리자</span>
              <span className="text-gray-500 text-xs flex-1 truncate font-mono min-w-0">{origin}/room/{code}/admin</span>
              <CopyButton text={`${origin}/room/${code}/admin`} />
            </div>
          </div>
        </div>
      )}

      {/* 3-column body */}
      <div className="flex-1 grid overflow-hidden" style={{ gridTemplateColumns: '260px 1fr 260px' }}>

        {/* LEFT: Team Rosters */}
        <aside className="border-r border-gray-800 overflow-y-auto p-4 space-y-3">
          <h2 className="text-lg font-bold text-gray-300 sticky top-0 bg-[#0f0f1a] pb-2">팀 로스터</h2>
          {captainsList.map(cap => {
            const teamPlayers = Object.values(players).filter(p => p.soldTo === cap.id);
            const isLeader = cap.id === auction?.currentBidCaptainId;
            return (
              <div key={cap.id} className={`rounded-xl p-3 border transition-all ${isLeader ? 'border-orange-500 bg-orange-950/30' : 'border-gray-700 bg-gray-900/40'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {cap.photo ? <img src={cap.photo} alt={cap.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" /> : <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-lg flex-shrink-0">👤</div>}
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm truncate">{cap.name}</p>
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
        </aside>

        {/* CENTER: Auction */}
        <main className="overflow-y-auto p-6 flex flex-col items-center gap-4">
          <div className={`px-5 py-2 rounded-full text-lg font-bold ${statusColor[auction?.status] || 'bg-gray-800 text-gray-400'}`}>
            {statusLabel[auction?.status] || '⏳ 대기 중'}
          </div>

          {/* Per-player countdown */}
          {auction?.status === 'countdown' && currentPlayer && (
            <div className="w-full max-w-xs text-center space-y-3">
              <p className="text-yellow-400 text-lg font-bold">다음 선수 경매 준비</p>
              <div className="bg-gray-900 rounded-2xl p-5 border border-yellow-700">
                {currentPlayer.photo
                  ? <img src={currentPlayer.photo} alt={currentPlayer.name} className="w-24 h-24 rounded-full object-cover mx-auto mb-3" />
                  : <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center text-4xl mx-auto mb-3">👤</div>
                }
                <h3 className="text-2xl font-black text-white">{currentPlayer.name}</h3>
                {currentPlayer.tierCurrent && <p className="text-purple-400 text-sm mt-1">{currentPlayer.tierCurrent}</p>}
              </div>
              <div key={displayCountdown} className="text-7xl font-black text-yellow-400 animate-count-down">{displayCountdown}</div>
              <p className="text-gray-400">초 후 경매 시작</p>
            </div>
          )}

          {/* Current player card (bidding/paused/sold/passed) */}
          {['bidding', 'paused', 'sold', 'passed'].includes(auction?.status) && currentPlayer && (
            <div className={`w-full max-w-xs bg-gray-900 rounded-2xl overflow-hidden border-2 transition-all ${
              auction?.status === 'bidding' ? 'border-orange-500 animate-pulse-glow' :
              auction?.status === 'sold' ? 'border-blue-500' :
              auction?.status === 'paused' ? 'border-orange-800' : 'border-gray-700'
            }`}>
              {currentPlayer.photo
                ? <div className="relative w-full h-52">
                    <img src={currentPlayer.photo} alt={currentPlayer.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #111827 0%, transparent 60%)' }} />
                    <h3 className="absolute bottom-3 left-4 text-2xl font-black text-white">{currentPlayer.name}</h3>
                    {auction?.currentBid > 0 && (
                      <span className="absolute top-3 right-3 px-2 py-1 bg-orange-500/90 text-white text-xs font-bold rounded-full">입찰 중</span>
                    )}
                  </div>
                : <div className="w-full h-24 bg-gray-800 flex flex-col items-center justify-center gap-1 relative">
                    <span className="text-4xl">👤</span>
                    <h3 className="text-xl font-black text-white">{currentPlayer.name}</h3>
                    {auction?.currentBid > 0 && (
                      <span className="absolute top-2 right-2 px-2 py-1 bg-orange-500/90 text-white text-xs font-bold rounded-full">입찰 중</span>
                    )}
                  </div>
              }
              <div className="p-4 space-y-2">
                {toArr(currentPlayer.heroIds).filter(Boolean).length > 0 && (
                  <div className="flex gap-2">
                    {toArr(currentPlayer.heroIds).filter(Boolean).map((hid, i) => {
                      const url = getHeroPortraitUrl(hid);
                      const hero = ALL_HEROES.find(h => h.id === hid);
                      return url ? (
                        <div key={i} className="relative w-10 h-10 rounded-lg overflow-hidden bg-gray-700 flex-shrink-0">
                          <img src={url} alt={hero?.name} className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none'; }} />
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {currentPlayer.heroRole && (
                    <span className={`px-2 py-1 rounded-lg text-sm font-bold ${ROLE_BG[currentPlayer.heroRole] || 'bg-gray-700 text-gray-300'}`}>
                      {ROLE_LABEL[currentPlayer.heroRole] || currentPlayer.heroRole}
                    </span>
                  )}
                  {currentPlayer.tierCurrent && <span className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded-lg text-sm">{currentPlayer.tierCurrent}</span>}
                  {currentPlayer.style && <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded-lg text-sm">{currentPlayer.style}</span>}
                </div>
                {currentPlayer.comment && <p className="text-gray-400 text-sm italic">"{currentPlayer.comment}"</p>}
              </div>
            </div>
          )}

          {/* Timer */}
          {auction?.status === 'bidding' && (
            <div className="text-center w-full max-w-xs">
              <p className="text-gray-400 text-sm mb-1">입찰 종료까지</p>
              <div className={`text-6xl font-black leading-none ${
                timeLeft <= 3000 ? 'text-red-500 animate-timer-blink' : timeLeft <= 6000 ? 'text-yellow-400' : 'text-white'
              }`}>
                {displayTime}초
              </div>
              {nextQueuePlayer && (
                <div className="mt-3 flex items-center gap-2 bg-gray-800/60 rounded-xl px-3 py-2 justify-center">
                  <span className="text-gray-500 text-xs font-bold">NEXT</span>
                  {nextQueuePlayer.photo
                    ? <img src={nextQueuePlayer.photo} alt={nextQueuePlayer.name} className="w-7 h-7 rounded-full object-cover" />
                    : <span className="text-lg">👤</span>
                  }
                  <span className="text-gray-300 text-sm font-bold">{nextQueuePlayer.name}</span>
                </div>
              )}
            </div>
          )}

          {auction?.status === 'paused' && (
            <div className="text-center">
              <p className="text-orange-400 text-2xl font-black">⏸ 일시정지됨</p>
              <p className="text-gray-500 text-sm mt-1">남은 시간: {((auction.pausedTimeLeft || 0) / 1000).toFixed(1)}초</p>
            </div>
          )}

          {/* Current bid */}
          {['bidding', 'paused'].includes(auction?.status) && (
            <div className="w-full max-w-xs bg-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-base">현재 최고 입찰</p>
              <p className="text-5xl font-black text-orange-400 leading-none mt-1">
                {auction.currentBid > 0 ? `${auction.currentBid}P` : '—'}
              </p>
              {auction.currentBidCaptainId && (
                <p className="text-gray-300 text-sm mt-1">{captains[auction.currentBidCaptainId]?.name} 팀장</p>
              )}
            </div>
          )}

          {/* Bid UI — captain only */}
          {role === 'captain' && auction?.status === 'bidding' && captainId && (
            <div className="w-full max-w-xs space-y-2">
              {bidError && <p className="text-red-400 text-center text-sm">{bidError}</p>}
              <div className="grid grid-cols-4 gap-2">
                {quickBids.map(q => (
                  <button key={q.label}
                    onClick={() => { placeBid(q.val); setBidAmount(String(q.val)); }}
                    className="py-2 text-center text-sm font-bold bg-orange-900/60 hover:bg-orange-800 border border-orange-700 rounded-xl transition-all text-orange-300">
                    <div>{q.label}</div>
                    <div className="text-xs text-orange-400 mt-0.5">{q.val}P</div>
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
              <p className="text-center text-gray-400 text-sm">
                내 예산: <span className="text-green-400 font-bold">{myBudget}P</span>
              </p>
            </div>
          )}

          {/* Sold / Passed result */}
          {auction?.status === 'sold' && auction.currentBidCaptainId && (
            <div className="w-full max-w-xs bg-blue-900/30 border border-blue-700 rounded-xl p-4 text-center">
              <p className="text-blue-300 text-xl font-bold">{captains[auction.currentBidCaptainId]?.name} 팀 낙찰!</p>
              <p className="text-4xl font-black text-orange-400 mt-1">{auction.currentBid}P</p>
            </div>
          )}
          {auction?.status === 'passed' && (
            <div className="w-full max-w-xs bg-gray-800 border border-gray-600 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-xl font-bold">유찰</p>
              <p className="text-gray-500 text-sm mt-1">재경매 라운드에 포함됩니다</p>
            </div>
          )}

          {/* Admin controls */}
          {role === 'admin' && (
            <div className="w-full max-w-xs space-y-2">
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
              {['sold', 'passed'].includes(auction?.status) && (
                <button onClick={goToNextPlayer} className="w-full py-4 text-2xl font-bold bg-blue-600 hover:bg-blue-500 rounded-xl transition-all">
                  ▶ 다음 선수
                </button>
              )}
              {auction?.status === 'done' && (
                <div className="space-y-2">
                  {unsoldPlayers.length > 0 && (
                    <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4">
                      <p className="text-yellow-300 text-sm font-bold mb-2">유찰 선수 {unsoldPlayers.length}명</p>
                      {unsoldPlayers.slice(0, 5).map(p => <p key={p.id} className="text-gray-300 text-xs">• {p.name}</p>)}
                      {unsoldPlayers.length > 5 && <p className="text-gray-500 text-xs">외 {unsoldPlayers.length - 5}명...</p>}
                      <button onClick={startReAuction} className="w-full mt-3 py-2 text-base font-bold bg-yellow-600 hover:bg-yellow-500 rounded-xl transition-all">
                        🔄 유찰 선수 재경매
                      </button>
                    </div>
                  )}
                  <button onClick={() => router.push(`/room/${code}/result`)} className="w-full py-4 text-2xl font-bold bg-purple-600 hover:bg-purple-500 rounded-xl transition-all">
                    🏆 결과 보기
                  </button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* RIGHT: Queue + History */}
        <aside className="border-l border-gray-800 overflow-y-auto p-4 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-gray-300 sticky top-0 bg-[#0f0f1a] pb-2">
              대기 <span className="text-orange-400">{queuePlayers.length}</span>명
            </h2>
            {queuePlayers.length > 0
              ? <div className="space-y-2">
                  {queuePlayers.map((p, i) => (
                    <div key={p.id} className={`flex items-center gap-2 p-2 rounded-lg ${i === 0 ? 'bg-blue-900/30 border border-blue-800' : 'bg-gray-900/60'}`}>
                      {p.photo ? <img src={p.photo} alt={p.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" /> : <span className="text-xl flex-shrink-0">👤</span>}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{p.name}</p>
                        <p className="text-xs text-gray-400">{p.hero || p.heroId}</p>
                      </div>
                      {i === 0 && <span className="text-xs text-blue-400 font-bold flex-shrink-0">NEXT</span>}
                    </div>
                  ))}
                </div>
              : <p className="text-gray-600 text-sm">대기 선수 없음</p>
            }
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-300 sticky top-0 bg-[#0f0f1a] pb-2">낙찰 내역</h2>
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
                        <p className="text-xs text-gray-400">→ {cap.name} 팀</p>
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
