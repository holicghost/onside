'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ref, onValue, update } from 'firebase/database';
import { db } from '@/lib/firebase';

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
  const [countdownStartedAt, setCountdownStartedAt] = useState(null);
  const [countdownPausedRemaining, setCountdownPausedRemaining] = useState(null);
  const [countdown, setCountdown] = useState(null);

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
      onValue(ref(db, `rooms/${code}/lobby/countdownStartedAt`), snap => setCountdownStartedAt(snap.val())),
      onValue(ref(db, `rooms/${code}/lobby/countdownPausedRemaining`), snap => setCountdownPausedRemaining(snap.val())),
    ];
    return () => unsubs.forEach(u => u());
  }, [code, router]);

  // Countdown tick — all clients sync to Firebase timestamp
  useEffect(() => {
    if (!countdownStartedAt || countdownPausedRemaining !== null) { if (!countdownStartedAt) setCountdown(null); return; }
    const DURATION = 15000;
    const tick = () => {
      const remaining = Math.min(15, Math.ceil((countdownStartedAt + DURATION - Date.now()) / 1000));
      if (remaining <= 0) {
        setCountdown(0);
        if (roleRef.current === 'admin') {
          update(ref(db), { [`rooms/${code}/info/status`]: 'auction' }).catch(() => {});
        }
        return;
      }
      setCountdown(remaining);
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [countdownStartedAt, countdownPausedRemaining, code]);

  // Show frozen countdown when paused
  useEffect(() => {
    if (countdownPausedRemaining !== null) {
      setCountdown(Math.min(15, Math.ceil(countdownPausedRemaining / 1000)));
    }
  }, [countdownPausedRemaining]);

  const pauseLobbyCountdown = async () => {
    if (!countdownStartedAt) return;
    const DURATION = 15000;
    const remaining = Math.max(1000, countdownStartedAt + DURATION - Date.now());
    await update(ref(db), {
      [`rooms/${code}/lobby/countdownPausedRemaining`]: remaining,
      [`rooms/${code}/lobby/countdownStartedAt`]: null,
    });
  };

  const resumeLobbyCountdown = async () => {
    if (countdownPausedRemaining === null) return;
    await update(ref(db), {
      [`rooms/${code}/lobby/countdownStartedAt`]: Date.now() - (15000 - countdownPausedRemaining),
      [`rooms/${code}/lobby/countdownPausedRemaining`]: null,
    });
  };

  const handleStartAuction = async () => {
    const captainsList = Object.entries(captains);
    if (!captainsList.length) return;
    // Fisher-Yates shuffle for captain order
    const ids = captainsList.map(([id]) => id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    window.dispatchEvent(new Event('startBGM'));
    await update(ref(db), {
      [`rooms/${code}/captainOrder`]: ids,
      [`rooms/${code}/lobby/countdownStartedAt`]: Date.now(),
    });
  };

  const captainsList = Object.entries(captains).map(([id, c]) => ({ id, ...c }));
  const counting = countdownStartedAt !== null || countdownPausedRemaining !== null;
  const paused = countdownPausedRemaining !== null;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative"
      style={{ background: '#0f0f1a' }}
    >
      <button onClick={() => router.push('/')} className="absolute top-4 left-4 text-gray-500 hover:text-gray-300 text-sm transition-colors z-20">← 홈</button>

      {/* Header */}
      <div className="text-center mb-8">
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

      {/* Broadcasting warning */}
      <div className="w-full max-w-2xl mb-8">
        <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-yellow-900/40 border border-yellow-700/60 text-yellow-400 text-sm font-bold text-center">
          <span>⚠️</span>
          <span>방송 중이라면 화면의 방 코드와 링크가 노출되지 않도록 주의하세요!</span>
        </div>
      </div>

      {/* Captain cards grid */}
      {captainsList.length > 0 && (
        <div className="flex flex-wrap gap-4 justify-center mb-10 max-w-2xl">
          {captainsList.map(cap => (
            <div key={cap.id} className="flex flex-col items-center gap-2 w-24">
              {cap.photo
                ? <img src={cap.photo} alt={cap.name} className="w-16 h-16 rounded-full object-cover border-2 border-gray-600" />
                : <div className="w-16 h-16 rounded-full bg-gray-800 border-2 border-gray-600 flex items-center justify-center text-2xl">👤</div>
              }
              <span className="text-white text-sm font-bold text-center leading-tight truncate w-full">{cap.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main message + countdown */}
      <div className="text-center">
        {counting ? (
          <>
            <p className="text-gray-400 text-xl mb-2">
              {paused ? '일시정지됨' : '잠시 뒤 경매가 시작됩니다'}
            </p>
            <div key={paused ? 'paused' : countdown} className={`font-black leading-none ${paused ? 'text-orange-400/50' : 'text-orange-400 animate-count-down'}`} style={{ fontSize: '96px' }}>
              {countdown > 0 ? countdown : '🔨'}
            </div>
            {role === 'admin' && (
              <div className="mt-4">
                {paused ? (
                  <button onClick={resumeLobbyCountdown}
                    className="px-8 py-3 text-xl font-bold bg-green-600 hover:bg-green-500 text-white rounded-xl transition-all">
                    ▶ 재개
                  </button>
                ) : countdown > 0 && (
                  <button onClick={pauseLobbyCountdown}
                    className="px-8 py-3 text-xl font-bold bg-orange-700 hover:bg-orange-600 text-white rounded-xl transition-all">
                    ⏸ 일시정지
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-gray-400 text-xl mb-6">
              {captainsList.length > 0
                ? `팀장 ${captainsList.length}명 준비 완료`
                : '팀장 등록 대기 중...'}
            </p>
            {role === 'admin' ? (
              <button
                onClick={handleStartAuction}
                disabled={captainsList.length === 0}
                className="px-12 py-5 text-2xl font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl transition-all hover:scale-105 active:scale-95"
                style={{ boxShadow: captainsList.length > 0 ? '0 8px 36px rgba(249,115,22,0.45)' : 'none' }}
              >
                🔨 경매 시작
              </button>
            ) : (
              <p className="text-gray-600 text-base">관리자가 경매를 시작할 때까지 대기하세요.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
