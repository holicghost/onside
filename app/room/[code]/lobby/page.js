'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ref, onValue, update } from 'firebase/database';
import { db } from '@/lib/firebase';

const toArr = (val) => !val ? [] : Array.isArray(val) ? val : Object.values(val);

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

export default function LobbyPage() {
  const { code } = useParams();
  const router = useRouter();

  const [role, setRole] = useState('spectator');
  const [roomInfo, setRoomInfo] = useState(null);
  const [captains, setCaptains] = useState({});
  const [lobbyData, setLobbyData] = useState(null);

  // phase: 'waiting' | 'shuffling' | 'revealing' | 'done'
  const [phase, setPhase] = useState('waiting');
  const [revealedCount, setRevealedCount] = useState(0);
  const [countdown, setCountdown] = useState(5);

  const roleRef = useRef('spectator');
  useEffect(() => { roleRef.current = role; }, [role]);

  useEffect(() => {
    setRole(localStorage.getItem('ow_role') || 'spectator');
  }, []);

  // Firebase listeners
  useEffect(() => {
    if (!code) return;
    const unsubs = [
      onValue(ref(db, `rooms/${code}/info`), snap => {
        const info = snap.val();
        setRoomInfo(info);
        if (info?.status === 'auction') router.replace(`/room/${code}/auction`);
        if (info?.status === 'result')  router.replace(`/room/${code}/result`);
      }),
      onValue(ref(db, `rooms/${code}/captains`), snap => setCaptains(snap.val() || {})),
      onValue(ref(db, `rooms/${code}/lobby`),    snap => setLobbyData(snap.val())),
    ];
    return () => unsubs.forEach(u => u());
  }, [code, router]);

  // Animation timeline — driven purely by Firebase timestamps so all clients stay in sync
  useEffect(() => {
    const order     = toArr(lobbyData?.captainOrder);
    const startedAt = lobbyData?.shuffleStartedAt;
    if (!startedAt || !order.length) return;

    const SHUFFLE_MS = 3000;   // shuffle animation duration
    const REVEAL_MS  = 650;    // delay between each card reveal

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 0) return; // clock skew guard

      if (elapsed < SHUFFLE_MS) {
        setPhase('shuffling');
        setRevealedCount(0);
        return;
      }

      const count = Math.min(
        order.length,
        Math.floor((elapsed - SHUFFLE_MS) / REVEAL_MS) + 1,
      );
      setRevealedCount(count);
      setPhase(count < order.length ? 'revealing' : 'done');
    };

    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [lobbyData]);

  // 5-second countdown once all captains are revealed
  useEffect(() => {
    if (phase !== 'done') return;
    let n = 5;
    setCountdown(5);

    const id = setInterval(() => {
      n -= 1;
      setCountdown(n);
      if (n <= 0) {
        clearInterval(id);
        // Only admin triggers the Firebase status change; all clients redirect on that event
        if (roleRef.current === 'admin') {
          update(ref(db), { [`rooms/${code}/info/status`]: 'auction' });
        }
        router.replace(`/room/${code}/auction`);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const handleStartDraw = async () => {
    if (phase !== 'waiting') return;
    const ids = Object.keys(captains);
    if (!ids.length) return;
    const shuffled = [...ids].sort(() => Math.random() - 0.5);
    await update(ref(db), {
      [`rooms/${code}/captainOrder`]:          shuffled, // canonical location per spec
      [`rooms/${code}/lobby/captainOrder`]:    shuffled, // used by animation timeline
      [`rooms/${code}/lobby/shuffleStartedAt`]: Date.now(),
    });
  };

  const captainsList  = Object.entries(captains).map(([id, c]) => ({ id, ...c }));
  const captainOrder  = toArr(lobbyData?.captainOrder);
  const showCards     = phase === 'waiting' || phase === 'shuffling';

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 50%, #0f0f1a 100%)' }}
    >
      {/* Radial glow during shuffle */}
      {phase === 'shuffling' && (
        <div
          className="absolute inset-0 pointer-events-none animate-pulse"
          style={{ background: 'radial-gradient(ellipse at center, rgba(99,102,241,0.15) 0%, transparent 65%)' }}
        />
      )}

      {/* ← Home */}
      <button onClick={() => router.push('/')} className="absolute top-4 left-4 text-gray-500 hover:text-gray-300 text-sm transition-colors z-20">← 홈</button>

      {/* ── Header ── */}
      <div className="text-center mb-10 relative z-10">
        <h1 className="text-4xl font-black text-white">{roomInfo?.name || '로비'}</h1>
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="text-gray-400 text-lg">방 코드</span>
          <BlurCode text={code} className="text-3xl font-black font-mono text-orange-400 tracking-widest" />
        </div>
        <span className={`inline-block mt-3 px-4 py-1 rounded-full text-sm font-bold ${
          role === 'admin'   ? 'bg-purple-900 text-purple-300' :
          role === 'captain' ? 'bg-orange-900 text-orange-300' :
                               'bg-gray-800 text-gray-400'
        }`}>
          {role === 'admin' ? '관리자' : role === 'captain' ? '팀장' : '관전자'}
        </span>
      </div>

      {/* ── Broadcasting warning ── */}
      <div className="w-full max-w-2xl relative z-10 mb-4">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-900/40 border border-yellow-700/60 text-yellow-400 text-sm font-bold">
          <span>⚠️</span>
          <span>방송 중이라면 화면의 방 코드와 링크가 노출되지 않도록 주의하세요!</span>
        </div>
      </div>

      {/* ── Face-down cards (waiting & shuffling) ── */}
      {showCards && (
        <div className="flex flex-wrap gap-5 justify-center mb-8 relative z-10">
          {captainsList.map((cap, i) => (
            <div
              key={cap.id}
              className={`relative w-28 h-40 rounded-2xl overflow-hidden flex-shrink-0 ${
                phase === 'shuffling' ? 'animate-card-shuffle' : ''
              }`}
              style={{
                background: 'linear-gradient(140deg, #1e1b4b 0%, #312e81 55%, #4c1d95 100%)',
                border: '2px solid #6366f1',
                boxShadow: phase === 'shuffling'
                  ? '0 0 22px rgba(99,102,241,0.55)'
                  : '0 4px 18px rgba(0,0,0,0.5)',
                animationDuration: `${0.5 + i * 0.08}s`,
                animationDelay:    `${i * 0.1}s`,
              }}
            >
              {/* Blurred captain photo */}
              {cap.photo && (
                <div className="absolute inset-0" style={{ filter: 'blur(4px)', transform: 'scale(1.1)' }}>
                  <img src={cap.photo} alt="" className="w-full h-full object-cover opacity-30" />
                </div>
              )}
              {/* Crosshatch pattern on card back */}
              <div
                className="absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 50%)',
                  backgroundSize: '10px 10px',
                }}
              />
              {/* Center icon */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <div className="w-12 h-12 rounded-full border-2 border-indigo-500/40 flex items-center justify-center">
                  <span className="text-2xl font-black text-indigo-300/60">?</span>
                </div>
                <span className="text-indigo-400/40 text-[10px] font-bold uppercase tracking-widest">ONSIDE</span>
              </div>
              {/* Blurred captain name */}
              <div className="absolute bottom-2 left-0 right-0 text-center px-1" style={{ filter: 'blur(4px)' }}>
                <span className="text-white text-[10px] font-bold">{cap.name}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Shuffling label ── */}
      {phase === 'shuffling' && (
        <div className="text-center mb-6 relative z-10">
          <p className="text-4xl font-black text-yellow-400 animate-pulse">🎲 추첨 중...</p>
          <p className="text-gray-400 mt-2 text-lg">경매 순서를 랜덤 추첨합니다</p>
        </div>
      )}

      {/* ── Revealed ordered list ── */}
      {(phase === 'revealing' || phase === 'done') && (
        <div className="w-full max-w-md relative z-10 mb-6">
          {phase === 'done' ? (
            <p className="text-center text-2xl font-black text-white mb-5">
              🎉 경매 순서가 확정되었습니다!
            </p>
          ) : (
            <p className="text-center text-xl font-bold text-white mb-4">🏆 경매 순서 공개!</p>
          )}

          <div className="space-y-3">
            {captainOrder.slice(0, revealedCount).map((captainId, i) => {
              const cap = captains[captainId];
              if (!cap) return null;
              return (
                <div
                  key={captainId}
                  className="flex items-center gap-4 rounded-2xl px-5 py-4 animate-flip-in"
                  style={{
                    background: i === 0
                      ? 'linear-gradient(135deg, rgba(124,45,18,0.85) 0%, rgba(154,52,18,0.85) 100%)'
                      : 'rgba(17, 24, 39, 0.85)',
                    border: `2px solid ${i === 0 ? '#ea580c' : '#374151'}`,
                    boxShadow: i === 0 ? '0 0 22px rgba(234,88,12,0.28)' : 'none',
                  }}
                >
                  {/* Rank badge */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg flex-shrink-0 ${
                    i === 0 ? 'bg-orange-500 text-white' :
                    i === 1 ? 'bg-yellow-500/80 text-yellow-100' :
                    i === 2 ? 'bg-amber-700/80 text-amber-200' :
                              'bg-gray-700 text-gray-300'
                  }`}>
                    {i + 1}
                  </div>

                  {/* Captain photo */}
                  {cap.photo
                    ? <img src={cap.photo} alt={cap.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-2xl flex-shrink-0">👤</div>
                  }

                  {/* Name + position badge */}
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-white text-xl font-bold truncate">{cap.name}</span>
                    {cap.position && (
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-full flex-shrink-0 ${
                        cap.position === '탱커' ? 'bg-yellow-900/60 text-yellow-300' :
                        cap.position === '딜러' ? 'bg-red-900/60 text-red-300' :
                        'bg-green-900/60 text-green-300'
                      }`}>{cap.position}</span>
                    )}
                  </div>

                  {/* 선공 badge for 1st place */}
                  {i === 0 && (
                    <span className="flex-shrink-0 px-2.5 py-1 bg-orange-500/20 border border-orange-500/60 text-orange-400 text-xs font-bold rounded-full">
                      선공
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Countdown ── */}
      {phase === 'done' && (
        <div className="text-center relative z-10">
          <p className="text-gray-400 text-xl">{countdown}초 뒤 경매가 시작됩니다</p>
          <div
            key={countdown}
            className="text-9xl font-black text-orange-400 leading-none mt-2 animate-count-down"
          >
            {countdown}
          </div>
        </div>
      )}

      {/* ── Waiting controls ── */}
      {phase === 'waiting' && (
        <div className="text-center relative z-10 mt-2">
          {role === 'admin' ? (
            <>
              <button
                onClick={handleStartDraw}
                disabled={captainsList.length === 0}
                className="px-12 py-5 text-2xl font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl transition-all hover:scale-105 active:scale-95"
                style={{
                  boxShadow: captainsList.length > 0 ? '0 8px 36px rgba(249,115,22,0.45)' : 'none',
                }}
              >
                🎲 순서 추첨 시작
              </button>
              {captainsList.length === 0 && (
                <p className="text-yellow-500 text-sm mt-3">등록된 팀장이 없습니다.</p>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-gray-400 text-xl">
                {captainsList.length > 0
                  ? `팀장 ${captainsList.length}명 대기 중`
                  : '팀장 등록 대기 중...'}
              </p>
              <p className="text-gray-600 text-base">관리자가 추첨을 시작할 때까지 대기하세요.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
