'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ref, get } from 'firebase/database';
import { db } from '@/lib/firebase';

export default function SpectatorPage() {
  const { code } = useParams();
  const router = useRouter();

  const [roomInfo, setRoomInfo] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) return;
    get(ref(db, `rooms/${code}`)).then(snap => {
      if (!snap.exists()) { setError('존재하지 않는 방입니다.'); setLoading(false); return; }
      const info = snap.val()?.info;
      setRoomInfo(info);
      if (!info?.password) {
        // No password — enter immediately
        enterRoom(info);
      }
      setLoading(false);
    }).catch(() => { setError('연결 오류가 발생했습니다.'); setLoading(false); });
  }, [code]);

  const enterRoom = (info) => {
    localStorage.setItem('ow_room', code);
    localStorage.setItem('ow_role', 'spectator');
    localStorage.removeItem('ow_captain_id');
    const status = info?.status;
    if (status === 'auction') router.replace(`/room/${code}/auction`);
    else if (status === 'result') router.replace(`/room/${code}/result`);
    else router.replace(`/room/${code}/lobby`);
  };

  const handleJoin = () => {
    if (roomInfo?.password && passwordInput !== roomInfo.password) {
      setPasswordError('비밀번호가 틀렸습니다.');
      return;
    }
    enterRoom(roomInfo);
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

  if (roomInfo?.password) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 50%, #0f0f1a 100%)', userSelect: 'none', WebkitUserSelect: 'none' }}
        onContextMenu={e => e.preventDefault()}>
        <div className="w-full max-w-sm bg-gray-900/80 border border-gray-700 rounded-2xl p-6 space-y-4">
          <div className="text-center">
            <h2 className="text-2xl font-black text-white">{roomInfo?.name || '경매 방'}</h2>
            <p className="text-gray-400 mt-1 text-base">관전자로 입장합니다</p>
          </div>
          <input
            type="password"
            className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:border-blue-400 focus:outline-none"
            placeholder="방 비밀번호"
            value={passwordInput}
            onChange={e => setPasswordInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
          />
          {passwordError && <p className="text-red-400 text-center text-sm">{passwordError}</p>}
          <button onClick={handleJoin} className="w-full py-3 text-xl font-bold bg-blue-600 hover:bg-blue-500 rounded-xl transition-all">
            입장
          </button>
          <button onClick={() => router.push('/')} className="w-full py-2 text-gray-600 hover:text-gray-400 text-sm transition-all">← 홈으로</button>
        </div>
      </div>
    );
  }

  return null;
}
