'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ref, onValue, update } from 'firebase/database';
import { db } from '@/lib/firebase';

export default function LobbyPage() {
  const { code } = useParams();
  const router = useRouter();

  const [role, setRole] = useState('spectator');
  const [roomInfo, setRoomInfo] = useState(null);
  const [captains, setCaptains] = useState({});
  const [phase, setPhase] = useState('waiting'); // waiting | shuffling | revealing | countdown
  const [revealedOrder, setRevealedOrder] = useState([]);
  const [countdown, setCountdown] = useState(5);
  const [copied, setCopied] = useState(false);
  const shuffleTimerRef = useRef(null);

  useEffect(() => {
    const r = localStorage.getItem('ow_role') || 'spectator';
    setRole(r);
  }, []);

  useEffect(() => {
    if (!code) return;
    const infoUnsub = onValue(ref(db, `rooms/${code}/info`), snap => {
      const info = snap.val();
      setRoomInfo(info);
      if (info?.status === 'auction') router.push(`/room/${code}/auction`);
    });
    const capUnsub = onValue(ref(db, `rooms/${code}/captains`), snap => {
      setCaptains(snap.val() || {});
    });
    const lobbyUnsub = onValue(ref(db, `rooms/${code}/lobby`), snap => {
      const lobby = snap.val();
      if (lobby?.captainOrder && phase === 'waiting') {
        // Another admin already started the draw — sync
        setRevealedOrder(lobby.captainOrder);
        setPhase('revealing');
      }
    });
    return () => { infoUnsub(); capUnsub(); lobbyUnsub(); };
  }, [code]);

  // Countdown when phase is 'countdown'
  useEffect(() => {
    if (phase !== 'countdown') return;
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval);
          update(ref(db), { [`rooms/${code}/info/status`]: 'auction' })
            .then(() => router.push(`/room/${code}/auction`));
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, code]);

  const startDraw = async () => {
    if (phase !== 'waiting') return;
    const captainIds = Object.keys(captains);
    const shuffled = [...captainIds].sort(() => Math.random() - 0.5);

    setPhase('shuffling');

    // Save order to Firebase so all clients see it
    await update(ref(db), {
      [`rooms/${code}/lobby/captainOrder`]: shuffled,
    });

    // After 3s reveal order
    shuffleTimerRef.current = setTimeout(async () => {
      setRevealedOrder(shuffled);
      setPhase('revealing');
      // After 2.5s start countdown
      setTimeout(() => setPhase('countdown'), 2500);
    }, 3000);
  };

  const captainsList = Object.entries(captains).map(([id, c]) => ({ id, ...c }));

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/room/${code}/lobby`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 50%, #0f0f1a 100%)' }}>

      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-black text-white">{roomInfo?.name || '로비'}</h1>
        <div className="flex items-center justify-center gap-3 mt-2">
          <span className="text-gray-400 text-xl">방 코드:</span>
          <span className="text-3xl font-black font-mono text-orange-400 tracking-widest">{code}</span>
          <button onClick={copyLink} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-base transition-all">
            {copied ? '✅' : '🔗'} {copied ? '복사됨' : '링크 복사'}
          </button>
        </div>
        <div className="mt-2">
          <span className={`px-3 py-1 rounded-full text-base font-bold ${
            role === 'admin' ? 'bg-purple-900 text-purple-300' : 'bg-gray-800 text-gray-400'
          }`}>
            {role === 'admin' ? '관리자' : role === 'captain' ? '팀장' : '관전자'}
          </span>
        </div>
      </div>

      {/* Captain Cards */}
      {phase === 'waiting' || phase === 'shuffling' ? (
        <div className={`flex flex-wrap gap-4 justify-center mb-10 max-w-2xl`}>
          {captainsList.map((cap, i) => (
            <div
              key={cap.id}
              className="flex flex-col items-center bg-gray-900/80 border border-gray-700 rounded-2xl p-4 w-36"
              style={phase === 'shuffling' ? {
                animation: `float-card ${0.9 + i * 0.15}s ease-in-out infinite`,
                animationDelay: `${i * 0.1}s`,
              } : {}}
            >
              {cap.photo
                ? <img src={cap.photo} alt={cap.name} className="w-16 h-16 rounded-full object-cover mb-2" />
                : <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center text-3xl mb-2">👤</div>
              }
              <span className="text-white font-bold text-center text-base">{cap.name}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Shuffling Label */}
      {phase === 'shuffling' && (
        <div className="text-center mb-8 animate-slide-up">
          <p className="text-3xl font-black text-yellow-400">🎲 추첨 중...</p>
          <p className="text-gray-400 mt-1">경매 순서를 랜덤 추첨합니다</p>
        </div>
      )}

      {/* Revealed Order */}
      {(phase === 'revealing' || phase === 'countdown') && (
        <div className="flex flex-col gap-3 mb-8 w-full max-w-sm">
          <p className="text-2xl font-black text-center text-white mb-2">🏆 경매 순서</p>
          {revealedOrder.map((captainId, i) => {
            const cap = captains[captainId];
            if (!cap) return null;
            return (
              <div
                key={captainId}
                className="flex items-center gap-4 bg-gray-900/80 border border-gray-700 rounded-2xl px-5 py-3 animate-reveal"
                style={{ animationDelay: `${i * 0.15}s`, opacity: 0 }}
              >
                <span className="text-2xl font-black text-orange-400 w-8 text-center">{i + 1}</span>
                {cap.photo
                  ? <img src={cap.photo} alt={cap.name} className="w-10 h-10 rounded-full object-cover" />
                  : <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-xl">👤</div>
                }
                <span className="text-white text-xl font-bold">{cap.name}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Countdown */}
      {phase === 'countdown' && (
        <div className="text-center mb-6">
          <p className="text-gray-400 text-xl mb-2">경매 시작까지</p>
          <div
            key={countdown}
            className="text-8xl font-black text-orange-400 animate-count-down"
          >
            {countdown}
          </div>
        </div>
      )}

      {/* Admin: Start Draw Button */}
      {role === 'admin' && phase === 'waiting' && captainsList.length >= 2 && (
        <button
          onClick={startDraw}
          className="mt-4 px-10 py-5 text-2xl font-bold bg-orange-500 hover:bg-orange-400 text-white rounded-2xl transition-all transform hover:scale-105"
          style={{ boxShadow: '0 8px 32px rgba(249,115,22,0.4)' }}
        >
          🎲 팀장 순서 추첨 시작
        </button>
      )}

      {role !== 'admin' && phase === 'waiting' && (
        <p className="text-gray-500 text-xl mt-4">관리자가 추첨을 시작할 때까지 대기하세요.</p>
      )}

      {captainsList.length < 2 && phase === 'waiting' && (
        <p className="text-yellow-500 text-xl mt-4">팀장이 2명 이상이어야 추첨할 수 있습니다.</p>
      )}
    </div>
  );
}
