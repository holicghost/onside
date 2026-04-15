'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ref, onValue, update, get } from 'firebase/database';
import { db } from '@/lib/firebase';
import { getHeroPortraitUrl, ALL_HEROES } from '@/lib/heroes';

const toArr = (val) => !val ? [] : Array.isArray(val) ? val : Object.values(val);

export default function CaptainPage() {
  const { code, captainId } = useParams();
  const router = useRouter();

  const [authed, setAuthed] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(true);
  const [roomInfo, setRoomInfo] = useState(null);
  const [captains, setCaptains] = useState({});
  const [players, setPlayers] = useState({});
  const [auction, setAuction] = useState(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [countdownLeft, setCountdownLeft] = useState(0);
  const [bidAmount, setBidAmount] = useState('');
  const [bidError, setBidError] = useState('');

  const auctionRef = useRef(null);
  useEffect(() => { auctionRef.current = auction; }, [auction]);

  // Check auth on mount
  useEffect(() => {
    if (!code || !captainId) return;
    const storedRoom = localStorage.getItem('ow_room');
    const storedCaptain = localStorage.getItem('ow_captain_id');
    const storedRole = localStorage.getItem('ow_role');
    if (storedRoom === code && storedCaptain === captainId && storedRole === 'captain') {
      setAuthed(true);
    }
    // Fetch room to check if password is needed
    get(ref(db, `rooms/${code}/info`)).then(snap => {
      const info = snap.val();
      setRoomInfo(info);
      if (!info?.password) {
        // No password needed — auto-auth
        localStorage.setItem('ow_room', code);
        localStorage.setItem('ow_role', 'captain');
        localStorage.setItem('ow_captain_id', captainId);
        setAuthed(true);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [code, captainId]);

  // Firebase listeners once authed
  useEffect(() => {
    if (!authed || !code) return;
    const unsubs = [
      onValue(ref(db, `rooms/${code}/info`), s => setRoomInfo(s.val())),
      onValue(ref(db, `rooms/${code}/captains`), s => setCaptains(s.val() || {})),
      onValue(ref(db, `rooms/${code}/players`), s => setPlayers(s.val() || {})),
      onValue(ref(db, `rooms/${code}/auction`), s => setAuction(s.val())),
    ];
    return () => unsubs.forEach(u => u());
  }, [authed, code]);

  // Bidding timer
  useEffect(() => {
    if (!auction?.timerEnd || auction?.status !== 'bidding') { setTimeLeft(0); return; }
    const tick = () => setTimeLeft(Math.max(0, auction.timerEnd - Date.now()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [auction?.timerEnd, auction?.status]);

  // Pre-player countdown
  useEffect(() => {
    if (!auction?.countdownEnd || auction?.status !== 'countdown') { setCountdownLeft(0); return; }
    const tick = () => setCountdownLeft(Math.max(0, auction.countdownEnd - Date.now()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [auction?.countdownEnd, auction?.status]);

  const handlePasswordJoin = () => {
    if (roomInfo?.password && passwordInput !== roomInfo.password) {
      setPasswordError('비밀번호가 틀렸습니다.');
      return;
    }
    localStorage.setItem('ow_room', code);
    localStorage.setItem('ow_role', 'captain');
    localStorage.setItem('ow_captain_id', captainId);
    setAuthed(true);
    setPasswordError('');
  };

  const placeBid = async (amount) => {
    setBidError('');
    const a = auctionRef.current;
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
    setBidAmount('');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f1a' }}>
        <div className="text-white text-2xl">로딩 중...</div>
      </div>
    );
  }

  // Password gate
  if (!authed && roomInfo?.password) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 50%, #0f0f1a 100%)' }}>
        <div className="w-full max-w-sm bg-gray-900/80 border border-gray-700 rounded-2xl p-6 space-y-4">
          <div className="text-center">
            <h2 className="text-2xl font-black text-white">{roomInfo?.name || '경매 방'}</h2>
            <p className="text-gray-400 mt-1">팀장으로 입장합니다</p>
          </div>
          <input
            type="password"
            className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:border-orange-400 focus:outline-none"
            placeholder="방 비밀번호"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePasswordJoin()}
          />
          {passwordError && <p className="text-red-400 text-center text-sm">{passwordError}</p>}
          <button onClick={handlePasswordJoin} className="w-full py-3 text-xl font-bold bg-orange-500 hover:bg-orange-400 rounded-xl transition-all">
            입장
          </button>
        </div>
      </div>
    );
  }

  // Redirect if captain doesn't exist
  const myCaptain = captains[captainId];
  const currentPlayer = auction?.currentPlayerId ? players[auction.currentPlayerId] : null;
  const playerOrder = toArr(auction?.playerOrder);
  const currentIdx = auction?.currentIndex || 0;
  const nextQueuePlayer = playerOrder[currentIdx + 1] ? players[playerOrder[currentIdx + 1]] : null;
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

  const teamPlayers = Object.values(players).filter(p => p.soldTo === captainId);

  const statusLabel = { idle: '⏳ 대기 중', countdown: '⏱ 경매 준비', bidding: '🔨 경매 중', paused: '⏸ 일시정지', sold: '✅ 낙찰', passed: '⏭ 유찰', done: '🏆 완료' };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0f0f1a' }}>
      {/* Captain header */}
      <header className="px-4 py-4 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-white">{roomInfo?.name || '경매'}</h1>
            <p className="text-sm text-gray-500">코드: <span className="text-orange-400 font-mono font-bold">{code}</span></p>
          </div>
          <div className="text-right">
            <p className="text-lg font-black text-white">{myCaptain?.name || '팀장'}</p>
            <p className="text-sm text-gray-400">예산 <span className="text-green-400 font-black text-xl">{myBudget}</span>P</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-lg mx-auto w-full">
        {/* Status */}
        <div className={`px-4 py-2 rounded-full text-base font-bold text-center ${
          auction?.status === 'bidding' ? 'bg-green-900/60 text-green-300 border border-green-700' :
          auction?.status === 'countdown' ? 'bg-yellow-900/60 text-yellow-300 border border-yellow-700' :
          auction?.status === 'paused' ? 'bg-orange-900/60 text-orange-300 border border-orange-700' :
          auction?.status === 'sold' ? 'bg-blue-900/60 text-blue-300 border border-blue-700' :
          'bg-gray-800 text-gray-400'
        }`}>
          {statusLabel[auction?.status] || '⏳ 대기 중'}
        </div>

        {/* Pre-player countdown */}
        {auction?.status === 'countdown' && currentPlayer && (
          <div className="bg-gray-900 border border-yellow-700 rounded-2xl p-5 text-center space-y-3">
            <p className="text-yellow-400 font-bold">다음 선수 경매 준비</p>
            {currentPlayer.photo
              ? <img src={currentPlayer.photo} alt={currentPlayer.name} className="w-20 h-20 rounded-full object-cover mx-auto" />
              : <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center text-3xl mx-auto">👤</div>
            }
            <h3 className="text-2xl font-black text-white">{currentPlayer.name}</h3>
            {currentPlayer.tierCurrent && <p className="text-purple-400 text-sm">{currentPlayer.tierCurrent}</p>}
            <div key={displayCountdown} className="text-6xl font-black text-yellow-400 animate-count-down">{displayCountdown}</div>
            <p className="text-gray-500 text-sm">초 후 경매 시작</p>
          </div>
        )}

        {/* Active auction */}
        {['bidding', 'paused'].includes(auction?.status) && currentPlayer && (
          <>
            <div className="bg-gray-900 border border-orange-500 rounded-2xl overflow-hidden">
              {currentPlayer.photo
                ? <div className="relative h-44">
                    <img src={currentPlayer.photo} alt={currentPlayer.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #111827 0%, transparent 60%)' }} />
                    <h3 className="absolute bottom-3 left-4 text-2xl font-black text-white">{currentPlayer.name}</h3>
                    {auction?.currentBid > 0 && (
                      <span className="absolute top-3 right-3 px-2 py-1 bg-orange-500/90 text-white text-xs font-bold rounded-full">입찰 중</span>
                    )}
                  </div>
                : <div className="p-5 text-center relative">
                    <span className="text-4xl">👤</span>
                    <h3 className="text-2xl font-black text-white mt-2">{currentPlayer.name}</h3>
                    {auction?.currentBid > 0 && (
                      <span className="absolute top-3 right-3 px-2 py-1 bg-orange-500/90 text-white text-xs font-bold rounded-full">입찰 중</span>
                    )}
                  </div>
              }
              <div className="p-4 space-y-2">
                {/* Hero portraits */}
                {toArr(currentPlayer.heroIds).filter(Boolean).length > 0 && (
                  <div className="flex gap-2">
                    {toArr(currentPlayer.heroIds).filter(Boolean).map((hid, i) => {
                      const url = getHeroPortraitUrl(hid);
                      const hero = ALL_HEROES.find(h => h.id === hid);
                      return url ? (
                        <div key={i} className="w-10 h-10 rounded-lg overflow-hidden bg-gray-700 flex-shrink-0">
                          <img src={url} alt={hero?.name} className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none'; }} />
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
                {currentPlayer.tierCurrent && <p className="text-purple-400 text-sm">{currentPlayer.tierCurrent}</p>}
                {currentPlayer.comment && <p className="text-gray-400 text-sm italic">"{currentPlayer.comment}"</p>}
              </div>
            </div>

            {/* Timer */}
            {auction?.status === 'bidding' && (
              <div className="text-center">
                <p className="text-gray-400 text-sm">입찰 종료까지</p>
                <div className={`text-5xl font-black ${
                  timeLeft <= 3000 ? 'text-red-500 animate-timer-blink' : timeLeft <= 6000 ? 'text-yellow-400' : 'text-white'
                }`}>
                  {displayTime}초
                </div>
                {nextQueuePlayer && (
                  <div className="mt-2 flex items-center gap-2 bg-gray-800/60 rounded-xl px-3 py-2 justify-center">
                    <span className="text-gray-500 text-xs font-bold">NEXT</span>
                    {nextQueuePlayer.photo ? <img src={nextQueuePlayer.photo} alt={nextQueuePlayer.name} className="w-6 h-6 rounded-full object-cover" /> : <span>👤</span>}
                    <span className="text-gray-300 text-sm font-bold">{nextQueuePlayer.name}</span>
                  </div>
                )}
              </div>
            )}

            {auction?.status === 'paused' && (
              <div className="text-center bg-orange-900/30 border border-orange-700 rounded-xl p-3">
                <p className="text-orange-400 font-bold">⏸ 경매 일시정지됨</p>
              </div>
            )}

            {/* Current bid */}
            <div className="bg-gray-800 rounded-xl p-4 text-center">
              <p className="text-gray-400 text-sm">현재 최고 입찰</p>
              <p className="text-4xl font-black text-orange-400">{curBid > 0 ? `${curBid}P` : '—'}</p>
              {auction?.currentBidCaptainId && (
                <p className="text-gray-300 text-sm mt-1">
                  {captains[auction.currentBidCaptainId]?.name} 팀장
                  {auction.currentBidCaptainId === captainId && <span className="text-green-400 ml-1 font-bold">(나)</span>}
                </p>
              )}
            </div>

            {/* Bid UI */}
            {auction?.status === 'bidding' && (
              <div className="space-y-2">
                {bidError && <p className="text-red-400 text-center text-sm">{bidError}</p>}
                <div className="grid grid-cols-4 gap-2">
                  {quickBids.map(q => (
                    <button key={q.label}
                      onClick={() => { placeBid(q.val); setBidAmount(String(q.val)); }}
                      className="py-3 text-center font-bold bg-orange-900/60 hover:bg-orange-800 border border-orange-700 rounded-xl transition-all text-orange-300 active:scale-95">
                      <div className="text-base">{q.label}</div>
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
                    className="flex-1 px-4 py-4 text-2xl font-bold bg-gray-800 border border-gray-600 rounded-xl text-center focus:border-orange-400 focus:outline-none"
                  />
                  <button
                    onClick={() => placeBid(Number(bidAmount))}
                    disabled={!bidAmount || Number(bidAmount) <= curBid || Number(bidAmount) > myBudget}
                    className="px-6 py-4 text-xl font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all active:scale-95"
                  >
                    입찰
                  </button>
                </div>
                <p className="text-center text-gray-500 text-sm">
                  내 예산: <span className="text-green-400 font-bold">{myBudget}P</span>
                </p>
              </div>
            )}
          </>
        )}

        {/* Sold result */}
        {auction?.status === 'sold' && (
          <div className={`rounded-2xl p-5 text-center border ${
            auction.currentBidCaptainId === captainId
              ? 'bg-green-900/40 border-green-600'
              : 'bg-blue-900/30 border-blue-700'
          }`}>
            {auction.currentBidCaptainId === captainId ? (
              <>
                <p className="text-green-400 text-2xl font-black">낙찰 성공!</p>
                <p className="text-4xl font-black text-orange-400 mt-1">{auction.currentBid}P</p>
                <p className="text-gray-400 text-sm mt-2">남은 예산: {myBudget - auction.currentBid}P → 다음 선수 대기 중</p>
              </>
            ) : (
              <>
                <p className="text-blue-300 text-xl font-bold">{captains[auction.currentBidCaptainId]?.name} 팀 낙찰</p>
                <p className="text-3xl font-black text-orange-400 mt-1">{auction.currentBid}P</p>
              </>
            )}
          </div>
        )}

        {auction?.status === 'passed' && (
          <div className="bg-gray-800 border border-gray-600 rounded-2xl p-4 text-center">
            <p className="text-gray-400 text-xl font-bold">유찰</p>
            <p className="text-gray-500 text-sm mt-1">재경매 라운드에 포함됩니다</p>
          </div>
        )}

        {auction?.status === 'done' && (
          <div className="bg-purple-900/30 border border-purple-700 rounded-2xl p-5 text-center">
            <p className="text-purple-300 text-2xl font-black">경매 완료!</p>
            <p className="text-gray-400 mt-2">내 팀: {teamPlayers.length}명</p>
          </div>
        )}

        {(!auction || auction?.status === 'idle') && (
          <div className="text-center py-10 text-gray-600 text-xl">관리자가 경매를 시작할 때까지 대기하세요.</div>
        )}

        {/* My team roster */}
        {teamPlayers.length > 0 && (
          <div className="bg-gray-900/60 border border-gray-700 rounded-2xl p-4">
            <h3 className="text-base font-bold text-gray-300 mb-3">내 팀 ({teamPlayers.length}명)</h3>
            <div className="space-y-2">
              {teamPlayers.map(p => (
                <div key={p.id} className="flex items-center gap-3">
                  {p.photo ? <img src={p.photo} alt={p.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" /> : <span className="text-xl">👤</span>}
                  <span className="text-white font-bold flex-1">{p.name}</span>
                  <span className="text-orange-400 text-sm font-bold">{p.soldPrice}P</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
