'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ref, get } from 'firebase/database';
import { db } from '@/lib/firebase';

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState('home');
  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinRole, setJoinRole] = useState('spectator');
  const [captainList, setCaptainList] = useState([]);
  const [selectedCaptain, setSelectedCaptain] = useState('');
  const [roomInfo, setRoomInfo] = useState(null);
  const [adminPass, setAdminPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFetchRoom = async () => {
    if (!joinCode.trim()) { setError('방 코드를 입력해주세요.'); return; }
    setError('');
    setLoading(true);
    try {
      const snap = await get(ref(db, `rooms/${joinCode.toUpperCase()}`));
      if (!snap.exists()) { setError('존재하지 않는 방 코드입니다.'); setLoading(false); return; }
      const data = snap.val();
      const roomPass = data.info?.password || '';
      // 비밀번호가 있는 방만 검증
      if (roomPass && joinPassword !== roomPass) { setError('비밀번호가 틀렸습니다.'); setLoading(false); return; }
      setRoomInfo(data.info);
      const caps = data.captains ? Object.entries(data.captains).map(([id, val]) => ({ id, ...val })) : [];
      setCaptainList(caps);
    } catch (e) {
      setError('연결 오류가 발생했습니다.');
    }
    setLoading(false);
  };

  const handleJoin = () => {
    const code = joinCode.toUpperCase();
    if (joinRole === 'captain' && !selectedCaptain) { setError('팀장을 선택해주세요.'); return; }
    localStorage.setItem('ow_room', code);
    if (joinRole === 'captain') {
      localStorage.setItem('ow_role', 'captain');
      localStorage.setItem('ow_captain_id', selectedCaptain);
    } else {
      localStorage.setItem('ow_role', 'spectator');
      localStorage.removeItem('ow_captain_id');
    }
    const status = roomInfo?.status;
    if (status === 'auction') router.push(`/room/${code}/auction`);
    else if (status === 'result') router.push(`/room/${code}/result`);
    else router.push(`/room/${code}/lobby`);
  };

  const handleAdminLogin = () => {
    if (adminPass === 'abc123') { localStorage.setItem('ow_role', 'admin'); router.push('/admin'); }
    else setError('관리자 비밀번호가 틀렸습니다.');
  };

  const reset = () => {
    setMode('home'); setError(''); setRoomInfo(null); setCaptainList([]);
    setSelectedCaptain(''); setJoinCode(''); setJoinPassword(''); setAdminPass('');
  };

  const hasPassword = roomInfo?.password && roomInfo.password.trim() !== '';

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 50%, #0f0f1a 100%)' }}>

      <div className="text-center mb-12 animate-slide-up">
        <div className="text-6xl mb-4">⚡</div>
        <h1 className="text-5xl font-black text-white tracking-tight mb-2">오버워치 내전</h1>
        <h2 className="text-3xl font-bold text-orange-400">경매 시스템</h2>
      </div>

      {error && (
        <div className="mb-4 px-5 py-3 bg-red-900/50 border border-red-500 rounded-2xl text-red-300 text-lg max-w-sm w-full text-center">
          {error}
        </div>
      )}

      {mode === 'home' && (
        <div className="flex flex-col gap-4 w-full max-w-sm animate-slide-up">
          <button onClick={() => router.push('/create')}
            className="w-full py-5 text-2xl font-bold bg-orange-500 hover:bg-orange-400 text-white rounded-2xl transition-all transform hover:scale-105"
            style={{ boxShadow: '0 8px 32px rgba(249,115,22,0.3)' }}>
            방 만들기
          </button>
          <button onClick={() => setMode('join')}
            className="w-full py-5 text-2xl font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-2xl transition-all transform hover:scale-105"
            style={{ boxShadow: '0 8px 32px rgba(37,99,235,0.3)' }}>
            방 참가
          </button>
          <button onClick={() => setMode('admin')}
            className="w-full py-5 text-2xl font-bold bg-gray-700 hover:bg-gray-600 text-white rounded-2xl transition-all transform hover:scale-105">
            관리자 로그인
          </button>
        </div>
      )}

      {mode === 'join' && !roomInfo && (
        <div className="w-full max-w-sm bg-gray-900/80 border border-gray-700 rounded-2xl p-6 space-y-4 animate-slide-up">
          <h3 className="text-2xl font-bold text-center">방 참가</h3>
          <input
            className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:border-blue-400 focus:outline-none uppercase tracking-widest"
            placeholder="방 코드 (6자리)"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <input
            type="password"
            className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:border-blue-400 focus:outline-none"
            placeholder="비밀번호 (없으면 비워두세요)"
            value={joinPassword}
            onChange={e => setJoinPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFetchRoom()}
          />
          <div className="flex gap-3">
            <button onClick={handleFetchRoom} disabled={loading}
              className="flex-1 py-3 text-xl font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl transition-all">
              {loading ? '확인 중...' : '확인'}
            </button>
            <button onClick={reset} className="py-3 px-5 text-xl bg-gray-700 hover:bg-gray-600 rounded-xl transition-all">취소</button>
          </div>
        </div>
      )}

      {mode === 'join' && roomInfo && (
        <div className="w-full max-w-sm bg-gray-900/80 border border-gray-700 rounded-2xl p-6 space-y-4 animate-slide-up">
          <h3 className="text-2xl font-bold text-center">{roomInfo.name}</h3>
          <p className="text-center text-gray-400 text-lg">
            코드: <span className="text-white font-mono font-bold">{roomInfo.code}</span>
            {!hasPassword && <span className="ml-2 text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full">비밀번호 없음</span>}
          </p>
          <div>
            <p className="text-lg font-semibold mb-2">역할 선택</p>
            <div className="flex gap-3">
              {['captain', 'spectator'].map(r => (
                <button key={r} onClick={() => setJoinRole(r)}
                  className={`flex-1 py-3 text-lg font-bold rounded-xl transition-all ${joinRole === r ? (r === 'captain' ? 'bg-orange-500 text-white' : 'bg-blue-500 text-white') : 'bg-gray-700 text-gray-300'}`}>
                  {r === 'captain' ? '팀장' : '관전자'}
                </button>
              ))}
            </div>
          </div>
          {joinRole === 'captain' && (
            <div>
              <p className="text-lg font-semibold mb-2">팀장 선택</p>
              <select value={selectedCaptain} onChange={e => setSelectedCaptain(e.target.value)}
                className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:outline-none">
                <option value="">팀장을 선택하세요</option>
                {captainList.map(cap => <option key={cap.id} value={cap.id}>{cap.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={handleJoin} className="flex-1 py-3 text-xl font-bold bg-orange-500 hover:bg-orange-400 rounded-xl transition-all">입장</button>
            <button onClick={reset} className="py-3 px-5 text-xl bg-gray-700 hover:bg-gray-600 rounded-xl transition-all">취소</button>
          </div>
        </div>
      )}

      {mode === 'admin' && (
        <div className="w-full max-w-sm bg-gray-900/80 border border-gray-700 rounded-2xl p-6 space-y-4 animate-slide-up">
          <h3 className="text-2xl font-bold text-center">관리자 로그인</h3>
          <input type="password"
            className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:border-purple-400 focus:outline-none"
            placeholder="관리자 비밀번호"
            value={adminPass}
            onChange={e => setAdminPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
          />
          <div className="flex gap-3">
            <button onClick={handleAdminLogin} className="flex-1 py-3 text-xl font-bold bg-purple-600 hover:bg-purple-500 rounded-xl transition-all">로그인</button>
            <button onClick={reset} className="py-3 px-5 text-xl bg-gray-700 hover:bg-gray-600 rounded-xl transition-all">취소</button>
          </div>
        </div>
      )}
    </main>
  );
}
