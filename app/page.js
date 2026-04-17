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
    <main className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#0f0f1a' }}>

      {/* Header */}
      <div className="text-center mb-10">
        <img src="/logo.png" alt="로고" className="mx-auto mb-4" style={{ width: '120px', height: 'auto', objectFit: 'contain' }} />
        <p className="text-gray-500 font-semibold tracking-wide" style={{ fontSize: '18px' }}>RØDE와 함께하는</p>
        <h1 className="font-black text-white tracking-tight leading-tight" style={{ fontSize: '48px' }}>도현컵</h1>
        <p className="text-gray-500 mt-2" style={{ fontSize: '18px' }}>팀원 선발 경매 홈페이지</p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-950/60 border border-red-800 rounded-xl text-red-400 text-lg max-w-sm w-full text-center">
          {error}
        </div>
      )}

      {mode === 'home' && (
        <div className="flex flex-col gap-3 w-full max-w-sm">
          <button onClick={() => router.push('/create')}
            className="w-full py-5 font-bold bg-orange-500 hover:bg-orange-400 text-white rounded-xl transition-colors"
            style={{ fontSize: '22px' }}>
            방 만들기
          </button>
          <button onClick={() => setMode('join')}
            className="w-full py-5 font-bold bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors border border-gray-700"
            style={{ fontSize: '22px' }}>
            방 참가
          </button>
          <button onClick={() => setMode('admin')}
            className="w-full py-4 font-medium bg-transparent hover:bg-gray-800/60 text-gray-500 hover:text-gray-400 rounded-xl transition-colors"
            style={{ fontSize: '22px' }}>
            관리자 로그인
          </button>
        </div>
      )}

      {mode === 'join' && !roomInfo && (
        <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-white">방 참가</h3>
            <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">← 홈으로</button>
          </div>
          <input
            className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none uppercase tracking-widest text-white placeholder-gray-600"
            placeholder="방 코드 (6자리)"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <input
            type="password"
            className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-700 rounded-lg focus:border-blue-500 focus:outline-none text-white placeholder-gray-600"
            placeholder="비밀번호 (없으면 비워두세요)"
            value={joinPassword}
            onChange={e => setJoinPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFetchRoom()}
          />
          <div className="flex gap-3">
            <button onClick={handleFetchRoom} disabled={loading}
              className="flex-1 py-3 text-xl font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors">
              {loading ? '확인 중...' : '확인'}
            </button>
            <button onClick={reset} className="py-3 px-5 text-xl bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition-colors">취소</button>
          </div>
        </div>
      )}

      {mode === 'join' && roomInfo && (
        <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div>
            <h3 className="text-2xl font-bold text-white">{roomInfo.name}</h3>
            <p className="text-gray-500 text-base mt-1">
              코드: <span className="text-gray-300 font-mono font-bold">{roomInfo.code}</span>
              {!hasPassword && <span className="ml-2 text-green-600 text-sm">비밀번호 없음</span>}
            </p>
          </div>
          <div>
            <p className="text-base text-gray-400 mb-2 font-semibold">역할 선택</p>
            <div className="flex gap-3">
              {['captain', 'spectator'].map(r => (
                <button key={r} onClick={() => setJoinRole(r)}
                  className={`flex-1 py-3 text-lg font-bold rounded-lg transition-colors ${joinRole === r ? (r === 'captain' ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white') : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  {r === 'captain' ? '팀장' : '관전자'}
                </button>
              ))}
            </div>
          </div>
          {joinRole === 'captain' && (
            <div>
              <p className="text-base text-gray-400 mb-2 font-semibold">팀장 선택</p>
              <select value={selectedCaptain} onChange={e => setSelectedCaptain(e.target.value)}
                className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-700 rounded-lg focus:outline-none text-white">
                <option value="">팀장을 선택하세요</option>
                {captainList.map(cap => <option key={cap.id} value={cap.id}>{cap.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={handleJoin} className="flex-1 py-3 text-xl font-bold bg-orange-500 hover:bg-orange-400 rounded-lg transition-colors">입장</button>
            <button onClick={reset} className="py-3 px-5 text-xl bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition-colors">취소</button>
          </div>
        </div>
      )}

      {mode === 'admin' && (
        <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <h3 className="text-2xl font-bold text-white">관리자 로그인</h3>
          <input type="password"
            className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-700 rounded-lg focus:border-purple-500 focus:outline-none text-white placeholder-gray-600"
            placeholder="관리자 비밀번호"
            value={adminPass}
            onChange={e => setAdminPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
          />
          <div className="flex gap-3">
            <button onClick={handleAdminLogin} className="flex-1 py-3 text-xl font-bold bg-purple-700 hover:bg-purple-600 rounded-lg transition-colors">로그인</button>
            <button onClick={reset} className="py-3 px-5 text-xl bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition-colors">취소</button>
          </div>
        </div>
      )}
    </main>
  );
}
