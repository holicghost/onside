'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ref, onValue, update, remove } from 'firebase/database';
import { db } from '@/lib/firebase';
import { ALL_HEROES, TIERS_DETAILED, getHeroPortraitUrl, loadHeroPortraits } from '@/lib/heroes';
import { uploadImage } from '@/lib/cloudinary';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <button onClick={copy} className={`px-3 py-1 text-sm rounded-lg transition-all flex-shrink-0 ${copied ? 'bg-green-700 text-green-200' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>
      {copied ? '복사됨!' : '복사'}
    </button>
  );
}

const ROLE_TEXT = { tank: 'text-yellow-400', damage: 'text-red-400', support: 'text-green-400' };

function PhotoInput({ value, onChange }) {
  return (
    <label className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-600 cursor-pointer hover:border-orange-400 transition-all overflow-hidden flex-shrink-0 flex items-center justify-center bg-gray-800">
      {value
        ? <img src={value} alt="" className="w-full h-full object-cover" />
        : <span className="text-gray-500 text-xl">📷</span>
      }
      <input type="file" accept="image/*" className="hidden" onChange={onChange} />
    </label>
  );
}

function HeroPicker({ heroIds, onChange }) {
  const handleChange = (hi, val) => {
    const next = [...(heroIds || ['', '', ''])];
    next[hi] = val;
    onChange(next);
  };
  return (
    <div className="flex gap-2">
      {[0, 1, 2].map(hi => {
        const hid = (heroIds || ['', '', ''])[hi] || '';
        const portraitUrl = hid ? getHeroPortraitUrl(hid) : null;
        const hero = ALL_HEROES.find(h => h.id === hid);
        return (
          <div key={hi} className="flex flex-col items-center gap-1 flex-1">
            <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-gray-700 flex items-center justify-center">
              <span className="text-gray-600 text-lg">?</span>
              {portraitUrl && (
                <img src={portraitUrl} alt={hero?.name} className="absolute inset-0 w-full h-full object-cover"
                  onError={e => e.currentTarget.remove()} />
              )}
            </div>
            <select value={hid} onChange={e => handleChange(hi, e.target.value)}
              className="w-full px-1 py-1 text-xs bg-gray-800 border border-gray-600 rounded-lg focus:outline-none">
              <option value="">{hi + 1}픽</option>
              <optgroup label="탱커">
                {ALL_HEROES.filter(h => h.role === 'tank').map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </optgroup>
              <optgroup label="딜러">
                {ALL_HEROES.filter(h => h.role === 'damage').map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </optgroup>
              <optgroup label="서포터">
                {ALL_HEROES.filter(h => h.role === 'support').map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </optgroup>
            </select>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminRoomPage() {
  const { code } = useParams();
  const router = useRouter();

  const [roomInfo, setRoomInfo] = useState(null);
  const [captains, setCaptains] = useState({});
  const [players, setPlayers] = useState({});
  const [auction, setAuction] = useState(null);

  // 편집 / 추가 중인 항목
  const [editingCaptain, setEditingCaptain] = useState(null);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editingRoom, setEditingRoom] = useState(false);
  const [addingCaptain, setAddingCaptain] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);

  // 팀장 편집 폼
  const [capName, setCapName] = useState('');
  const [capPhotoFile, setCapPhotoFile] = useState(null);
  const [capPhotoPreview, setCapPhotoPreview] = useState('');
  const [capPosition, setCapPosition] = useState('');

  // 팀원 편집 폼
  const [pName, setPName] = useState('');
  const [pPhotoFile, setPPhotoFile] = useState(null);
  const [pPhotoPreview, setPPhotoPreview] = useState('');
  const [pHeroIds, setPHeroIds] = useState(['', '', '']);
  const [pTierCurrent, setPTierCurrent] = useState('');
  const [pTierPrevious, setPTierPrevious] = useState('');
  const [pTierBest, setPTierBest] = useState('');
  const [pTierType, setPTierType] = useState('');
  const [pPosition, setPPosition] = useState('');
  const [pStyle, setPStyle] = useState('');
  const [pComment, setPComment] = useState('');

  // 방 설정 편집 폼
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');

  const [saving, setSaving] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const [origin, setOrigin] = useState('');

  useEffect(() => { setOrigin(window.location.origin); }, []);
  // 영웅 포트레이트 프리로드
  const [, setPortraitsReady] = useState(false);
  useEffect(() => { loadHeroPortraits().then(() => setPortraitsReady(true)); }, []);

  // 권한 확인
  useEffect(() => {
    if (localStorage.getItem('ow_role') !== 'admin') router.push('/admin');
  }, []);

  // Firebase 리스너
  useEffect(() => {
    if (!code) return;
    const unsubs = [
      onValue(ref(db, `rooms/${code}/info`), s => {
        const info = s.val();
        setRoomInfo(info);
        if (info && !editingRoom) { setRoomName(info.name || ''); setRoomPassword(info.password || ''); }
      }),
      onValue(ref(db, `rooms/${code}/captains`), s => setCaptains(s.val() || {})),
      onValue(ref(db, `rooms/${code}/players`), s => setPlayers(s.val() || {})),
      onValue(ref(db, `rooms/${code}/auction`), s => setAuction(s.val())),
    ];
    return () => unsubs.forEach(u => u());
  }, [code]);

  // ── 팀장 편집 ──
  const startEditCaptain = (cid) => {
    const cap = captains[cid];
    setEditingCaptain(cid);
    setCapName(cap.name || '');
    setCapPhotoPreview(cap.photo || '');
    setCapPhotoFile(null);
    setCapPosition(cap.position || '');
    setEditingPlayer(null);
    setEditingRoom(false);
    setAddingCaptain(false);
    setAddingPlayer(false);
  };
  const startAddCaptain = () => {
    setAddingCaptain(true);
    setCapName('');
    setCapPhotoFile(null);
    setCapPhotoPreview('');
    setCapPosition('');
    setEditingCaptain(null);
    setEditingPlayer(null);
    setAddingPlayer(false);
    setEditingRoom(false);
  };
  const saveNewCaptain = async () => {
    if (!capName.trim()) return;
    setSaving('newcaptain');
    let photoUrl = '';
    if (capPhotoFile) photoUrl = await uploadImage(capPhotoFile);
    const newId = `captain_${Date.now()}`;
    await update(ref(db), {
      [`rooms/${code}/captains/${newId}`]: { id: newId, name: capName.trim(), photo: photoUrl, budget: roomInfo?.budget || 100, position: capPosition },
      [`rooms/${code}/info/captainCount`]: Object.keys(captains).length + 1,
    });
    setAddingCaptain(false);
    setSaving('');
  };
  const handleCapPhoto = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCapPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
    setCapPhotoFile(file);
  };
  const saveCaptain = async (cid) => {
    setSaving('captain');
    let photoUrl = captains[cid]?.photo || '';
    if (capPhotoFile) photoUrl = await uploadImage(capPhotoFile);
    await update(ref(db, `rooms/${code}/captains/${cid}`), { name: capName, photo: photoUrl, position: capPosition });
    setEditingCaptain(null);
    setSaving('');
  };

  // ── 팀원 편집 ──
  const startEditPlayer = (pid) => {
    const p = players[pid];
    setEditingPlayer(pid);
    setPName(p.name || '');
    setPPhotoPreview(p.photo || '');
    setPPhotoFile(null);
    setPHeroIds(p.heroIds || [p.heroId || '', '', '']);
    setPTierCurrent(p.tierCurrent || p.tier || '');
    setPTierPrevious(p.tierPrevious || '');
    setPTierBest(p.tierBest || '');
    setPTierType(p.tierType || '');
    setPPosition(p.position || '');
    setPStyle(p.style || '');
    setPComment(p.comment || '');
    setEditingCaptain(null);
    setEditingRoom(false);
    setAddingCaptain(false);
    setAddingPlayer(false);
  };
  const startAddPlayer = () => {
    setAddingPlayer(true);
    setPName('');
    setPPhotoFile(null);
    setPPhotoPreview('');
    setPHeroIds(['', '', '']);
    setPTierCurrent('');
    setPTierPrevious('');
    setPTierBest('');
    setPTierType('');
    setPPosition('');
    setPStyle('');
    setPComment('');
    setEditingPlayer(null);
    setEditingCaptain(null);
    setAddingCaptain(false);
    setEditingRoom(false);
  };
  const saveNewPlayer = async () => {
    if (!pName.trim()) return;
    setSaving('newplayer');
    let photoUrl = '';
    if (pPhotoFile) photoUrl = await uploadImage(pPhotoFile);
    const primaryHero = ALL_HEROES.find(h => h.id === pHeroIds[0]);
    const newId = `player_${Date.now()}`;
    await update(ref(db), {
      [`rooms/${code}/players/${newId}`]: {
        id: newId, name: pName.trim(), photo: photoUrl,
        heroIds: pHeroIds,
        hero: primaryHero?.name || '',
        heroId: pHeroIds[0] || '',
        heroRole: primaryHero?.role || '',
        tierCurrent: pTierCurrent, tierPrevious: pTierPrevious, tierBest: pTierBest,
        tier: pTierCurrent,
        tierType: pTierType, position: pPosition,
        style: pStyle, comment: pComment,
        soldTo: null, soldPrice: null,
      },
    });
    setAddingPlayer(false);
    setSaving('');
  };
  const handlePPhoto = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setPPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
    setPPhotoFile(file);
  };
  const savePlayer = async (pid) => {
    setSaving('player');
    let photoUrl = players[pid]?.photo || '';
    if (pPhotoFile) photoUrl = await uploadImage(pPhotoFile);
    const primaryHero = ALL_HEROES.find(h => h.id === pHeroIds[0]);
    await update(ref(db, `rooms/${code}/players/${pid}`), {
      name: pName, photo: photoUrl,
      heroIds: pHeroIds,
      hero: primaryHero?.name || players[pid]?.hero || '',
      heroId: pHeroIds[0] || '',
      heroRole: primaryHero?.role || players[pid]?.heroRole || '',
      tierCurrent: pTierCurrent, tierPrevious: pTierPrevious, tierBest: pTierBest,
      tier: pTierCurrent,
      tierType: pTierType, position: pPosition,
      style: pStyle, comment: pComment,
    });
    setEditingPlayer(null);
    setSaving('');
  };

  // ── 방 설정 저장 ──
  const saveRoomSettings = async () => {
    setSaving('room');
    await update(ref(db, `rooms/${code}/info`), { name: roomName, password: roomPassword });
    setEditingRoom(false);
    setSaving('');
  };

  // ── 경매 컨트롤 ──
  const startAuction = async () => {
    // Reset auction state and go to lobby for captain order draw
    await update(ref(db), {
      [`rooms/${code}/auction`]: { status: 'idle', currentPlayerId: null, currentBid: 0, currentBidCaptainId: null, timerEnd: null, countdownEnd: null, playerOrder: null, currentIndex: 0, history: null },
      [`rooms/${code}/lobby`]: { captainOrder: null },
      [`rooms/${code}/info/status`]: 'lobby',
    });
    localStorage.setItem('ow_room', code);
    router.push(`/room/${code}/lobby`);
  };

  const resetAuction = async () => {
    const budget = roomInfo?.budget || 100;
    const updates = {};
    Object.keys(players).forEach(pid => {
      updates[`rooms/${code}/players/${pid}/soldTo`] = null;
      updates[`rooms/${code}/players/${pid}/soldPrice`] = null;
    });
    Object.keys(captains).forEach(cid => {
      updates[`rooms/${code}/captains/${cid}/budget`] = budget;
    });
    updates[`rooms/${code}/auction`] = {
      status: 'idle', currentPlayerId: null, currentBid: 0, currentBidCaptainId: null,
      timerEnd: null, countdownEnd: null, playerOrder: null, currentIndex: 0, history: null,
    };
    updates[`rooms/${code}/info/status`] = 'lobby';
    updates[`rooms/${code}/lobby`] = { captainOrder: null };
    await update(ref(db), updates);
  };

  const resumeAuction = async () => {
    if (!auction?.playerOrder) { await startAuction(); return; }
    // If paused, restore with remaining time; otherwise start countdown for current player
    if (auction.status === 'paused' && auction.pausedTimeLeft) {
      await update(ref(db), {
        [`rooms/${code}/auction/status`]: 'bidding',
        [`rooms/${code}/auction/timerEnd`]: Date.now() + auction.pausedTimeLeft,
        [`rooms/${code}/auction/pausedTimeLeft`]: null,
        [`rooms/${code}/info/status`]: 'auction',
      });
    } else {
      await update(ref(db), {
        [`rooms/${code}/auction/status`]: 'countdown',
        [`rooms/${code}/auction/countdownEnd`]: Date.now() + 10000,
        [`rooms/${code}/auction/timerEnd`]: null,
        [`rooms/${code}/info/status`]: 'auction',
      });
    }
    localStorage.setItem('ow_room', code);
    router.push(`/room/${code}/auction`);
  };

  const deleteRoom = async () => {
    await remove(ref(db, `rooms/${code}`));
    router.push('/admin');
  };

  const captainsList = Object.entries(captains).map(([id, c]) => ({ id, ...c }));
  const playersList = Object.entries(players).map(([id, p]) => ({ id, ...p }));

  const inputCls = "w-full px-3 py-2 text-base bg-gray-800 border border-gray-600 rounded-xl focus:border-orange-400 focus:outline-none";

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: '#0f0f1a' }}>
      <div className="max-w-4xl mx-auto space-y-6">

        {/* 헤더 */}
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/admin')} className="text-gray-500 hover:text-gray-300 text-sm transition-colors">← 목록</button>
          <div className="flex-1">
            <h1 className="text-3xl font-black text-white">{roomInfo?.name || '로딩 중...'}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="font-mono text-orange-400 font-bold text-xl tracking-widest">{code}</span>
              {roomInfo?.password ? <span className="text-gray-500 text-sm">비번: {roomInfo.password}</span> : <span className="text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full">비밀번호 없음</span>}
              <span className="text-gray-600 text-sm">{roomInfo?.status}</span>
            </div>
          </div>
        </div>

        {/* ── 링크 공유 ── */}
        <section className="bg-gray-900/70 border border-gray-700 rounded-2xl p-5">
          <button onClick={() => setShowLinks(v => !v)} className="flex items-center gap-2 text-base font-bold text-gray-300 hover:text-white transition-all">
            🔗 링크 공유 {showLinks ? '▲' : '▼'}
          </button>
          {showLinks && (
            <div className="mt-4 space-y-2">
              {captainsList.map(cap => (
                <div key={cap.id} className="flex items-center gap-3">
                  <span className="text-white text-sm font-bold w-20 truncate flex-shrink-0">{cap.name}</span>
                  <span className="text-gray-500 text-xs flex-1 truncate font-mono min-w-0">{origin}/room/{code}/captain/{cap.id}</span>
                  <CopyButton text={`${origin}/room/${code}/captain/${cap.id}`} />
                </div>
              ))}
              <div className="flex items-center gap-3">
                <span className="text-blue-400 text-sm font-bold w-20 flex-shrink-0">관전자</span>
                <span className="text-gray-500 text-xs flex-1 truncate font-mono min-w-0">{origin}/room/{code}/spectator</span>
                <CopyButton text={`${origin}/room/${code}/spectator`} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-purple-400 text-sm font-bold w-20 flex-shrink-0">관리자</span>
                <span className="text-gray-500 text-xs flex-1 truncate font-mono min-w-0">{origin}/room/{code}/admin</span>
                <CopyButton text={`${origin}/admin/${code}`} />
              </div>
            </div>
          )}
        </section>

        {/* ── 방 설정 ── */}
        <section className="bg-gray-900/70 border border-gray-700 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-orange-400">방 설정</h2>
            {!editingRoom
              ? <button onClick={() => setEditingRoom(true)} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-xl transition-all">수정</button>
              : <div className="flex gap-2">
                  <button onClick={saveRoomSettings} disabled={saving === 'room'}
                    className="px-4 py-2 text-sm font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-50 rounded-xl transition-all">
                    {saving === 'room' ? '저장 중...' : '저장'}
                  </button>
                  <button onClick={() => setEditingRoom(false)} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-xl transition-all">취소</button>
                </div>
            }
          </div>
          {editingRoom ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">대회명</label>
                <input className={inputCls} value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="대회명" />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">비밀번호 (선택)</label>
                <input className={inputCls} value={roomPassword} onChange={e => setRoomPassword(e.target.value)} placeholder="없으면 비워두세요" />
              </div>
            </div>
          ) : (
            <div className="flex gap-6 text-sm text-gray-400">
              <span>대회명: <span className="text-white">{roomInfo?.name}</span></span>
              <span>예산: <span className="text-white">{roomInfo?.budget}P</span></span>
              <span>팀 수: <span className="text-white">{roomInfo?.captainCount}</span></span>
              <span>팀당 인원: <span className="text-white">{roomInfo?.teamSize || (roomInfo?.memberCount ? roomInfo.memberCount + 1 : '?')}</span></span>
            </div>
          )}
        </section>

        {/* ── 경매 관리 ── */}
        <section className="bg-gray-900/70 border border-gray-700 rounded-2xl p-5">
          <h2 className="text-xl font-bold text-orange-400 mb-4">경매 관리</h2>
          <div className="flex flex-wrap gap-3 mb-3">
            <button onClick={startAuction}
              className="px-5 py-3 text-base font-bold bg-green-600 hover:bg-green-500 rounded-xl transition-all">
              🔨 경매 시작
            </button>
            <button onClick={resumeAuction}
              className="px-5 py-3 text-base font-bold bg-blue-600 hover:bg-blue-500 rounded-xl transition-all">
              ▶ 경매 재진행
            </button>
            <button onClick={resetAuction}
              className="px-5 py-3 text-base font-bold bg-yellow-600 hover:bg-yellow-500 rounded-xl transition-all">
              🔄 경매 초기화
            </button>
            <button onClick={() => router.push(`/room/${code}/result`)}
              className="px-5 py-3 text-base font-bold bg-purple-600 hover:bg-purple-500 rounded-xl transition-all">
              🏆 결과 보기
            </button>
          </div>
          <div className="text-sm text-gray-500 bg-gray-800/50 rounded-xl p-3 space-y-1">
            <p>현재 상태: <span className="text-white font-bold">{auction?.status || '없음'}</span></p>
            {auction?.playerOrder && (
              <p>진행: <span className="text-white">{(auction.currentIndex || 0) + 1} / {Array.isArray(auction.playerOrder) ? auction.playerOrder.length : Object.keys(auction.playerOrder).length}</span></p>
            )}
          </div>
          <div className="mt-4 border-t border-gray-700 pt-4">
            {!confirmDelete
              ? <button onClick={() => setConfirmDelete(true)}
                  className="px-5 py-2 text-base font-bold bg-red-900 hover:bg-red-800 rounded-xl transition-all">
                  방 삭제
                </button>
              : <div className="flex items-center gap-3">
                  <span className="text-red-400 font-bold">정말 삭제하시겠습니까?</span>
                  <button onClick={deleteRoom} className="px-4 py-2 text-sm font-bold bg-red-600 hover:bg-red-500 rounded-xl transition-all">삭제</button>
                  <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-xl transition-all">취소</button>
                </div>
            }
          </div>
        </section>

        {/* ── 팀장 목록 ── */}
        <section className="bg-gray-900/70 border border-gray-700 rounded-2xl p-5">
          <h2 className="text-xl font-bold text-orange-400 mb-4">팀장 목록 ({captainsList.length}명)</h2>
          <div className="space-y-3">
            {captainsList.map(cap => (
              <div key={cap.id} className="bg-gray-800/50 rounded-xl p-4">
                {editingCaptain === cap.id ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-4">
                      <PhotoInput value={capPhotoPreview} onChange={handleCapPhoto} />
                      <div className="flex-1 space-y-3">
                        <div>
                          <label className="text-sm text-gray-400 mb-1 block">닉네임</label>
                          <input className={inputCls} value={capName} onChange={e => setCapName(e.target.value)} placeholder="닉네임" />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-2 block font-semibold">포지션</label>
                          <div className="flex gap-2">
                            {[{ val: '탱커', active: 'bg-yellow-600 border-yellow-500 text-white' }, { val: '딜러', active: 'bg-red-600 border-red-500 text-white' }, { val: '힐러', active: 'bg-green-600 border-green-500 text-white' }].map(({ val, active }) => (
                              <button key={val} type="button" onClick={() => setCapPosition(val)}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${capPosition === val ? active : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                                {val}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveCaptain(cap.id)} disabled={saving === 'captain'}
                        className="px-4 py-2 text-sm font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-50 rounded-xl transition-all">
                        {saving === 'captain' ? '저장 중...' : '저장'}
                      </button>
                      <button onClick={() => setEditingCaptain(null)} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-xl transition-all">취소</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    {cap.photo
                      ? <img src={cap.photo} alt={cap.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-xl flex-shrink-0">👤</div>
                    }
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-bold text-lg">{cap.name}</p>
                        {cap.position && (
                          <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                            cap.position === '탱커' ? 'bg-yellow-900/60 text-yellow-300' :
                            cap.position === '딜러' ? 'bg-red-900/60 text-red-300' :
                            'bg-green-900/60 text-green-300'
                          }`}>{cap.position}</span>
                        )}
                      </div>
                      <p className="text-gray-400 text-sm">예산: <span className="text-green-400">{cap.budget}P</span></p>
                    </div>
                    <button onClick={() => startEditCaptain(cap.id)} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-xl transition-all">수정</button>
                  </div>
                )}
              </div>
            ))}

            {/* 팀장 추가 폼 */}
            {addingCaptain ? (
              <div className="bg-gray-800/50 border border-orange-500/40 rounded-xl p-4 space-y-3">
                <p className="text-orange-400 text-sm font-bold">새 팀장 추가</p>
                <div className="flex items-start gap-4">
                  <PhotoInput value={capPhotoPreview} onChange={handleCapPhoto} />
                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="text-sm text-gray-400 mb-1 block">닉네임</label>
                      <input className={inputCls} value={capName} onChange={e => setCapName(e.target.value)} placeholder="닉네임" autoFocus />
                    </div>
                    <div>
                      <label className="text-xs text-gray-400 mb-2 block font-semibold">포지션</label>
                      <div className="flex gap-2">
                        {[{ val: '탱커', active: 'bg-yellow-600 border-yellow-500 text-white' }, { val: '딜러', active: 'bg-red-600 border-red-500 text-white' }, { val: '힐러', active: 'bg-green-600 border-green-500 text-white' }].map(({ val, active }) => (
                          <button key={val} type="button" onClick={() => setCapPosition(val)}
                            className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${capPosition === val ? active : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveNewCaptain} disabled={saving === 'newcaptain' || !capName.trim()}
                    className="px-4 py-2 text-sm font-bold bg-orange-500 hover:bg-orange-400 disabled:opacity-50 rounded-xl transition-all">
                    {saving === 'newcaptain' ? '저장 중...' : '추가'}
                  </button>
                  <button onClick={() => setAddingCaptain(false)} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-xl transition-all">취소</button>
                </div>
              </div>
            ) : (
              <button onClick={startAddCaptain}
                className="w-full py-3 text-sm font-bold text-orange-400 border border-dashed border-orange-500/40 hover:border-orange-400 hover:bg-orange-500/5 rounded-xl transition-all">
                + 팀장 추가
              </button>
            )}
          </div>
        </section>

        {/* ── 팀원 목록 ── */}
        <section className="bg-gray-900/70 border border-gray-700 rounded-2xl p-5">
          <h2 className="text-xl font-bold text-orange-400 mb-4">팀원 목록 ({playersList.length}명)</h2>
          <div className="space-y-3">
            {playersList.map((p, idx) => (
              <div key={p.id} className="bg-gray-800/50 rounded-xl p-4">
                {editingPlayer === p.id ? (
                  <div className="space-y-4">
                    <p className="text-gray-400 text-sm font-bold">선수 {idx + 1} 수정</p>
                    <div className="flex items-start gap-4">
                      <PhotoInput value={pPhotoPreview} onChange={handlePPhoto} />
                      <div className="flex-1 space-y-3">
                        <input className={inputCls} value={pName} onChange={e => setPName(e.target.value)} placeholder="닉네임" />
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">주요 영웅 (3개)</label>
                          <HeroPicker heroIds={pHeroIds} onChange={setPHeroIds} />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[['이번 시즌', pTierCurrent, setPTierCurrent], ['저번 시즌', pTierPrevious, setPTierPrevious], ['최고 티어', pTierBest, setPTierBest]].map(([label, val, setter]) => (
                            <div key={label}>
                              <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                              <select value={val} onChange={e => setter(e.target.value)}
                                className="w-full px-2 py-2 text-sm bg-gray-800 border border-gray-600 rounded-lg focus:outline-none">
                                <option value="">선택</option>
                                {TIERS_DETAILED.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-400 mb-2 block font-semibold">티어 구분</label>
                            <div className="flex gap-2">
                              {[{ val: '고티어', active: 'bg-rose-600 border-rose-500 text-white' }, { val: '저티어', active: 'bg-sky-600 border-sky-500 text-white' }].map(({ val, active }) => (
                                <button key={val} type="button" onClick={() => setPTierType(val)}
                                  className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${pTierType === val ? active : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                                  {val}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 mb-2 block font-semibold">포지션</label>
                            <div className="flex gap-1.5">
                              {[{ val: '탱커', active: 'bg-yellow-600 border-yellow-500 text-white' }, { val: '딜러', active: 'bg-red-600 border-red-500 text-white' }, { val: '힐러', active: 'bg-green-600 border-green-500 text-white' }].map(({ val, active }) => (
                                <button key={val} type="button" onClick={() => setPPosition(val)}
                                  className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${pPosition === val ? active : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                                  {val}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">플레이 성향</label>
                            <input className={inputCls} value={pStyle} onChange={e => setPStyle(e.target.value)} placeholder="예: 공격적 플레이" />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">대회 포부 한마디</label>
                            <input className={inputCls} value={pComment} onChange={e => setPComment(e.target.value)} placeholder="이번 대회에서..." />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => savePlayer(p.id)} disabled={saving === 'player'}
                        className="px-4 py-2 text-sm font-bold bg-blue-500 hover:bg-blue-400 disabled:opacity-50 rounded-xl transition-all">
                        {saving === 'player' ? '저장 중...' : '저장'}
                      </button>
                      <button onClick={() => setEditingPlayer(null)} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-xl transition-all">취소</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    {p.photo
                      ? <img src={p.photo} alt={p.name} className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                      : <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-xl flex-shrink-0">👤</div>
                    }
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-white font-bold">{p.name}</p>
                        {p.soldTo
                          ? <span className="text-xs bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded-full">낙찰 {p.soldPrice}P</span>
                          : <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">미낙찰</span>
                        }
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {(p.tierType || p.position) && (
                          <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-300 rounded-full font-bold">
                            {[p.tierType, p.position].filter(Boolean).join(' ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => startEditPlayer(p.id)} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-xl transition-all flex-shrink-0">수정</button>
                  </div>
                )}
              </div>
            ))}

            {/* 선수 추가 폼 */}
            {addingPlayer ? (
              <div className="bg-gray-800/50 border border-blue-500/40 rounded-xl p-4 space-y-4">
                <p className="text-blue-400 text-sm font-bold">새 선수 추가</p>
                <div className="flex items-start gap-4">
                  <PhotoInput value={pPhotoPreview} onChange={handlePPhoto} />
                  <div className="flex-1 space-y-3">
                    <input className={inputCls} value={pName} onChange={e => setPName(e.target.value)} placeholder="닉네임" autoFocus />
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">주요 영웅 (3개)</label>
                      <HeroPicker heroIds={pHeroIds} onChange={setPHeroIds} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[['이번 시즌', pTierCurrent, setPTierCurrent], ['저번 시즌', pTierPrevious, setPTierPrevious], ['최고 티어', pTierBest, setPTierBest]].map(([label, val, setter]) => (
                        <div key={label}>
                          <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                          <select value={val} onChange={e => setter(e.target.value)}
                            className="w-full px-2 py-2 text-sm bg-gray-800 border border-gray-600 rounded-lg focus:outline-none">
                            <option value="">선택</option>
                            {TIERS_DETAILED.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 mb-2 block font-semibold">티어 구분</label>
                        <div className="flex gap-2">
                          {[{ val: '고티어', active: 'bg-rose-600 border-rose-500 text-white' }, { val: '저티어', active: 'bg-sky-600 border-sky-500 text-white' }].map(({ val, active }) => (
                            <button key={val} type="button" onClick={() => setPTierType(val)}
                              className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${pTierType === val ? active : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                              {val}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-2 block font-semibold">포지션</label>
                        <div className="flex gap-1.5">
                          {[{ val: '탱커', active: 'bg-yellow-600 border-yellow-500 text-white' }, { val: '딜러', active: 'bg-red-600 border-red-500 text-white' }, { val: '힐러', active: 'bg-green-600 border-green-500 text-white' }].map(({ val, active }) => (
                            <button key={val} type="button" onClick={() => setPPosition(val)}
                              className={`flex-1 py-2 text-xs font-bold rounded-lg border transition-all ${pPosition === val ? active : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                              {val}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">플레이 성향</label>
                        <input className={inputCls} value={pStyle} onChange={e => setPStyle(e.target.value)} placeholder="예: 공격적 플레이" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">대회 포부 한마디</label>
                        <input className={inputCls} value={pComment} onChange={e => setPComment(e.target.value)} placeholder="이번 대회에서..." />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveNewPlayer} disabled={saving === 'newplayer' || !pName.trim()}
                    className="px-4 py-2 text-sm font-bold bg-blue-500 hover:bg-blue-400 disabled:opacity-50 rounded-xl transition-all">
                    {saving === 'newplayer' ? '저장 중...' : '추가'}
                  </button>
                  <button onClick={() => setAddingPlayer(false)} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-xl transition-all">취소</button>
                </div>
              </div>
            ) : (
              <button onClick={startAddPlayer}
                className="w-full py-3 text-sm font-bold text-blue-400 border border-dashed border-blue-500/40 hover:border-blue-400 hover:bg-blue-500/5 rounded-xl transition-all">
                + 선수 추가
              </button>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
