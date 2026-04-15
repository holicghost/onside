'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ref, get } from 'firebase/database';
import { db } from '@/lib/firebase';

export default function RoomAdminPage() {
  const { code } = useParams();
  const router = useRouter();

  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [roomInfo, setRoomInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) return;
    // If already authed as admin, redirect straight to the right page
    const storedRole = localStorage.getItem('ow_role');
    const storedRoom = localStorage.getItem('ow_room');
    if (storedRole === 'admin' && storedRoom === code) {
      get(ref(db, `rooms/${code}/info`)).then(snap => {
        const info = snap.val();
        if (!info) { setError('방을 찾을 수 없습니다.'); setLoading(false); return; }
        enterRoom(info);
      }).catch(() => { setError('연결 오류'); setLoading(false); });
      return;
    }
    get(ref(db, `rooms/${code}/info`)).then(snap => {
      if (!snap.exists()) { setError('존재하지 않는 방입니다.'); setLoading(false); return; }
      setRoomInfo(snap.val());
      setLoading(false);
    }).catch(() => { setError('연결 오류가 발생했습니다.'); setLoading(false); });
  }, [code]);

  const enterRoom = (info) => {
    localStorage.setItem('ow_room', code);
    localStorage.setItem('ow_role', 'admin');
    localStorage.removeItem('ow_captain_id');
    const status = info?.status;
    if (status === 'auction') router.replace(`/room/${code}/auction`);
    else if (status === 'result') router.replace(`/room/${code}/result`);
    else router.replace(`/room/${code}/lobby`);
  };

  const handleLogin = async () => {
    if (passwordInput !== 'abc123') {
      setPasswordError('관리자 비밀번호가 틀렸습니다.');
      return;
    }
    const snap = await get(ref(db, `rooms/${code}/info`)).catch(() => null);
    const info = snap?.val();
    if (!info) { setPasswordError('방을 찾을 수 없습니다.'); return; }
    enterRoom(info);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f1a' }}>
        <div className="text-white text-xl">로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#0f0f1a' }}>
        <div className="text-center space-y-4">
          <p className="text-red-400 text-xl">{error}</p>
          <button onClick={() => router.push('/')} className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl text-white font-bold transition-all">홈으로</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 50%, #0f0f1a 100%)' }}>
      <div className="w-full max-w-sm bg-gray-900/80 border border-gray-700 rounded-2xl p-6 space-y-4">
        <div className="text-center">
          <h2 className="text-2xl font-black text-white">{roomInfo?.name || '경매 방'}</h2>
          <p className="text-gray-400 mt-1 text-base">관리자로 입장합니다</p>
        </div>
        <input
          type="password"
          className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:border-purple-400 focus:outline-none"
          placeholder="관리자 비밀번호"
          value={passwordInput}
          onChange={e => setPasswordInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          autoFocus
        />
        {passwordError && <p className="text-red-400 text-center text-sm">{passwordError}</p>}
        <button onClick={handleLogin} className="w-full py-3 text-xl font-bold bg-purple-600 hover:bg-purple-500 rounded-xl transition-all">
          로그인
        </button>
        <button onClick={() => router.push('/')} className="w-full py-2 text-gray-600 hover:text-gray-400 text-sm transition-all">← 홈으로</button>
      </div>
    </div>
  );
}
