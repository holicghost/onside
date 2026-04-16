'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ref, onValue, update, set, onDisconnect, query, orderByKey, limitToLast } from 'firebase/database';
import { db } from '@/lib/firebase';
import { getHeroPortraitUrl, loadHeroPortraits, ALL_HEROES } from '@/lib/heroes';

const ROLE_LABEL = { tank: '탱커', damage: '딜러', support: '서포터' };
const toArr = (val) => !val ? [] : Array.isArray(val) ? val : Object.values(val);
const QUEUE_GROUPS = ['고티어 딜러', '저티어 딜러', '고티어 탱커', '저티어 탱커', '고티어 힐러', '저티어 힐러'];
const TIER_POS_STYLES = {
  '고티어 딜러': 'bg-red-600/80 text-white border-red-500/60',
  '저티어 딜러': 'bg-rose-800/70 text-rose-200 border-rose-700/60',
  '고티어 탱커': 'bg-yellow-500/80 text-yellow-950 border-yellow-400/60',
  '저티어 탱커': 'bg-yellow-800/70 text-yellow-200 border-yellow-700/60',
  '고티어 힐러': 'bg-green-600/80 text-white border-green-500/60',
  '저티어 힐러': 'bg-green-900/70 text-green-200 border-green-700/60',
};

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

const STATUS_LABEL = { idle: '⏳ 대기 중', countdown: '⏱ 경매 준비', countdown_paused: '⏸ 대기 일시정지', bidding: '🔨 경매 중', paused: '⏸ 일시정지', sold: '✅ 낙찰', passed: '⏭ 유찰', done: '🏆 완료' };
const STATUS_COLOR = {
  idle: 'bg-gray-800 text-gray-400',
  countdown: 'bg-yellow-900/60 text-yellow-300 border border-yellow-700',
  countdown_paused: 'bg-orange-900/60 text-orange-300 border border-orange-700',
  bidding: 'bg-green-900/60 text-green-300 border border-green-700',
  paused: 'bg-orange-900/60 text-orange-300 border border-orange-700',
  sold: 'bg-blue-900/60 text-blue-300 border border-blue-700',
  passed: 'bg-gray-700/60 text-gray-400',
  done: 'bg-purple-900/60 text-purple-300 border border-purple-700',
};

function AuctionPlayerCard({ player, curBid, auction, bidderCap }) {
  if (!player) return null;
  const heroIdsList = toArr(player.heroIds).filter(Boolean);
  return (
    <div className="relative w-full bg-gray-900 rounded-2xl border border-gray-700 overflow-hidden">
      <div className="flex gap-4 p-5">
        <div className="w-48 h-64 rounded-xl overflow-hidden bg-gray-800 flex-shrink-0 flex items-center justify-center">
          {player.photo
            ? <img src={player.photo} alt={player.name} className="w-full h-full object-cover object-top" />
            : <span className="text-6xl">👤</span>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex gap-1.5 flex-wrap mb-1.5">
            {(player.tierType || player.position) && (
              <span className={`px-3 py-1 text-base font-bold rounded-full border ${
                TIER_POS_STYLES[`${player.tierType} ${player.position}`] || 'bg-gray-700 text-gray-300 border-gray-600'
              }`}>
                {[player.tierType, player.position].filter(Boolean).join(' ')}
              </span>
            )}
            {curBid > 0 && auction?.status === 'bidding' && (
              <span className="px-3 py-1 bg-orange-500/80 text-white text-base font-bold rounded-full animate-pulse">입찰 중</span>
            )}
          </div>
          <h2 className="font-black text-white leading-tight" style={{ fontSize: '56px' }}>{player.name}</h2>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[
              { label: '현재 티어', val: player.tierCurrent, color: 'text-purple-400' },
              { label: '이전 시즌 티어', val: player.tierPrevious, color: 'text-gray-300' },
              { label: '역대 최고 티어', val: player.tierBest, color: 'text-yellow-400' },
            ].map(({ label, val, color }) => (
              <div key={label} className="bg-gray-800/80 rounded-lg px-3 py-2">
                <p className="text-sm text-gray-500 mb-0.5 leading-tight">{label}</p>
                <p className={`text-xl font-bold ${color} leading-tight`}>{val || '—'}</p>
              </div>
            ))}
          </div>
          {player.style && (
            <div className="mt-3">
              <p className="text-sm text-gray-500 mb-0.5">플레이 스타일</p>
              <p className="text-base text-gray-300 leading-snug">{player.style}</p>
            </div>
          )}
          {player.comment && (
            <div className="mt-3">
              <p className="text-sm text-gray-500 mb-0.5">한마디</p>
              <p className="text-base text-gray-300 leading-snug">{player.comment}</p>
            </div>
          )}
        </div>
      </div>
      {heroIdsList.length > 0 && (
        <div className="px-5 pb-4 flex gap-4">
          {heroIdsList.map((hid) => {
            const url = getHeroPortraitUrl(hid);
            const hero = ALL_HEROES.find(h => h.id === hid);
            const roleKey = hero?.role;
            const roleName = ROLE_LABEL[roleKey] || '';
            const roleColor = { tank: 'text-yellow-300', damage: 'text-red-300', support: 'text-green-300' }[roleKey] || 'text-gray-400';
            return (
              <div key={hid} className="flex flex-col items-center gap-1.5">
                <div className="relative rounded-xl overflow-hidden bg-gray-700 border border-gray-600 flex items-center justify-center flex-shrink-0" style={{ width: '80px', height: '80px' }}>
                  {url ? (
                    <img src={url} alt={hero?.name || hid} className="absolute inset-0 w-full h-full object-cover"
                      onError={e => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <span className="text-gray-500 text-2xl">?</span>
                  )}
                  {roleName && (
                    <span className={`absolute bottom-0 left-0 right-0 text-center text-[10px] font-bold py-0.5 ${roleColor}`}
                      style={{ background: 'rgba(0,0,0,0.7)' }}>
                      {roleName}
                    </span>
                  )}
                </div>
                <span className="text-gray-400 text-sm text-center leading-tight truncate" style={{ width: '80px' }}>{hero?.name || hid}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="px-5 pb-5">
        <p className="text-gray-500 text-base mb-0.5">현재 입찰</p>
        <p key={curBid} className="font-black text-orange-400 leading-none tabular-nums animate-bid-pop" style={{ fontSize: '64px' }}>
          {curBid > 0 ? `${curBid} pt` : '—'}
        </p>
        {bidderCap && (
          <p className="text-white text-lg font-bold mt-1">👑 {bidderCap.name} 입찰 중</p>
        )}
      </div>
      {auction?.status === 'sold' && (
        <div key={`sold-${auction.currentPlayerId}`}
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none animate-result-in"
          style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 'inherit' }}>
          <p className="text-white text-6xl font-black drop-shadow-lg">낙찰!</p>
          {bidderCap && <p className="text-white/80 text-xl font-bold mt-2">{bidderCap.name} 팀</p>}
        </div>
      )}
      {auction?.status === 'passed' && (
        <div key={`passed-${auction.currentPlayerId}`}
          className="absolute inset-0 flex items-center justify-center pointer-events-none animate-result-in"
          style={{ background: 'rgba(75,85,99,0.82)', borderRadius: 'inherit' }}>
          <p className="text-white text-6xl font-black drop-shadow-lg">유찰</p>
        </div>
      )}
    </div>
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
  const [maxDuration, setMaxDuration] = useState(15000);
  const [bidError, setBidError] = useState('');
  const [showLinks, setShowLinks] = useState(false);
  const [origin, setOrigin] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  const auctionRef = useRef(null);
  const captainsRef = useRef({});
  const playersRef = useRef({});
  const roleRef = useRef('spectator');
  const lastTimerEndRef = useRef(null);
  const goToNextPlayerRef = useRef(null);
  const barRef = useRef(null);
  const maxDurationRef = useRef(15000);
  const chatScrollRef = useRef(null);

  useEffect(() => { auctionRef.current = auction; }, [auction]);
  useEffect(() => { captainsRef.current = captains; }, [captains]);
  useEffect(() => { playersRef.current = players; }, [players]);
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
    const rootUnsub = onValue(ref(db, `rooms/${code}`), snap => {
      const val = snap.val() || {};
      setRoomInfo(val.info || null);
      setCaptains(val.captains || {});
      setPlayers(val.players || {});
      setAuction(val.auction || null);
    });
    const chatUnsub = onValue(query(ref(db, `rooms/${code}/chat`), orderByKey(), limitToLast(50)), snap => {
      const val = snap.val();
      if (!val) { setChatMessages([]); return; }
      setChatMessages(Object.entries(val).map(([k, v]) => ({ id: k, ...v })));
    });
    return () => { rootUnsub(); chatUnsub(); };
  }, [code]);

  // Auto-redirect all users when room status becomes 'result'
  useEffect(() => {
    if (roomInfo?.status === 'result') router.push(`/room/${code}/result`);
  }, [roomInfo?.status]);

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
      const dur = Math.max(1000, auction.timerEnd - Date.now());
      maxDurationRef.current = dur;
      setMaxDuration(dur);
    }
  }, [auction?.timerEnd, auction?.status]);

  // Smooth CSS bar animation — one imperative write per new timerEnd
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (auction?.status !== 'bidding' || !auction?.timerEnd) {
      bar.style.transition = 'none';
      bar.style.width = '0%';
      return;
    }
    const remaining = Math.max(0, auction.timerEnd - Date.now());
    const pct = Math.min(100, (remaining / Math.max(1, maxDurationRef.current)) * 100);
    bar.style.transition = 'none';
    bar.style.width = `${pct}%`;
    // Double rAF: ensure the snap frame is painted before the transition starts
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.style.transition = `width ${remaining}ms linear`;
      bar.style.width = '0%';
    }));
  }, [auction?.timerEnd, auction?.status]);

  const startBidding = useCallback(async () => {
    const a = auctionRef.current;
    if (!a || a.status !== 'countdown') return;
    await update(ref(db), {
      [`rooms/${code}/auction/status`]: 'bidding',
      [`rooms/${code}/auction/timerEnd`]: Date.now() + 15000,
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

  // No auto-advance — admin manually clicks "다음 경매로 넘어가기"

  const buildPlayerOrder = (playerMap) => {
    const ids = Object.keys(playerMap);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
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
      [`rooms/${code}/auction/countdownEnd`]: Date.now() + 15000,
      [`rooms/${code}/auction/timerEnd`]: null,
      [`rooms/${code}/auction/bidLog`]: null,
      [`rooms/${code}/auction/roundStartUnsoldCount`]: Object.keys(players).length,
      [`rooms/${code}/auction/isReAuction`]: false,
    });
  };

  // Returns true if any captain can viably bid on any unsold player
  const checkViableBids = (unsoldEntries, currentCaptains, currentPlayers) => {
    return unsoldEntries.some(([, p]) => {
      const playerLine = (p.tierType && p.position) ? `${p.tierType} ${p.position}` : null;
      return Object.entries(currentCaptains).some(([capId, cap]) => {
        if ((cap.budget || 0) < 10) return false;
        if (!playerLine) return true;
        const hasLine = Object.values(currentPlayers).some(
          rp => rp.soldTo === capId && `${rp.tierType} ${rp.position}` === playerLine
        );
        return !hasLine;
      });
    });
  };

  const goToNextPlayer = useCallback(async () => {
    const a = auctionRef.current;
    if (!a) return;
    const order = toArr(a.playerOrder);
    const nextIndex = (a.currentIndex || 0) + 1;

    if (nextIndex >= order.length) {
      // Round complete — decide whether to auto re-auction or go to result
      const currentPlayers = playersRef.current;
      const currentCaptains = captainsRef.current;
      const unsoldEntries = Object.entries(currentPlayers).filter(([, p]) => !p.soldTo);

      // No progress check: if same count as when round started, stop looping
      const prevUnsoldCount = a.roundStartUnsoldCount;
      const noProgress = prevUnsoldCount !== undefined && unsoldEntries.length >= prevUnsoldCount;

      const anyViable = !noProgress && unsoldEntries.length > 0 &&
        checkViableBids(unsoldEntries, currentCaptains, currentPlayers);

      if (anyViable) {
        const unsoldMap = Object.fromEntries(unsoldEntries);
        const ordered = buildPlayerOrder(unsoldMap);
        await update(ref(db), {
          [`rooms/${code}/auction/playerOrder`]: ordered,
          [`rooms/${code}/auction/currentIndex`]: 0,
          [`rooms/${code}/auction/currentPlayerId`]: ordered[0],
          [`rooms/${code}/auction/status`]: 'bidding',
          [`rooms/${code}/auction/currentBid`]: 0,
          [`rooms/${code}/auction/currentBidCaptainId`]: null,
          [`rooms/${code}/auction/countdownEnd`]: null,
          [`rooms/${code}/auction/timerEnd`]: Date.now() + 15000,
          [`rooms/${code}/auction/bidLog`]: null,
          [`rooms/${code}/auction/isReAuction`]: true,
          [`rooms/${code}/auction/roundStartUnsoldCount`]: unsoldEntries.length,
          [`rooms/${code}/info/status`]: 'auction',
        });
      } else {
        await update(ref(db), {
          [`rooms/${code}/auction/status`]: 'done',
          [`rooms/${code}/info/status`]: 'result',
        });
      }
      return;
    }

    await update(ref(db), {
      [`rooms/${code}/auction/currentIndex`]: nextIndex,
      [`rooms/${code}/auction/currentPlayerId`]: order[nextIndex],
      [`rooms/${code}/auction/status`]: 'bidding',
      [`rooms/${code}/auction/currentBid`]: 0,
      [`rooms/${code}/auction/currentBidCaptainId`]: null,
      [`rooms/${code}/auction/countdownEnd`]: null,
      [`rooms/${code}/auction/timerEnd`]: Date.now() + 15000,
      [`rooms/${code}/auction/bidLog`]: null,
    });
  }, [code]);

  useEffect(() => { goToNextPlayerRef.current = goToNextPlayer; }, [goToNextPlayer]);

  // Captain online presence
  useEffect(() => {
    if (!code || !captainId || role !== 'captain') return;
    const presenceRef = ref(db, `rooms/${code}/captains/${captainId}/online`);
    const disconnectRef = onDisconnect(presenceRef);
    set(presenceRef, true);
    disconnectRef.set(false);
    return () => { disconnectRef.cancel(); set(presenceRef, false); };
  }, [code, captainId, role]);

  // Chat auto-scroll
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

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
      [`rooms/${code}/auction/timerEnd`]: Date.now() + (auction?.pausedTimeLeft || 15000),
      [`rooms/${code}/auction/pausedTimeLeft`]: null,
    });
  };

  const pauseCountdown = async () => {
    const remaining = Math.max(1000, (auction?.countdownEnd || Date.now()) - Date.now());
    await update(ref(db), {
      [`rooms/${code}/auction/status`]: 'countdown_paused',
      [`rooms/${code}/auction/countdownEnd`]: null,
      [`rooms/${code}/auction/pausedCountdownLeft`]: remaining,
    });
  };

  const resumeCountdown = async () => {
    await update(ref(db), {
      [`rooms/${code}/auction/status`]: 'countdown',
      [`rooms/${code}/auction/countdownEnd`]: Date.now() + (auction?.pausedCountdownLeft || 15000),
      [`rooms/${code}/auction/pausedCountdownLeft`]: null,
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
    if (!a || a.status !== 'bidding') return;
    const amt = Math.floor(Number(amount) / 10) * 10;
    if (amt < 10) { setBidError('최소 입찰가는 10포인트입니다.'); return; }
    if (amt <= (a.currentBid || 0)) { setBidError('현재 입찰가보다 높아야 합니다.'); return; }
    const myCap = captains[captainId];
    if (!myCap || amt > myCap.budget) { setBidError('예산이 부족합니다.'); return; }
    // Duplicate line restriction
    const cp = players[a.currentPlayerId];
    if (cp?.tierType && cp?.position) {
      const playerLine = `${cp.tierType} ${cp.position}`;
      const hasLine = Object.values(players).some(p => p.soldTo === captainId && `${p.tierType} ${p.position}` === playerLine);
      if (hasLine) { setBidError('이미 해당 라인의 선수를 보유하고 있습니다.'); return; }
    }
    const prevCaptainId = a.currentBidCaptainId || null;
    const newTimerEnd = Math.max(a.timerEnd || Date.now(), Date.now()) + 10000;
    await update(ref(db), {
      [`rooms/${code}/auction/currentBid`]: amt,
      [`rooms/${code}/auction/currentBidCaptainId`]: captainId,
      [`rooms/${code}/auction/timerEnd`]: newTimerEnd,
      [`rooms/${code}/auction/bidLog/${Date.now()}`]: { captainId, prevCaptainId, amount: amt, timestamp: Date.now() },
    });
  };

  const sendingRef = useRef(false);
  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || !code || sendingRef.current) return;
    sendingRef.current = true;
    setChatInput('');
    try {
      const senderName = role === 'admin' ? '관리자' : (captains[captainId]?.name || '관전자');
      await set(ref(db, `rooms/${code}/chat/${Date.now()}`), { senderName, message: msg, timestamp: Date.now() });
    } catch { /* ignore */ }
    sendingRef.current = false;
  };

  // Derived — useMemo prevents recompute on every 100ms timer tick
  const captainsList = useMemo(() => Object.entries(captains).map(([id, c]) => ({ id, ...c })), [captains]);
  const myCaptain = captainId ? captains[captainId] : null;
  const playerOrder = useMemo(() => toArr(auction?.playerOrder), [auction?.playerOrder]);
  const currentIdx = auction?.currentIndex || 0;
  const currentPlayer = auction?.currentPlayerId ? players[auction.currentPlayerId] : null;
  // Duplicate line restriction for this captain on current player
  const myLineDuplicate = useMemo(() => {
    if (!captainId || !currentPlayer?.tierType || !currentPlayer?.position) return false;
    const playerLine = `${currentPlayer.tierType} ${currentPlayer.position}`;
    return Object.values(players).some(p => p.soldTo === captainId && `${p.tierType} ${p.position}` === playerLine);
  }, [captainId, currentPlayer, players]);
  const queuePlayers = useMemo(() => playerOrder.slice(currentIdx + 1).map(pid => players[pid]).filter(Boolean), [playerOrder, currentIdx, players]);
  const nextQueuePlayer = queuePlayers[0] || null;
  const historyList = useMemo(() => auction?.history ? Object.values(auction.history).sort((a, b) => b.timestamp - a.timestamp) : [], [auction?.history]);
  const processedCount = ['passed', 'sold', 'done'].includes(auction?.status) ? currentIdx + 1 : currentIdx;
  const passedPlayers = useMemo(() => playerOrder.slice(0, processedCount).map(pid => players[pid]).filter(p => p && !p.soldTo), [playerOrder, processedCount, players]);
  const curBid = auction?.currentBid || 0;
  const myBudget = myCaptain?.budget || 0;
  const offlineCaptains = useMemo(() => captainsList.filter(c => !c.online), [captainsList]);
  const restQueue = useMemo(() => queuePlayers.slice(1), [queuePlayers]);
  const allPlayersList = useMemo(() => Object.entries(players).map(([id, p]) => ({ id, ...p })), [players]);
  const totalPlayerCount = allPlayersList.length;
  const allGrouped = useMemo(() => QUEUE_GROUPS
    .map(key => ({ key, players: allPlayersList.filter(p => `${p.tierType} ${p.position}` === key) }))
    .filter(g => g.players.length > 0), [allPlayersList]);
  const allUngrouped = useMemo(() => allPlayersList.filter(p => !QUEUE_GROUPS.includes(`${p.tierType} ${p.position}`)), [allPlayersList]);
  const bidLogList = useMemo(() => auction?.bidLog ? Object.values(auction.bidLog).sort((a, b) => b.timestamp - a.timestamp).slice(0, 10) : [], [auction?.bidLog]);
  const quickBids = useMemo(() => [
    { label: '+10',  val: curBid + 10 },
    { label: '+20',  val: curBid + 20 },
    { label: '+50',  val: curBid + 50 },
    { label: '최대', val: Math.floor(myBudget / 10) * 10 },
  ].filter(q => q.val > curBid && q.val <= myBudget), [curBid, myBudget]);

  const displayTime = (timeLeft / 1000).toFixed(1);
  const displayCountdown = Math.min(15, Math.ceil(countdownLeft / 1000));
  const progressPct = maxDuration > 0 ? Math.max(0, (timeLeft / maxDuration) * 100) : 0;


  const bidderCap = auction?.currentBidCaptainId ? captains[auction.currentBidCaptainId] : null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0f0f1a' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800 flex-shrink-0 gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={() => router.push('/')} className="text-gray-500 hover:text-gray-300 text-sm transition-colors flex-shrink-0">← 홈</button>
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-white truncate">{roomInfo?.name || '경매'}</h1>
            <span className="text-sm text-gray-500">코드: <BlurCode text={code} className="font-mono text-orange-400 font-bold" /></span>
          </div>
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

      {/* Rules banner */}
      <div className="px-6 py-1.5 border-b border-gray-800/60 bg-gray-900/30 flex-shrink-0">
        <p className="text-gray-600 text-xs text-center">
          경매 포인트: <span className="text-gray-500">{roomInfo?.budget || 1000}P</span>
          &nbsp;|&nbsp; 최소 입찰가: <span className="text-gray-500">10P</span>
          &nbsp;|&nbsp; 10 단위 입찰만 가능
          &nbsp;|&nbsp; 같은 라인의 선수는 중복 선발 불가
        </p>
      </div>

      {/* Offline captain warning */}
      {role === 'admin' && offlineCaptains.length > 0 && (
        <div className="flex items-center gap-2 px-6 py-2 bg-red-950/60 border-b border-red-800 text-red-400 text-sm font-bold flex-shrink-0">
          <span>⚠️</span>
          <span>오프라인 팀장: {offlineCaptains.map(c => c.name).join(', ')}</span>
        </div>
      )}

      {/* 3-column layout */}
      <div className="flex-1 grid overflow-hidden" style={{ gridTemplateColumns: '25% 45% 30%' }}>

        {/* LEFT: Team Rosters */}
        <aside className="border-r border-gray-800 overflow-y-auto p-4 space-y-3">
          <h2 className="text-xl font-bold text-gray-300 sticky top-0 bg-[#0f0f1a] pb-2">팀 로스터</h2>
          {captainsList.map(cap => {
            const teamPlayers = Object.values(players).filter(p => p.soldTo === cap.id);
            const isLeader = cap.id === auction?.currentBidCaptainId;
            return (
              <div key={cap.id} className={`rounded-xl p-3 border transition-all ${isLeader ? 'border-orange-500 bg-orange-950/30' : 'border-gray-700 bg-gray-900/40'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {cap.photo ? <img src={cap.photo} alt={cap.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" /> : <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-lg flex-shrink-0">👤</div>}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cap.online ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
                      <p className="font-bold text-white text-xl truncate">{cap.name}</p>
                      {cap.position && (
                        <span className={`px-2 py-0.5 text-sm font-bold rounded-full flex-shrink-0 ${
                          cap.position === '탱커' ? 'bg-yellow-900/60 text-yellow-300' :
                          cap.position === '딜러' ? 'bg-red-900/60 text-red-300' :
                          'bg-green-900/60 text-green-300'
                        }`}>{cap.position}</span>
                      )}
                    </div>
                    <p className="text-base text-gray-400">예산 <span className="text-green-400 font-bold">{cap.budget}</span><span className="text-gray-600">/{roomInfo?.budget}</span>P</p>
                  </div>
                </div>
                {teamPlayers.length > 0
                  ? <div className="space-y-1.5 border-t border-gray-700 pt-2">
                      {teamPlayers.map(p => (
                        <div key={p.id} className="flex items-center gap-2 text-base">
                          {p.photo ? <img src={p.photo} alt={p.name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" /> : <span className="flex-shrink-0">👤</span>}
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-300 truncate leading-tight">{p.name}</p>
                            {(p.tierType || p.position) && (
                              <span className="text-sm text-gray-600 font-bold">{[p.tierType, p.position].filter(Boolean).join(' ')}</span>
                            )}
                          </div>
                          <span className="text-orange-400 font-bold flex-shrink-0">{p.soldPrice}P</span>
                        </div>
                      ))}
                    </div>
                  : <p className="text-sm text-gray-600 border-t border-gray-800 pt-2">팀원 없음</p>
                }
              </div>
            );
          })}

          {/* Chat box */}
          <div className="border-t border-gray-800 pt-3 space-y-2">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest">채팅</h3>
            <div ref={chatScrollRef} className="h-40 overflow-y-auto space-y-1 bg-gray-900/40 rounded-xl p-2">
              {chatMessages.length === 0
                ? <p className="text-gray-700 text-sm text-center py-4">채팅 없음</p>
                : chatMessages.map(msg => (
                    <div key={msg.id} style={{ fontSize: '15px' }}>
                      <span className="font-bold text-orange-400">{msg.senderName}: </span>
                      <span className="text-gray-300 break-all">{msg.message}</span>
                    </div>
                  ))
              }
            </div>
            <div className="flex gap-1">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sendChat(); }}
                placeholder="메시지 입력..."
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:border-orange-400 focus:outline-none text-white"
                style={{ fontSize: '13px' }}
              />
              <button
                onClick={sendChat}
                disabled={!chatInput.trim()}
                className="w-12 flex-shrink-0 py-2 font-bold bg-orange-600 hover:bg-orange-500 disabled:opacity-40 rounded-lg transition-all whitespace-nowrap"
                style={{ fontSize: '13px' }}
              >
                전송
              </button>
            </div>
          </div>

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
                  <CopyButton text={`${origin}/admin/${code}`} />
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* CENTER: Main auction */}
        <main className="overflow-y-auto p-5 flex flex-col gap-4">

          {/* Status pill */}
          <div className={`px-5 py-2 rounded-full text-base font-bold self-center ${STATUS_COLOR[auction?.status] || 'bg-gray-800 text-gray-400'}`}>
            {STATUS_LABEL[auction?.status] || '⏳ 대기 중'}
          </div>

          {/* Pre-player countdown */}
          {auction?.status === 'countdown' && currentPlayer && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-yellow-400 text-sm font-bold">다음 선수 경매 준비</p>
              <div key={`cd-${auction?.currentPlayerId}`} className="animate-player-enter w-full">
                <AuctionPlayerCard player={currentPlayer} curBid={curBid} auction={auction} bidderCap={bidderCap} />
              </div>
              <div key={displayCountdown} className="text-7xl font-black text-yellow-400 animate-count-down">{displayCountdown}</div>
              <p className="text-gray-500 text-sm">초 후 경매 시작</p>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-400 rounded-full transition-none"
                  style={{ width: `${Math.max(0, Math.min(100, (countdownLeft / 15000) * 100))}%` }}
                />
              </div>
              {role === 'admin' && (
                <button onClick={pauseCountdown} className="px-6 py-2 text-base font-bold bg-orange-700 hover:bg-orange-600 rounded-xl transition-all">
                  ⏸ 대기 일시정지
                </button>
              )}
            </div>
          )}

          {/* Countdown paused */}
          {auction?.status === 'countdown_paused' && currentPlayer && (
            <div className="flex flex-col items-center gap-3">
              <p className="text-orange-400 text-sm font-bold">대기 일시정지됨</p>
              <div key={`cd-${auction?.currentPlayerId}`} className="w-full">
                <AuctionPlayerCard player={currentPlayer} curBid={curBid} auction={auction} bidderCap={bidderCap} />
              </div>
              <div className="text-center bg-orange-900/20 border border-orange-800 rounded-xl p-4 w-full">
                <p className="text-orange-400 font-bold text-lg">⏸ 대기 일시정지</p>
                <p className="text-gray-500 text-sm mt-1">남은 시간: {((auction?.pausedCountdownLeft || 0) / 1000).toFixed(1)}초</p>
              </div>
              {role === 'admin' && (
                <button onClick={resumeCountdown} className="px-6 py-2 text-base font-bold bg-green-600 hover:bg-green-500 rounded-xl transition-all">
                  ▶ 재개
                </button>
              )}
            </div>
          )}

          {/* Active / resolved player */}
          {['bidding', 'paused', 'sold', 'passed'].includes(auction?.status) && (
            <div key={auction?.currentPlayerId} className="animate-player-enter w-full">
              <AuctionPlayerCard player={currentPlayer} curBid={curBid} auction={auction} bidderCap={bidderCap} />
            </div>
          )}

          {/* Timer + progress bar */}
          {auction?.status === 'bidding' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-gray-800 rounded-xl px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-white font-bold text-lg">입찰 중</span>
                </div>
                <span className={`font-black tabular-nums leading-none ${
                  timeLeft <= 3000 ? 'text-red-500 animate-timer-blink' : timeLeft <= 6000 ? 'text-yellow-400' : 'text-white'
                }`} style={{ fontSize: '52px' }}>
                  {displayTime}초
                </span>
              </div>
              {/* Shrinking progress bar */}
              <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  ref={barRef}
                  className="h-full rounded-full"
                  style={{
                    backgroundColor: progressPct > 60 ? '#22c55e' : progressPct > 30 ? '#eab308' : '#ef4444',
                    transition: 'background-color 0.4s',
                    width: '100%',
                  }}
                />
              </div>
            </div>
          )}

          {auction?.status === 'paused' && (
            <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(0,0,0,0.6)' }}>
              <div className="pointer-events-auto text-center bg-gray-900 border border-orange-700 rounded-2xl px-10 py-8 shadow-2xl animate-modal-in space-y-3">
                <p className="text-5xl">⏸</p>
                <p className="text-orange-400 font-black text-2xl">관리자가 경매를 일시정지 하였습니다</p>
                <p className="text-gray-500 text-base">남은 시간: {((auction.pausedTimeLeft || 0) / 1000).toFixed(1)}초</p>
                {role === 'admin' && (
                  <button onClick={resumeAuction} className="mt-2 px-8 py-3 text-lg font-bold bg-green-600 hover:bg-green-500 rounded-xl transition-all">
                    ▶ 재진행
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Post-auction: admin advances, others wait */}
          {['sold', 'passed'].includes(auction?.status) && (
            <div className="bg-gray-800/50 rounded-xl p-4 text-center space-y-2">
              {role === 'admin' ? (
                <button onClick={goToNextPlayer} className="px-8 py-3 text-lg font-bold bg-blue-600 hover:bg-blue-500 rounded-xl transition-all animate-modal-in">
                  ▶ 다음 경매로 넘어가기
                </button>
              ) : (
                <p className="text-gray-400 text-base animate-pulse">다음 경매 준비 중...</p>
              )}
            </div>
          )}

          {/* Captain bid UI */}
          {role === 'captain' && auction?.status === 'bidding' && captainId && (
            <div className="space-y-3 animate-modal-in">
              <p className="text-center text-gray-400 text-base">
                내 포인트: <span className="text-green-400 font-black text-2xl">{myBudget}pt</span>
              </p>
              {myLineDuplicate ? (
                <div className="text-center py-3 bg-red-950/40 border border-red-800 rounded-xl">
                  <p className="text-red-400 font-bold text-sm">이미 해당 라인의 선수를 보유하고 있습니다</p>
                  <p className="text-gray-500 text-xs mt-1">다른 팀장이 낙찰할 때까지 대기하세요</p>
                </div>
              ) : (
                <>
                  {bidError && <p className="text-red-400 text-center text-sm">{bidError}</p>}
                  <div className="grid grid-cols-4 gap-2">
                    {quickBids.map(q => (
                      <button key={q.label}
                        onClick={() => placeBid(q.val)}
                        className="py-3 text-center font-bold bg-orange-900/60 hover:bg-orange-800 border border-orange-700 rounded-xl transition-all text-orange-300 active:scale-95">
                        <div className="text-base">{q.label}</div>
                        <div className="text-sm text-orange-400 mt-0.5">{q.val}pt</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
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
                <div className="grid grid-cols-3 gap-2 animate-modal-in">
                  <button onClick={pauseAuction} className="py-3 text-base font-bold bg-orange-700 hover:bg-orange-600 rounded-xl transition-all duration-200">⏸ 일시정지</button>
                  <button onClick={finalizeSale} className="py-3 text-base font-bold bg-blue-700 hover:bg-blue-600 rounded-xl transition-all duration-200">🔨 강제낙찰</button>
                  <button onClick={passCurrent} className="py-3 text-base font-bold bg-gray-600 hover:bg-gray-500 rounded-xl transition-all duration-200">⏭ 강제유찰</button>
                </div>
              )}
              {auction?.status === 'paused' && (
                <div className="grid grid-cols-2 gap-2 animate-modal-in">
                  <button onClick={resumeAuction} className="py-3 text-xl font-bold bg-green-600 hover:bg-green-500 rounded-xl transition-all duration-200">▶ 재진행</button>
                  <button onClick={passCurrent} className="py-3 text-xl font-bold bg-gray-600 hover:bg-gray-500 rounded-xl transition-all duration-200">⏭ 강제유찰</button>
                </div>
              )}
              {auction?.status === 'done' && (
                <button onClick={async () => {
                  await update(ref(db), { [`rooms/${code}/info/status`]: 'result' });
                }} className="w-full py-4 text-xl font-bold bg-purple-600 hover:bg-purple-500 rounded-xl transition-all">
                  🏆 결과 보기
                </button>
              )}
            </div>
          )}

          {/* Bid history log */}
          {['bidding', 'paused', 'sold', 'passed'].includes(auction?.status) && bidLogList.length > 0 && (
            <div className="bg-gray-900/60 rounded-xl p-3 space-y-1.5 max-h-48 overflow-y-auto">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">입찰 내역</p>
              {bidLogList.map((b, i) => {
                const cap = captains[b.captainId];
                const prevCap = b.prevCaptainId ? captains[b.prevCaptainId] : null;
                return (
                  <div key={b.timestamp} className="animate-modal-in" style={{ animationDelay: `${i * 0.03}s` }}>
                    {prevCap && (
                      <p className="text-gray-500 text-sm leading-tight">{prevCap.name}</p>
                    )}
                    <p className="text-base font-bold leading-tight">
                      <span className="text-gray-400">→ </span>
                      <span className="text-orange-400">{cap?.name || '?'}</span>
                      <span className="text-white ml-1">{b.amount}pt</span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {(!auction || auction?.status === 'idle') && role !== 'admin' && (
            <div className="text-center py-16 text-gray-600 text-lg">관리자가 경매를 시작할 때까지 대기하세요.</div>
          )}
        </main>

        {/* RIGHT: NEXT Preview + Grouped Queue + History */}
        <aside className="border-l border-gray-800 overflow-y-auto p-4 space-y-4">

          {/* NEXT preview card */}
          {nextQueuePlayer && (
            <div>
              <h2 className="text-xl font-bold text-gray-300 mb-2">다음 선수</h2>
              <div key={nextQueuePlayer.id} className="flex items-center gap-2 text-base">
                {nextQueuePlayer.photo ? <img src={nextQueuePlayer.photo} alt={nextQueuePlayer.name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" /> : <span className="flex-shrink-0">👤</span>}
                <div className="flex-1 min-w-0">
                  <p className="text-gray-300 truncate leading-tight">{nextQueuePlayer.name}</p>
                  {(nextQueuePlayer.tierType || nextQueuePlayer.position) && (
                    <span className="text-sm text-gray-600 font-bold">{[nextQueuePlayer.tierType, nextQueuePlayer.position].filter(Boolean).join(' ')}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* All players — 2-column: 고티어 | 저티어, with inline sold/passed status */}
          <div>
            <h2 className="text-xl font-bold text-gray-300 sticky top-0 bg-[#0f0f1a] pb-2 z-10">
              총 <span className="text-orange-400">{totalPlayerCount}</span>명
            </h2>
            {totalPlayerCount > 0 ? (
              <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                {['딜러', '탱커', '힐러'].map(pos => {
                  const high = allGrouped.find(g => g.key === `고티어 ${pos}`);
                  const low = allGrouped.find(g => g.key === `저티어 ${pos}`);
                  if (!high && !low) return null;
                  return [
                    <div key={`고티어-${pos}`}>
                      <div className="flex items-center gap-1 mb-1">
                        <span className={`px-2 py-0.5 text-sm font-black rounded-full border ${TIER_POS_STYLES[`고티어 ${pos}`] || 'bg-gray-700 text-gray-300 border-gray-600'}`}>
                          고티어 {pos}
                        </span>
                        {high && <span className="text-gray-600 text-sm">{high.players.length}</span>}
                      </div>
                      <div className="space-y-0.5">
                        {high ? high.players.map(p => {
                          const soldCap = p.soldTo ? captains[p.soldTo] : null;
                          return (
                            <div key={p.id} className={`flex items-center gap-1.5 py-1 px-1 rounded-lg ${p.soldTo ? 'bg-green-950/40' : p.soldPrice === null && passedPlayers.some(pp => pp.id === p.id) ? 'bg-gray-800/60' : 'bg-gray-900/60'}`}>
                              {p.photo ? <img src={p.photo} alt={p.name} className="w-5 h-5 rounded-full object-cover flex-shrink-0" /> : <span className="text-sm flex-shrink-0">👤</span>}
                              {soldCap ? (
                                <p className="text-sm font-bold text-green-400 truncate flex-1">{p.name} → {soldCap.name} 팀</p>
                              ) : !p.soldTo && passedPlayers.some(pp => pp.id === p.id) ? (
                                <p className="text-sm font-bold text-gray-500 truncate flex-1 line-through">{p.name} → 유찰</p>
                              ) : (
                                <p className="text-sm font-bold text-white truncate flex-1">{p.name}</p>
                              )}
                            </div>
                          );
                        }) : <p className="text-gray-700 text-xs py-1 px-1">—</p>}
                      </div>
                    </div>,
                    <div key={`저티어-${pos}`}>
                      <div className="flex items-center gap-1 mb-1">
                        <span className={`px-2 py-0.5 text-sm font-black rounded-full border ${TIER_POS_STYLES[`저티어 ${pos}`] || 'bg-gray-700 text-gray-300 border-gray-600'}`}>
                          저티어 {pos}
                        </span>
                        {low && <span className="text-gray-600 text-sm">{low.players.length}</span>}
                      </div>
                      <div className="space-y-0.5">
                        {low ? low.players.map(p => {
                          const soldCap = p.soldTo ? captains[p.soldTo] : null;
                          return (
                            <div key={p.id} className={`flex items-center gap-1.5 py-1 px-1 rounded-lg ${p.soldTo ? 'bg-green-950/40' : !p.soldTo && passedPlayers.some(pp => pp.id === p.id) ? 'bg-gray-800/60' : 'bg-gray-900/60'}`}>
                              {p.photo ? <img src={p.photo} alt={p.name} className="w-5 h-5 rounded-full object-cover flex-shrink-0" /> : <span className="text-sm flex-shrink-0">👤</span>}
                              {soldCap ? (
                                <p className="text-sm font-bold text-green-400 truncate flex-1">{p.name} → {soldCap.name} 팀</p>
                              ) : !p.soldTo && passedPlayers.some(pp => pp.id === p.id) ? (
                                <p className="text-sm font-bold text-gray-500 truncate flex-1 line-through">{p.name} → 유찰</p>
                              ) : (
                                <p className="text-sm font-bold text-white truncate flex-1">{p.name}</p>
                              )}
                            </div>
                          );
                        }) : <p className="text-gray-700 text-xs py-1 px-1">—</p>}
                      </div>
                    </div>,
                  ];
                })}
                {allUngrouped.length > 0 && (
                  <div className="col-span-2">
                    <div className="flex items-center gap-1 mb-1">
                      <span className="px-2 py-0.5 text-sm font-black rounded-full border bg-gray-700 text-gray-300 border-gray-600">기타</span>
                      <span className="text-gray-600 text-sm">{allUngrouped.length}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-0.5">
                      {allUngrouped.map(p => {
                        const soldCap = p.soldTo ? captains[p.soldTo] : null;
                        return (
                          <div key={p.id} className={`flex items-center gap-1.5 py-1 px-1 rounded-lg ${p.soldTo ? 'bg-green-950/40' : !p.soldTo && passedPlayers.some(pp => pp.id === p.id) ? 'bg-gray-800/60' : 'bg-gray-900/60'}`}>
                            {p.photo ? <img src={p.photo} alt={p.name} className="w-5 h-5 rounded-full object-cover flex-shrink-0" /> : <span className="text-sm flex-shrink-0">👤</span>}
                            {soldCap ? (
                              <p className="text-sm font-bold text-green-400 truncate flex-1">{p.name} → {soldCap.name} 팀</p>
                            ) : !p.soldTo && passedPlayers.some(pp => pp.id === p.id) ? (
                              <p className="text-sm font-bold text-gray-500 truncate flex-1 line-through">{p.name} → 유찰</p>
                            ) : (
                              <p className="text-sm font-bold text-white truncate flex-1">{p.name}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-600 text-base">선수 없음</p>
            )}
          </div>
        </aside>

      </div>
    </div>
  );
}
