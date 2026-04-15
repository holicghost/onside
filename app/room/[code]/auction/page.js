'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ref, onValue, update } from 'firebase/database';
import { db } from '@/lib/firebase';

const ROLE_BG = { tank: 'bg-yellow-900/50 text-yellow-300', damage: 'bg-red-900/50 text-red-300', support: 'bg-green-900/50 text-green-300' };
const ROLE_LABEL = { tank: '탱커', damage: '딜러', support: '서포터' };

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
  const [bidAmount, setBidAmount] = useState(1);
  const [bidError, setBidError] = useState('');
  const [copied, setCopied] = useState(false);

  const auctionRef = useRef(null);
  const captainsRef = useRef({});
  const playersRef = useRef({});

  useEffect(() => {
    auctionRef.current = auction;
  }, [auction]);
  useEffect(() => { captainsRef.current = captains; }, [captains]);
  useEffect(() => { playersRef.current = players; }, [players]);

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
      onValue(ref(db, `rooms/${code}/auction`), s => {
        const a = s.val();
        setAuction(a);
        if (a?.status === 'done') router.push(`/room/${code}/result`);
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [code]);

  // Timer countdown
  useEffect(() => {
    if (!auction?.timerEnd || auction?.status !== 'bidding') {
      setTimeLeft(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((auction.timerEnd - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [auction?.timerEnd, auction?.status]);

  // Auto finalize when timer hits 0 (admin only)
  useEffect(() => {
    if (timeLeft !== 0 || auction?.status !== 'bidding' || role !== 'admin') return;
    finalizeSale();
  }, [timeLeft]);

  const finalizeSale = useCallback(async () => {
    const a = auctionRef.current;
    const caps = captainsRef.current;
    if (!a || a.status !== 'bidding') return;

    const updates = {};
    if (a.currentBidCaptainId && a.currentBid > 0) {
      const cap = caps[a.currentBidCaptainId];
      const newBudget = (cap?.budget || 0) - a.currentBid;
      updates[`rooms/${code}/auction/status`] = 'sold';
      updates[`rooms/${code}/players/${a.currentPlayerId}/soldTo`] = a.currentBidCaptainId;
      updates[`rooms/${code}/players/${a.currentPlayerId}/soldPrice`] = a.currentBid;
      updates[`rooms/${code}/captains/${a.currentBidCaptainId}/budget`] = Math.max(0, newBudget);
      updates[`rooms/${code}/auction/history/${Date.now()}`] = {
        playerId: a.currentPlayerId,
        captainId: a.currentBidCaptainId,
        price: a.currentBid,
        timestamp: Date.now(),
      };
    } else {
      updates[`rooms/${code}/auction/status`] = 'passed';
    }
    updates[`rooms/${code}/auction/timerEnd`] = null;
    await update(ref(db), updates);
  }, [code]);

  const startAuction = async () => {
    const playerIds = Object.keys(players);
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
    await update(ref(db), {
      [`rooms/${code}/auction/playerOrder`]: shuffled,
      [`rooms/${code}/auction/currentIndex`]: 0,
      [`rooms/${code}/auction/currentPlayerId`]: shuffled[0],
      [`rooms/${code}/auction/status`]: 'bidding',
      [`rooms/${code}/auction/currentBid`]: 0,
      [`rooms/${code}/auction/currentBidCaptainId`]: null,
      [`rooms/${code}/auction/timerEnd`]: Date.now() + 15000,
    });
  };

  const nextPlayer = async () => {
    const a = auction;
    if (!a) return;
    const order = Array.isArray(a.playerOrder)
      ? a.playerOrder
      : a.playerOrder ? Object.values(a.playerOrder) : [];
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
      [`rooms/${code}/auction/status`]: 'bidding',
      [`rooms/${code}/auction/currentBid`]: 0,
      [`rooms/${code}/auction/currentBidCaptainId`]: null,
      [`rooms/${code}/auction/timerEnd`]: Date.now() + 15000,
    });
  };

  const passCurrent = async () => {
    await update(ref(db), {
      [`rooms/${code}/auction/status`]: 'passed',
      [`rooms/${code}/auction/timerEnd`]: null,
    });
  };

  const placeBid = async () => {
    setBidError('');
    const a = auction;
    if (!a || a.status !== 'bidding') return;
    if (bidAmount <= a.currentBid) {
      setBidError('현재 입찰가보다 높아야 합니다.');
      return;
    }
    const myCap = captains[captainId];
    if (!myCap || bidAmount > myCap.budget) {
      setBidError('예산이 부족합니다.');
      return;
    }
    await update(ref(db), {
      [`rooms/${code}/auction/currentBid`]: bidAmount,
      [`rooms/${code}/auction/currentBidCaptainId`]: captainId,
      [`rooms/${code}/auction/timerEnd`]: Date.now() + 15000,
    });
    setBidAmount(bidAmount + 1);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/room/${code}/auction`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Derived data
  const currentPlayer = auction?.currentPlayerId ? players[auction.currentPlayerId] : null;
  const captainsList = Object.entries(captains).map(([id, c]) => ({ id, ...c }));
  const myCaptain = captainId ? captains[captainId] : null;

  const playerOrder = auction?.playerOrder
    ? (Array.isArray(auction.playerOrder) ? auction.playerOrder : Object.values(auction.playerOrder))
    : [];
  const currentIdx = auction?.currentIndex || 0;
  const queuePlayers = playerOrder.slice(currentIdx + 1).map(pid => players[pid]).filter(Boolean);

  const historyList = auction?.history
    ? Object.values(auction.history).sort((a, b) => b.timestamp - a.timestamp)
    : [];

  const statusLabel = {
    idle: '⏳ 대기 중',
    bidding: '🔨 경매 진행 중',
    sold: '✅ 낙찰!',
    passed: '⏭ 패스',
    done: '🏆 경매 완료',
  };
  const statusColor = {
    idle: 'bg-gray-800 text-gray-400',
    bidding: 'bg-green-900/60 text-green-300 border border-green-700',
    sold: 'bg-blue-900/60 text-blue-300 border border-blue-700',
    passed: 'bg-gray-700/60 text-gray-400',
    done: 'bg-purple-900/60 text-purple-300 border border-purple-700',
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0f0f1a' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-black text-white">{roomInfo?.name || '경매'}</h1>
          <span className="text-sm text-gray-500">
            코드: <span className="font-mono text-orange-400 font-bold">{code}</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${
            role === 'admin' ? 'bg-purple-900 text-purple-300' :
            role === 'captain' ? 'bg-orange-900 text-orange-300' :
            'bg-gray-800 text-gray-400'
          }`}>
            {role === 'admin' ? '관리자' :
             role === 'captain' ? `팀장: ${captains[captainId]?.name || ''}` :
             '관전자'}
          </span>
          <button onClick={copyLink} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-all">
            {copied ? '✅ 복사됨' : '🔗 링크 복사'}
          </button>
        </div>
      </header>

      {/* 3-column body */}
      <div className="flex-1 grid overflow-hidden" style={{ gridTemplateColumns: '260px 1fr 260px' }}>

        {/* ── LEFT: Team Rosters ── */}
        <aside className="border-r border-gray-800 overflow-y-auto p-4 space-y-3">
          <h2 className="text-lg font-bold text-gray-300 sticky top-0 bg-[#0f0f1a] pb-2">팀 로스터</h2>
          {captainsList.map(cap => {
            const teamPlayers = Object.values(players).filter(p => p.soldTo === cap.id);
            const isLeader = cap.id === auction?.currentBidCaptainId;
            return (
              <div key={cap.id} className={`rounded-xl p-3 border transition-all ${isLeader ? 'border-orange-500 bg-orange-950/30' : 'border-gray-700 bg-gray-900/40'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {cap.photo
                    ? <img src={cap.photo} alt={cap.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-lg flex-shrink-0">👤</div>
                  }
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm truncate">{cap.name}</p>
                    <p className="text-xs text-gray-400">
                      예산 <span className="text-green-400 font-bold">{cap.budget}</span>
                      <span className="text-gray-600">/{roomInfo?.budget}</span>P
                    </p>
                  </div>
                </div>
                {teamPlayers.length > 0
                  ? <div className="space-y-1 border-t border-gray-700 pt-2">
                      {teamPlayers.map(p => (
                        <div key={p.id} className="flex items-center gap-2 text-xs">
                          {p.photo
                            ? <img src={p.photo} alt={p.name} className="w-5 h-5 rounded-full object-cover" />
                            : <span>👤</span>
                          }
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

        {/* ── CENTER: Auction ── */}
        <main className="overflow-y-auto p-6 flex flex-col items-center gap-5">
          {/* Status badge */}
          <div className={`px-5 py-2 rounded-full text-xl font-bold ${statusColor[auction?.status] || 'bg-gray-800 text-gray-400'}`}>
            {statusLabel[auction?.status] || '⏳ 대기 중'}
          </div>

          {/* Current player card */}
          {currentPlayer ? (
            <div className={`w-full max-w-xs bg-gray-900 rounded-2xl overflow-hidden border-2 transition-all ${
              auction?.status === 'bidding' ? 'border-orange-500 animate-pulse-glow' : 'border-gray-700'
            }`}>
              {currentPlayer.photo
                ? <div className="relative w-full h-52">
                    <img src={currentPlayer.photo} alt={currentPlayer.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #111827 0%, transparent 60%)' }} />
                    <h3 className="absolute bottom-3 left-4 text-2xl font-black text-white">{currentPlayer.name}</h3>
                  </div>
                : <div className="w-full h-24 bg-gray-800 flex flex-col items-center justify-center gap-1">
                    <span className="text-4xl">👤</span>
                    <h3 className="text-xl font-black text-white">{currentPlayer.name}</h3>
                  </div>
              }
              <div className="p-4 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded-lg text-sm font-bold">
                    {currentPlayer.hero || '영웅 미정'}
                  </span>
                  {currentPlayer.heroRole && (
                    <span className={`px-2 py-1 rounded-lg text-sm font-bold ${ROLE_BG[currentPlayer.heroRole] || 'bg-gray-700 text-gray-300'}`}>
                      {ROLE_LABEL[currentPlayer.heroRole] || currentPlayer.heroRole}
                    </span>
                  )}
                  {currentPlayer.tier && (
                    <span className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded-lg text-sm">{currentPlayer.tier}</span>
                  )}
                  {currentPlayer.style && (
                    <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded-lg text-sm">{currentPlayer.style}</span>
                  )}
                </div>
                {currentPlayer.comment && (
                  <p className="text-gray-400 text-sm italic">"{currentPlayer.comment}"</p>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full max-w-xs h-40 bg-gray-900 rounded-2xl border-2 border-dashed border-gray-700 flex items-center justify-center">
              <span className="text-gray-600 text-lg">선수 없음</span>
            </div>
          )}

          {/* Timer */}
          {auction?.status === 'bidding' && (
            <div className={`text-center ${timeLeft <= 5 ? 'animate-timer-blink' : ''}`}>
              <div className={`text-8xl font-black leading-none ${
                timeLeft <= 5 ? 'text-red-500' : timeLeft <= 10 ? 'text-yellow-400' : 'text-white'
              }`}>
                {timeLeft}
              </div>
              <p className="text-gray-400 text-lg mt-1">초</p>
            </div>
          )}

          {/* Current bid */}
          {auction?.status === 'bidding' && (
            <div className="w-full max-w-xs bg-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-base">현재 최고 입찰</p>
              <p className="text-5xl font-black text-orange-400 leading-none mt-1">
                {auction.currentBid > 0 ? `${auction.currentBid}P` : '—'}
              </p>
              {auction.currentBidCaptainId && (
                <p className="text-gray-300 text-sm mt-1">
                  {captains[auction.currentBidCaptainId]?.name} 팀장
                </p>
              )}
            </div>
          )}

          {/* Bid input — captain only */}
          {role === 'captain' && auction?.status === 'bidding' && captainId && (
            <div className="w-full max-w-xs space-y-2">
              {bidError && <p className="text-red-400 text-center text-sm">{bidError}</p>}
              <div className="flex gap-2">
                <input
                  type="number"
                  value={bidAmount}
                  onChange={e => setBidAmount(Number(e.target.value))}
                  min={Math.max(1, (auction.currentBid || 0) + 1)}
                  max={myCaptain?.budget || 0}
                  className="flex-1 px-4 py-3 text-2xl font-bold bg-gray-800 border border-gray-600 rounded-xl text-center focus:border-orange-400 focus:outline-none"
                />
                <button
                  onClick={placeBid}
                  disabled={bidAmount <= (auction.currentBid || 0) || bidAmount > (myCaptain?.budget || 0)}
                  className="px-6 py-3 text-xl font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all"
                >
                  입찰
                </button>
              </div>
              <p className="text-center text-gray-400 text-sm">
                내 예산: <span className="text-green-400 font-bold">{myCaptain?.budget || 0}P</span>
              </p>
            </div>
          )}

          {/* Sold result */}
          {auction?.status === 'sold' && auction.currentBidCaptainId && (
            <div className="w-full max-w-xs bg-blue-900/30 border border-blue-700 rounded-xl p-4 text-center">
              <p className="text-blue-300 text-xl font-bold">
                {captains[auction.currentBidCaptainId]?.name} 팀 낙찰!
              </p>
              <p className="text-4xl font-black text-orange-400 mt-1">{auction.currentBid}P</p>
            </div>
          )}

          {/* Admin controls */}
          {role === 'admin' && (
            <div className="w-full max-w-xs space-y-3">
              {(!auction || auction.status === 'idle') && (
                <button onClick={startAuction}
                  className="w-full py-4 text-2xl font-bold bg-green-600 hover:bg-green-500 rounded-xl transition-all">
                  🔨 경매 시작
                </button>
              )}
              {auction?.status === 'bidding' && (
                <>
                  <button onClick={finalizeSale}
                    className="w-full py-3 text-xl font-bold bg-orange-600 hover:bg-orange-500 rounded-xl transition-all">
                    🔨 지금 낙찰
                  </button>
                  <button onClick={passCurrent}
                    className="w-full py-3 text-xl font-bold bg-gray-600 hover:bg-gray-500 rounded-xl transition-all">
                    ⏭ 패스
                  </button>
                </>
              )}
              {(auction?.status === 'sold' || auction?.status === 'passed') && (
                <button onClick={nextPlayer}
                  className="w-full py-4 text-2xl font-bold bg-blue-600 hover:bg-blue-500 rounded-xl transition-all">
                  ▶ 다음 선수
                </button>
              )}
              {auction?.status === 'done' && (
                <button onClick={() => router.push(`/room/${code}/result`)}
                  className="w-full py-4 text-2xl font-bold bg-purple-600 hover:bg-purple-500 rounded-xl transition-all">
                  🏆 결과 보기
                </button>
              )}
            </div>
          )}
        </main>

        {/* ── RIGHT: Queue + History ── */}
        <aside className="border-l border-gray-800 overflow-y-auto p-4 space-y-6">
          {/* Queue */}
          <div>
            <h2 className="text-lg font-bold text-gray-300 sticky top-0 bg-[#0f0f1a] pb-2">
              대기 <span className="text-orange-400">{queuePlayers.length}</span>명
            </h2>
            {queuePlayers.length > 0
              ? <div className="space-y-2">
                  {queuePlayers.map(p => (
                    <div key={p.id} className="flex items-center gap-2 p-2 bg-gray-900/60 rounded-lg">
                      {p.photo
                        ? <img src={p.photo} alt={p.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        : <span className="text-xl flex-shrink-0">👤</span>
                      }
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{p.name}</p>
                        <p className="text-xs text-gray-400">{p.hero}</p>
                      </div>
                    </div>
                  ))}
                </div>
              : <p className="text-gray-600 text-sm">대기 선수 없음</p>
            }
          </div>

          {/* History */}
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
