'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ref, onValue } from 'firebase/database';
import { db } from '@/lib/firebase';

const STATUS_LABEL = { lobby: '로비', auction: '경매 중', result: '완료', setup: '설정 중' };
const STATUS_COLOR = { lobby: 'text-blue-400', auction: 'text-green-400', result: 'text-purple-400', setup: 'text-gray-400' };

export default function AdminPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [rooms, setRooms] = useState({});

  useEffect(() => {
    if (localStorage.getItem('ow_role') === 'admin') setAuthed(true);
  }, []);

  useEffect(() => {
    if (!authed) return;
    return onValue(ref(db, 'rooms'), snap => setRooms(snap.val() || {}));
  }, [authed]);

  const handleLogin = () => {
    if (password === 'abc123') {
      localStorage.setItem('ow_role', 'admin');
      setAuthed(true);
      setError('');
    } else {
      setError('비밀번호가 틀렸습니다.');
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 50%, #0f0f1a 100%)' }}>
        <div className="w-full max-w-sm bg-gray-900/80 border border-gray-700 rounded-2xl p-6 space-y-4">
          <h1 className="text-3xl font-black text-center">관리자</h1>
          <input type="password"
            className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:border-purple-400 focus:outline-none"
            placeholder="관리자 비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
          {error && <p className="text-red-400 text-center">{error}</p>}
          <div className="flex gap-3">
            <button onClick={handleLogin} className="flex-1 py-3 text-xl font-bold bg-purple-600 hover:bg-purple-500 rounded-xl transition-all">로그인</button>
            <button onClick={() => router.push('/')} className="py-3 px-5 text-xl bg-gray-700 hover:bg-gray-600 rounded-xl transition-all">홈</button>
          </div>
        </div>
      </div>
    );
  }

  const roomList = Object.entries(rooms).map(([code, room]) => ({ code, ...room }));

  return (
    <div className="min-h-screen py-10 px-4" style={{ background: '#0f0f1a' }}>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black text-white">관리자 패널</h1>
            <p className="text-gray-400 mt-1">방 목록: <span className="text-white font-bold">{roomList.length}</span>개</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => router.push('/create')}
              className="px-5 py-3 text-lg font-bold bg-orange-500 hover:bg-orange-400 rounded-xl transition-all">
              + 방 만들기
            </button>
            <button onClick={() => { localStorage.removeItem('ow_role'); setAuthed(false); }}
              className="px-5 py-3 text-lg font-bold bg-gray-700 hover:bg-gray-600 rounded-xl transition-all">
              로그아웃
            </button>
          </div>
        </div>

        {roomList.length === 0
          ? <div className="text-center py-20 text-gray-600 text-2xl">방이 없습니다.</div>
          : <div className="grid gap-4">
              {roomList.map(({ code, info, captains, players }) => {
                const captainCount = captains ? Object.keys(captains).length : 0;
                const playerCount = players ? Object.keys(players).length : 0;
                const soldCount = players ? Object.values(players).filter(p => p.soldTo).length : 0;
                const createdAt = info?.createdAt ? new Date(info.createdAt).toLocaleString('ko-KR') : '—';

                return (
                  <div key={code}
                    className="bg-gray-900/70 border border-gray-700 hover:border-gray-500 rounded-2xl p-5 cursor-pointer transition-all hover:bg-gray-800/50"
                    onClick={() => router.push(`/admin/${code}`)}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h2 className="text-2xl font-black text-white">{info?.name || '(이름 없음)'}</h2>
                          <span className={`text-base font-bold ${STATUS_COLOR[info?.status] || 'text-gray-400'}`}>
                            {STATUS_LABEL[info?.status] || info?.status}
                          </span>
                          {!(info?.password) && (
                            <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full">비밀번호 없음</span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 flex-wrap">
                          <span className="font-mono text-orange-400 font-bold text-lg tracking-widest">{code}</span>
                          <span className="text-gray-500 text-sm">팀장 {captainCount}명</span>
                          <span className="text-gray-500 text-sm">선수 {soldCount}/{playerCount}명 낙찰</span>
                          <span className="text-gray-600 text-sm">{createdAt}</span>
                        </div>
                      </div>
                      <span className="text-gray-500 text-xl ml-4">→</span>
                    </div>
                  </div>
                );
              })}
            </div>
        }
      </div>
    </div>
  );
}
