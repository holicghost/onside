'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ref, onValue } from 'firebase/database';
import { db } from '@/lib/firebase';

const ROLE_LABEL = { tank: '탱커', damage: '딜러', support: '서포터' };
const ROLE_COLOR = { tank: 'text-yellow-400', damage: 'text-red-400', support: 'text-green-400' };

export default function ResultPage() {
  const { code } = useParams();
  const router = useRouter();
  const [roomInfo, setRoomInfo] = useState(null);
  const [captains, setCaptains] = useState({});
  const [players, setPlayers] = useState({});
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code) return;
    const unsubs = [
      onValue(ref(db, `rooms/${code}/info`), s => setRoomInfo(s.val())),
      onValue(ref(db, `rooms/${code}/captains`), s => setCaptains(s.val() || {})),
      onValue(ref(db, `rooms/${code}/players`), s => setPlayers(s.val() || {})),
    ];
    return () => unsubs.forEach(u => u());
  }, [code]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const captainsList = Object.entries(captains).map(([id, c]) => ({ id, ...c }));
  const unsoldPlayers = Object.entries(players).filter(([, p]) => !p.soldTo).map(([id, p]) => ({ id, ...p }));

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: '#0f0f1a' }}>
      <div className="max-w-5xl mx-auto space-y-8">
        <button onClick={() => router.push('/')} className="text-gray-500 hover:text-gray-300 text-sm transition-colors">← 홈</button>
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="text-5xl">🏆</div>
          <h1 className="text-5xl font-black text-white">{roomInfo?.name || '경매 결과'}</h1>
          <p className="text-gray-400 text-xl">최종 팀 구성</p>
          <div className="flex gap-3 justify-center">
            <button onClick={copyLink}
              className="px-5 py-2 bg-gray-700 hover:bg-gray-600 rounded-xl text-base font-bold transition-all">
              {copied ? '✅ 복사됨' : '🔗 결과 링크 복사'}
            </button>
            <button onClick={() => router.push('/')}
              className="px-5 py-2 bg-orange-600 hover:bg-orange-500 rounded-xl text-base font-bold transition-all">
              홈으로
            </button>
          </div>
        </div>

        {/* Team cards */}
        <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {captainsList.map((cap, idx) => {
            const teamPlayers = Object.entries(players).filter(([, p]) => p.soldTo === cap.id).map(([id, p]) => ({ id, ...p }));
            const originalBudget = cap.originalBudget || cap.budget || roomInfo?.budget || 1000;
            const spent = originalBudget - (cap.budget || 0);
            return (
              <div key={cap.id}
                className="bg-gray-900/70 border border-gray-700 rounded-2xl overflow-hidden animate-reveal"
                style={{ animationDelay: `${idx * 0.1}s`, opacity: 0 }}>
                {/* Captain header */}
                <div className="flex items-center gap-4 p-5 border-b border-gray-700"
                  style={{ background: 'linear-gradient(135deg, #1a1a2e, #0f0f1a)' }}>
                  <div className="relative">
                    {cap.photo
                      ? <img src={cap.photo} alt={cap.name} className="w-16 h-16 rounded-full object-cover border-2 border-orange-500" />
                      : <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center text-3xl border-2 border-orange-500">👤</div>
                    }
                    <span className="absolute -top-1 -right-1 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-xs font-black text-white">
                      {idx + 1}
                    </span>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-white">{cap.name}</p>
                    <p className="text-sm text-gray-400">
                      사용: <span className="text-orange-400 font-bold">{spent}P</span>
                      <span className="text-gray-600"> / {originalBudget}P</span>
                      &nbsp;·&nbsp; 잔여 <span className="text-green-400 font-bold">{cap.budget}P</span>
                    </p>
                  </div>
                </div>

                {/* Players */}
                <div className="p-4 space-y-3">
                  {teamPlayers.length === 0
                    ? <p className="text-gray-600 text-center py-4">낙찰된 팀원 없음</p>
                    : teamPlayers.map(p => (
                        <div key={p.id} className="flex items-center gap-3 bg-gray-800/50 rounded-xl p-3">
                          {p.photo
                            ? <img src={p.photo} alt={p.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                            : <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-2xl flex-shrink-0">👤</div>
                          }
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-white text-base">{p.name}</p>
                            <div className="flex items-center gap-2 flex-wrap mt-1">
                              {(p.tierType || p.position) && (
                                <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-300 rounded-full font-bold">
                                  {[p.tierType, p.position].filter(Boolean).join(' ')}
                                </span>
                              )}
                              {p.tierCurrent && <span className="text-xs text-purple-400 font-bold">{p.tierCurrent}</span>}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-orange-400 font-black text-lg">{p.soldPrice}P</p>
                          </div>
                        </div>
                      ))
                  }
                </div>
              </div>
            );
          })}
        </div>

        {/* Unsold players */}
        {unsoldPlayers.length > 0 && (
          <section className="bg-gray-900/50 border border-gray-700 rounded-2xl p-6">
            <h2 className="text-xl font-bold text-gray-400 mb-4">유찰 선수 ({unsoldPlayers.length}명)</h2>
            <div className="flex flex-wrap gap-3">
              {unsoldPlayers.map(p => (
                <div key={p.id} className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2">
                  {p.photo
                    ? <img src={p.photo} alt={p.name} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    : <span className="flex-shrink-0">👤</span>
                  }
                  <div className="min-w-0">
                    <p className="text-gray-300 text-sm font-bold truncate">{p.name}</p>
                    {(p.tierType || p.position) && (
                      <p className="text-gray-500 text-xs">{[p.tierType, p.position].filter(Boolean).join(' ')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
