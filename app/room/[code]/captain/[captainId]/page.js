'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ref, onValue, update, get, set, onDisconnect, query, orderByKey, limitToLast } from 'firebase/database';
import { db } from '@/lib/firebase';
import { getHeroPortraitUrl, loadHeroPortraits, ALL_HEROES } from '@/lib/heroes';

const ROLE_LABEL = { tank: '탱커', damage: '딜러', support: '서포터' };
const toArr = (val) => !val ? [] : Array.isArray(val) ? val : Object.values(val);
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

export default function CaptainPage() {
  const { code, captainId } = useParams();
  const router = useRouter();

  // authStep: 'loading' | 'verify' | 'denied' | 'password' | 'authed'
  const [authStep, setAuthStep] = useState('loading');
  const [captainInfo, setCaptainInfo] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
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
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  const auctionRef = useRef(null);
  const lastTimerEndRef = useRef(null);
  const chatScrollRef = useRef(null);
  useEffect(() => { auctionRef.current = auction; }, [auction]);
  useEffect(() => { setOrigin(window.location.origin); }, []);

  // 영웅 포트레이트 프리로드
  const [, setPortraitsReady] = useState(false);
  useEffect(() => { loadHeroPortraits().then(() => setPortraitsReady(true)); }, []);

  // Check auth on mount
  useEffect(() => {
    if (!code || !captainId) return;
    // Already authed via localStorage — skip all screens
    if (localStorage.getItem('ow_room') === code &&
        localStorage.getItem('ow_captain_id') === captainId &&
        localStorage.getItem('ow_role') === 'captain') {
      setAuthStep('authed');
      return;
    }
    // Fetch room info + this captain's info for the verification screen
    Promise.all([
      get(ref(db, `rooms/${code}/info`)),
      get(ref(db, `rooms/${code}/captains/${captainId}`)),
    ]).then(([infoSnap, capSnap]) => {
      setRoomInfo(infoSnap.val());
      setCaptainInfo(capSnap.val());
      setAuthStep('verify');
    }).catch(() => setAuthStep('verify'));
  }, [code, captainId]);

  const handleConfirmIdentity = () => {
    if (roomInfo?.password) {
      setAuthStep('password');
    } else {
      localStorage.setItem('ow_room', code);
      localStorage.setItem('ow_role', 'captain');
      localStorage.setItem('ow_captain_id', captainId);
      setAuthStep('authed');
    }
  };

  // Firebase listeners once authed
  useEffect(() => {
    if (authStep !== 'authed' || !code) return;
    const unsubs = [
      onValue(ref(db, `rooms/${code}/info`), s => setRoomInfo(s.val())),
      onValue(ref(db, `rooms/${code}/captains`), s => setCaptains(s.val() || {})),
      onValue(ref(db, `rooms/${code}/players`), s => setPlayers(s.val() || {})),
      onValue(ref(db, `rooms/${code}/auction`), s => setAuction(s.val())),
      onValue(query(ref(db, `rooms/${code}/chat`), orderByKey(), limitToLast(50)), snap => {
        const val = snap.val();
        if (!val) { setChatMessages([]); return; }
        setChatMessages(Object.entries(val).map(([k, v]) => ({ id: k, ...v })));
      }),
    ];
    return () => unsubs.forEach(u => u());
  }, [authStep, code]);

  // Auto-redirect when room status becomes 'result'
  useEffect(() => {
    if (authStep !== 'authed' || !code) return;
    if (roomInfo?.status === 'result') router.push(`/room/${code}/result`);
  }, [roomInfo?.status, authStep]);

  // Bidding timer
  useEffect(() => {
    if (!auction?.timerEnd || auction?.status !== 'bidding') { setTimeLeft(0); return; }
    const tick = () => setTimeLeft(Math.max(0, auction.timerEnd - Date.now()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [auction?.timerEnd, auction?.status]);

  // Track max duration for progress bar
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

  // Captain online presence
  useEffect(() => {
    if (authStep !== 'authed' || !code || !captainId) return;
    const presenceRef = ref(db, `rooms/${code}/captains/${captainId}/online`);
    set(presenceRef, true);
    onDisconnect(presenceRef).set(false);
    return () => { set(presenceRef, false); };
  }, [authStep, code, captainId]);

  // Chat auto-scroll
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handlePasswordJoin = () => {
    if (roomInfo?.password && passwordInput !== roomInfo.password) {
      setPasswordError('비밀번호가 틀렸습니다.');
      return;
    }
    localStorage.setItem('ow_room', code);
    localStorage.setItem('ow_role', 'captain');
    localStorage.setItem('ow_captain_id', captainId);
    setAuthStep('authed');
    setPasswordError('');
  };

  const placeBid = async (amount) => {
    setBidError('');
    const a = auctionRef.current;
    if (!a || a.status !== 'bidding') return;
    const amt = Math.floor(Number(amount) / 10) * 10;
    if (amt < 10) { setBidError('최소 입찰가는 10포인트입니다.'); return; }
    if (amt <= (a.currentBid || 0)) { setBidError('현재 입찰가보다 높아야 합니다.'); return; }
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

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || !code) return;
    const senderName = captains[captainId]?.name || '팀장';
    await set(ref(db, `rooms/${code}/chat/${Date.now()}`), { senderName, message: msg, timestamp: Date.now() });
    setChatInput('');
  };

  // ── Auth gates ──
  if (authStep === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f1a' }}>
        <div className="text-white text-2xl">로딩 중...</div>
      </div>
    );
  }

  if (authStep === 'verify') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 50%, #0f0f1a 100%)' }}>
        <div className="w-full max-w-sm space-y-4">
          {/* Broadcasting warning */}
          <div className="bg-red-900/40 border border-red-600 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm font-bold leading-snug">
              ⚠️ 방송 중이라면 이 화면의 링크와 비밀번호가 노출되지 않도록 주의하세요!
            </p>
          </div>

          <div className="bg-gray-900/90 border border-gray-700 rounded-2xl p-6 space-y-5">
            <div className="text-center">
              <p className="text-gray-400 text-sm mb-1">{roomInfo?.name || '경매 방'}</p>
              <h2 className="text-3xl font-black text-white">{captainInfo?.name || '팀장'}</h2>
              <p className="text-gray-400 mt-3 text-lg">본인이 맞으신가요?</p>
            </div>
            <div className="flex gap-3">
              <button onClick={handleConfirmIdentity}
                className="flex-1 py-4 text-xl font-bold bg-orange-500 hover:bg-orange-400 rounded-xl transition-all">
                확인
              </button>
              <button onClick={() => setAuthStep('denied')}
                className="flex-1 py-4 text-xl font-bold bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl transition-all">
                아니오
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (authStep === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 50%, #0f0f1a 100%)' }}>
        <div className="w-full max-w-sm bg-gray-900/90 border border-gray-700 rounded-2xl p-8 text-center space-y-4">
          <div className="text-5xl">🚫</div>
          <p className="text-white text-xl font-bold">올바른 링크로 접속해주세요</p>
          <p className="text-gray-500 text-sm">팀장 전용 링크는 관리자에게 문의하세요.</p>
        </div>
      </div>
    );
  }

  if (authStep === 'password') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 50%, #0f0f1a 100%)' }}>
        <div className="w-full max-w-sm space-y-4">
          <div className="bg-red-900/40 border border-red-600 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm font-bold leading-snug">
              ⚠️ 방송 중이라면 이 화면의 링크와 비밀번호가 노출되지 않도록 주의하세요!
            </p>
          </div>
          <div className="bg-gray-900/90 border border-gray-700 rounded-2xl p-6 space-y-4">
            <div className="text-center">
              <h2 className="text-2xl font-black text-white">{roomInfo?.name || '경매 방'}</h2>
              <p className="text-gray-400 mt-1">방 비밀번호를 입력하세요</p>
            </div>
            <input
              type="password"
              className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:border-orange-400 focus:outline-none"
              placeholder="비밀번호"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePasswordJoin()}
              autoFocus
            />
            {passwordError && <p className="text-red-400 text-center text-sm">{passwordError}</p>}
            <div className="flex gap-3">
              <button onClick={handlePasswordJoin}
                className="flex-1 py-3 text-xl font-bold bg-orange-500 hover:bg-orange-400 rounded-xl transition-all">
                입장
              </button>
              <button onClick={() => setAuthStep('verify')}
                className="py-3 px-4 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl transition-all">
                뒤로
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Derived state ──
  const myCaptain = captains[captainId];
  const captainsList = Object.entries(captains).map(([id, c]) => ({ id, ...c }));
  const currentPlayer = auction?.currentPlayerId ? players[auction.currentPlayerId] : null;
  const playerOrder = toArr(auction?.playerOrder);
  const currentIdx = auction?.currentIndex || 0;
  const queuePlayers = playerOrder.slice(currentIdx + 1).map(pid => players[pid]).filter(Boolean);
  const nextQueuePlayer = queuePlayers[0] || null;
  const historyList = auction?.history ? Object.values(auction.history).sort((a, b) => b.timestamp - a.timestamp) : [];
  const curBid = auction?.currentBid || 0;
  const myBudget = myCaptain?.budget || 0;
  const QUEUE_GROUPS = [
    '고티어 딜러', '저티어 딜러', '고티어 탱커', '저티어 탱커', '고티어 힐러', '저티어 힐러',
  ];
  const restQueue = queuePlayers.slice(1);
  const groupedQueue = QUEUE_GROUPS
    .map(key => ({ key, players: restQueue.filter(p => `${p.tierType} ${p.position}` === key) }))
    .filter(g => g.players.length > 0);
  const ungroupedQueue = restQueue.filter(p => !QUEUE_GROUPS.includes(`${p.tierType} ${p.position}`));
  const quickBids = [
    { label: '+10',  val: curBid + 10 },
    { label: '+20',  val: curBid + 20 },
    { label: '+50',  val: curBid + 50 },
    { label: '+100', val: curBid + 100 },
    { label: '최대', val: Math.floor(myBudget / 10) * 10 },
  ].filter(q => q.val > curBid && q.val <= myBudget);
  const bidderCap = auction?.currentBidCaptainId ? captains[auction.currentBidCaptainId] : null;
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

  // ── PlayerCard (identical to auction page) ──
  const PlayerCard = ({ player }) => {
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
                <span className={`px-3 py-0.5 text-sm font-bold rounded-full border ${
                  TIER_POS_STYLES[`${player.tierType} ${player.position}`] || 'bg-gray-700 text-gray-300 border-gray-600'
                }`}>
                  {[player.tierType, player.position].filter(Boolean).join(' ')}
                </span>
              )}
              {curBid > 0 && auction?.status === 'bidding' && (
                <span className="px-3 py-0.5 bg-orange-500/80 text-white text-sm font-bold rounded-full animate-pulse">입찰 중</span>
              )}
            </div>
            <h2 className="font-black text-white leading-tight" style={{ fontSize: '40px' }}>{player.name}</h2>
            <div className="grid grid-cols-3 gap-1.5 mt-2">
              {[
                { label: '현재 티어', val: player.tierCurrent, color: 'text-purple-400' },
                { label: '이전 시즌 티어', val: player.tierPrevious, color: 'text-gray-300' },
                { label: '역대 최고 티어', val: player.tierBest, color: 'text-yellow-400' },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-gray-800/80 rounded-lg px-2 py-1.5">
                  <p className="text-xs text-gray-500 mb-0.5 leading-tight">{label}</p>
                  <p className={`text-lg font-bold ${color} leading-tight`}>{val || '—'}</p>
                </div>
              ))}
            </div>
            {player.style && (
              <div className="mt-2.5">
                <p className="text-xs text-gray-500 mb-0.5">플레이 스타일</p>
                <p className="text-sm text-gray-300 leading-snug">{player.style}</p>
              </div>
            )}
            {player.comment && (
              <div className="mt-2.5">
                <p className="text-xs text-gray-500 mb-0.5">한마디</p>
                <p className="text-sm text-gray-300 leading-snug">{player.comment}</p>
              </div>
            )}
          </div>
        </div>

        {/* Hero portraits with role badge overlay */}
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

        <div className="px-5 pb-5">
          <p className="text-gray-500 text-sm mb-0.5">현재 입찰</p>
          <p key={curBid} className="font-black text-orange-400 leading-none tabular-nums animate-bid-pop" style={{ fontSize: '48px' }}>
            {curBid > 0 ? `${curBid} pt` : '—'}
          </p>
          {bidderCap && (
            <p className="text-white text-base font-bold mt-1">
              👑 {bidderCap.name} 입찰 중
              {auction?.currentBidCaptainId === captainId && <span className="text-green-400 ml-1">(나)</span>}
            </p>
          )}
        </div>

        {/* Result overlay */}
        {auction?.status === 'sold' && (
          <div
            key={`sold-${auction.currentPlayerId}`}
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none animate-result-in"
            style={{ background: 'rgba(37,99,235,0.82)', borderRadius: 'inherit' }}
          >
            <p className="text-white text-6xl font-black drop-shadow-lg">낙찰!</p>
            {bidderCap && <p className="text-blue-100 text-xl font-bold mt-2">{bidderCap.name} 팀</p>}
          </div>
        )}
        {auction?.status === 'passed' && (
          <div
            key={`passed-${auction.currentPlayerId}`}
            className="absolute inset-0 flex items-center justify-center pointer-events-none animate-result-in"
            style={{ background: 'rgba(75,85,99,0.82)', borderRadius: 'inherit' }}
          >
            <p className="text-white text-6xl font-black drop-shadow-lg">유찰</p>
          </div>
        )}
      </div>
    );
  };

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
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-black text-white">{myCaptain?.name || '팀장'}</p>
          <p className="text-sm text-gray-400">예산 <span className="text-green-400 font-black text-xl">{myBudget}</span>P</p>
        </div>
      </header>

      {/* 3-column layout */}
      <div className="flex-1 grid overflow-hidden" style={{ gridTemplateColumns: '240px 1fr 240px' }}>

        {/* LEFT: Team Rosters */}
        <aside className="border-r border-gray-800 overflow-y-auto p-4 space-y-3">
          <h2 className="text-base font-bold text-gray-300 sticky top-0 bg-[#0f0f1a] pb-2">팀 로스터</h2>
          {captainsList.map(cap => {
            const teamPlayers = Object.values(players).filter(p => p.soldTo === cap.id);
            const isMe = cap.id === captainId;
            const isLeader = cap.id === auction?.currentBidCaptainId;
            return (
              <div key={cap.id} className={`rounded-xl p-3 border transition-all ${
                isLeader ? 'border-orange-500 bg-orange-950/30' :
                isMe ? 'border-blue-700 bg-blue-950/20' :
                'border-gray-700 bg-gray-900/40'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {cap.photo ? <img src={cap.photo} alt={cap.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" /> : <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-lg flex-shrink-0">👤</div>}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cap.online ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
                      <p className="font-bold text-white text-lg truncate">
                        {cap.name}{isMe && <span className="text-blue-400 text-sm ml-1">(나)</span>}
                      </p>
                      {cap.position && (
                        <span className={`px-2 py-0.5 text-xs font-bold rounded-full flex-shrink-0 ${
                          cap.position === '탱커' ? 'bg-yellow-900/60 text-yellow-300' :
                          cap.position === '딜러' ? 'bg-red-900/60 text-red-300' :
                          'bg-green-900/60 text-green-300'
                        }`}>{cap.position}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">예산 <span className="text-green-400 font-bold">{cap.budget}</span><span className="text-gray-600">/{roomInfo?.budget}</span>P</p>
                  </div>
                </div>
                {teamPlayers.length > 0
                  ? <div className="space-y-1.5 border-t border-gray-700 pt-2">
                      {teamPlayers.map(p => (
                        <div key={p.id} className="flex items-center gap-2 text-sm">
                          {p.photo ? <img src={p.photo} alt={p.name} className="w-5 h-5 rounded-full object-cover flex-shrink-0" /> : <span className="flex-shrink-0">👤</span>}
                          <div className="flex-1 min-w-0">
                            <p className="text-gray-300 truncate leading-tight">{p.name}</p>
                            {(p.tierType || p.position) && (
                              <span className="text-xs text-gray-600 font-bold">{[p.tierType, p.position].filter(Boolean).join(' ')}</span>
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

          {/* Link sharing */}
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
              <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-none ${
                    progressPct > 60 ? 'bg-green-500' : progressPct > 30 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {nextQueuePlayer && (
                <div key={nextQueuePlayer.id} className="flex items-center gap-2 bg-gray-800/60 rounded-xl px-4 py-2 animate-slide-up">
                  <span className="text-gray-500 text-xs font-bold flex-shrink-0">NEXT</span>
                  {nextQueuePlayer.photo ? <img src={nextQueuePlayer.photo} alt={nextQueuePlayer.name} className="w-7 h-7 rounded-full object-cover flex-shrink-0" /> : <span className="flex-shrink-0">👤</span>}
                  <span className="text-gray-300 text-sm font-bold flex-1 truncate">{nextQueuePlayer.name}</span>
                  {(nextQueuePlayer.tierType && nextQueuePlayer.position) && (
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full border flex-shrink-0 ${TIER_POS_STYLES[`${nextQueuePlayer.tierType} ${nextQueuePlayer.position}`] || 'bg-gray-700 text-gray-300 border-gray-600'}`}>
                      {nextQueuePlayer.tierType} {nextQueuePlayer.position}
                    </span>
                  )}
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

          {/* Bid UI — captain only */}
          {auction?.status === 'bidding' && (
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
                  placeholder={String(curBid + 10)}
                  className="flex-1 px-4 py-3 text-2xl font-bold bg-gray-800 border border-gray-600 rounded-xl text-center focus:border-orange-400 focus:outline-none"
                />
                <button
                  onClick={() => placeBid(Number(bidAmount))}
                  disabled={!bidAmount || Math.floor(Number(bidAmount)/10)*10 < 10 || Math.floor(Number(bidAmount)/10)*10 <= curBid || Math.floor(Number(bidAmount)/10)*10 > myBudget}
                  className="px-6 py-3 text-xl font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all"
                >
                  입찰
                </button>
              </div>
            </div>
          )}

          {(!auction || auction?.status === 'idle') && (
            <div className="text-center py-16 text-gray-600 text-lg">관리자가 경매를 시작할 때까지 대기하세요.</div>
          )}

          {auction?.status === 'done' && (
            <div className="bg-purple-900/30 border border-purple-700 rounded-2xl p-5 text-center">
              <p className="text-purple-300 text-2xl font-black">경매 완료!</p>
              <p className="text-gray-400 mt-2">내 팀: {Object.values(players).filter(p => p.soldTo === captainId).length}명</p>
            </div>
          )}
        </main>

        {/* RIGHT: NEXT Preview + Grouped Queue + History */}
        <aside className="border-l border-gray-800 overflow-y-auto p-4 space-y-4">

          {/* NEXT preview card */}
          {nextQueuePlayer && (
            <div>
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">다음 선수</h2>
              <div key={nextQueuePlayer.id} className="rounded-xl overflow-hidden border border-blue-700 bg-blue-900/20 animate-slide-up">
                <div className="flex gap-3 p-3">
                  <div className="w-16 h-20 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0">
                    {nextQueuePlayer.photo
                      ? <img src={nextQueuePlayer.photo} alt={nextQueuePlayer.name} className="w-full h-full object-cover object-top" />
                      : <div className="w-full h-full flex items-center justify-center text-2xl">👤</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black text-base leading-tight">{nextQueuePlayer.name}</p>
                    {(nextQueuePlayer.tierType && nextQueuePlayer.position) && (
                      <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-bold rounded-full border ${TIER_POS_STYLES[`${nextQueuePlayer.tierType} ${nextQueuePlayer.position}`] || 'bg-gray-700 text-gray-300 border-gray-600'}`}>
                        {nextQueuePlayer.tierType} {nextQueuePlayer.position}
                      </span>
                    )}
                    {nextQueuePlayer.tierCurrent && (
                      <p className="text-gray-400 text-xs mt-1">{nextQueuePlayer.tierCurrent}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Grouped waiting queue */}
          <div>
            <h2 className="text-base font-bold text-gray-300 sticky top-0 bg-[#0f0f1a] pb-2">
              대기 <span className="text-orange-400">{queuePlayers.length}</span>명
            </h2>
            {restQueue.length > 0 ? (
              <div className="space-y-3">
                {groupedQueue.map(g => (
                  <div key={g.key}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className={`px-2 py-0.5 text-[10px] font-black rounded-full border ${TIER_POS_STYLES[g.key] || 'bg-gray-700 text-gray-300 border-gray-600'}`}>
                        {g.key}
                      </span>
                      <span className="text-gray-600 text-[10px]">{g.players.length}명</span>
                    </div>
                    <div className="space-y-1 pl-1">
                      {g.players.map(p => (
                        <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-gray-900/60">
                          {p.photo ? <img src={p.photo} alt={p.name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" /> : <span className="text-sm flex-shrink-0">👤</span>}
                          <p className="text-xs font-bold text-white truncate flex-1">{p.name}</p>
                          {p.tierCurrent && <p className="text-[10px] text-gray-500 flex-shrink-0">{p.tierCurrent}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {ungroupedQueue.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="px-2 py-0.5 text-[10px] font-black rounded-full border bg-gray-700 text-gray-300 border-gray-600">기타</span>
                      <span className="text-gray-600 text-[10px]">{ungroupedQueue.length}명</span>
                    </div>
                    <div className="space-y-1 pl-1">
                      {ungroupedQueue.map(p => (
                        <div key={p.id} className="flex items-center gap-2 p-1.5 rounded-lg bg-gray-900/60">
                          {p.photo ? <img src={p.photo} alt={p.name} className="w-6 h-6 rounded-full object-cover flex-shrink-0" /> : <span className="text-sm flex-shrink-0">👤</span>}
                          <p className="text-xs font-bold text-white truncate">{p.name}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-600 text-sm">대기 선수 없음</p>
            )}
          </div>

          {/* History */}
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
