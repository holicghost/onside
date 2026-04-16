'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ref, set, get, remove } from 'firebase/database';
import { db } from '@/lib/firebase';
import { ALL_HEROES, TIERS_DETAILED, getHeroPortraitUrl, loadHeroPortraits } from '@/lib/heroes';
import { uploadImage } from '@/lib/cloudinary';

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}


const ROLE_TEXT = { tank: 'text-yellow-300', damage: 'text-red-300', support: 'text-green-300' };

function PhotoInput({ value, onChange, size = 'md' }) {
  const cls = size === 'sm' ? 'w-16 h-16' : 'w-24 h-24';
  return (
    <label className={`${cls} rounded-xl border-2 border-dashed border-gray-600 cursor-pointer hover:border-orange-400 transition-all overflow-hidden flex-shrink-0 flex items-center justify-center bg-gray-800`}>
      {value
        ? <img src={value} alt="preview" className="w-full h-full object-cover" />
        : <div className="flex flex-col items-center gap-1 text-gray-500"><span className="text-2xl">📷</span><span className="text-xs">사진</span></div>
      }
      <input type="file" accept="image/*" className="hidden" onChange={onChange} />
    </label>
  );
}

// Each slot is its own component so imgError state resets properly when the hero changes.
function HeroSlot({ hi, hid, heroIds, onChange }) {
  const [imgError, setImgError] = useState(false);
  // Reset error state whenever the selected hero changes
  useEffect(() => { setImgError(false); }, [hid]);

  const portraitUrl = hid ? getHeroPortraitUrl(hid) : null;
  const hero = ALL_HEROES.find(h => h.id === hid);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-gray-700 flex items-center justify-center flex-shrink-0">
        {(!portraitUrl || imgError) && <span className="text-gray-600 text-xs">없음</span>}
        {portraitUrl && !imgError && (
          <img
            src={portraitUrl}
            alt={hero?.name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        )}
        {hero && !imgError && (
          <span
            className={`absolute bottom-0 left-0 right-0 text-center text-[9px] font-bold py-0.5 ${ROLE_TEXT[hero.role] || 'text-gray-400'}`}
            style={{ background: 'rgba(0,0,0,0.7)' }}
          >
            {hero.roleName}
          </span>
        )}
      </div>
      <select
        value={hid}
        onChange={e => {
          const next = [...heroIds];
          next[hi] = e.target.value;
          onChange(next);
        }}
        className="w-full px-1 py-1 text-xs bg-gray-800 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-400"
      >
        <option value="">없음</option>
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
}

function HeroPicker({ heroIds, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map(hi => (
        <HeroSlot key={hi} hi={hi} hid={heroIds[hi] || ''} heroIds={heroIds} onChange={onChange} />
      ))}
    </div>
  );
}

function DraftModal({ drafts, onApply, onDelete, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-3xl font-bold text-white">임시저장 목록</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-2xl">✕</button>
        </div>
        {drafts.length === 0
          ? <p className="text-gray-600 text-center py-6">저장된 임시저장이 없습니다.</p>
          : drafts.map(d => (
              <div key={d.id} className="flex items-center justify-between bg-gray-800 rounded-xl p-4">
                <div>
                  <p className="text-white font-bold">{d.tournamentName || '(이름 없음)'}</p>
                  <p className="text-gray-400 text-sm">
                    {d.captainCount}팀 · 팀당 {d.teamSize}명 ·
                    {d.updatedAt ? ` ${new Date(d.updatedAt).toLocaleString('ko-KR')}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => onApply(d)} className="px-4 py-2 text-sm font-bold bg-blue-600 hover:bg-blue-500 rounded-lg transition-all">불러오기</button>
                  <button onClick={() => onDelete(d.id)} className="px-3 py-2 text-sm bg-red-800 hover:bg-red-700 rounded-lg transition-all">삭제</button>
                </div>
              </div>
            ))
        }
      </div>
    </div>
  );
}

export default function CreateRoom() {
  const router = useRouter();

  // ── 권한 ──
  const [permMode, setPermMode] = useState(null); // null=modal | 'guest' | 'admin'
  const [permAdminInput, setPermAdminInput] = useState(false);
  const [permPassword, setPermPassword] = useState('');
  const [permError, setPermError] = useState('');
  const isAdmin = permMode === 'admin';

  // ── 임시저장 ──
  const [draftId, setDraftId] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState(''); // '' | 'saving' | 'saved'
  const autoSaveTimer = useRef(null);

  // ── 폼 ──
  const [tournamentName, setTournamentName] = useState('');
  const [captainCount, setCaptainCount] = useState(2);
  const [teamSize, setTeamSize] = useState(5); // 팀장 포함 한 팀당 인원
  const [budget, setBudget] = useState(1000);
  const [password, setPassword] = useState('');
  const [captainForms, setCaptainForms] = useState([]);
  const [playerForms, setPlayerForms] = useState([]);

  // ── 제출 ──
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState('');

  // 총 팀원 수 = (팀장 포함 인원 - 1) × 팀 수
  const totalPlayers = Math.max(0, (teamSize - 1) * captainCount);

  // 팀장 폼 동기화
  useEffect(() => {
    setCaptainForms(prev => {
      const next = [...prev];
      while (next.length < captainCount) next.push({ name: '', photoFile: null, photoPreview: '', position: '' });
      return next.slice(0, captainCount);
    });
  }, [captainCount]);

  // 팀원 폼 동기화
  useEffect(() => {
    setPlayerForms(prev => {
      const next = [...prev];
      while (next.length < totalPlayers)
        next.push({ name: '', photoFile: null, photoPreview: '', heroIds: ['', '', ''], tierCurrent: '', tierPrevious: '', tierBest: '', tierType: '', position: '', style: '', comment: '' });
      return next.slice(0, totalPlayers);
    });
  }, [totalPlayers]);

  // 영웅 포트레이트 프리로드 (OverFast API)
  const [, setPortraitsReady] = useState(false);
  useEffect(() => {
    loadHeroPortraits().then(() => setPortraitsReady(true));
  }, []);

  // draftId 로컬스토리지 복원
  useEffect(() => {
    const saved = localStorage.getItem('ow_draft_id');
    if (saved) setDraftId(saved);
  }, []);

  // ── 임시저장 자동 트리거 ──
  const triggerAutoSave = useCallback(() => {
    if (!isAdmin) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus('saving');
    autoSaveTimer.current = setTimeout(async () => {
      try {
        const id = draftId || `draft_${Date.now()}`;
        if (!draftId) {
          setDraftId(id);
          localStorage.setItem('ow_draft_id', id);
        }
        await set(ref(db, `drafts/${id}`), {
          tournamentName,
          captainCount,
          teamSize,
          budget,
          password,
          captainForms: captainForms.map(c => ({ name: c.name, photo: '' })),
          playerForms: playerForms.map(p => ({
            name: p.name, photo: '', heroIds: p.heroIds,
            tierCurrent: p.tierCurrent, tierPrevious: p.tierPrevious, tierBest: p.tierBest,
            tierType: p.tierType, position: p.position,
            style: p.style, comment: p.comment,
          })),
          updatedAt: Date.now(),
          createdAt: draftId ? null : Date.now(),
        });
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus(''), 2000);
      } catch (err) {
        setAutoSaveStatus('');
      }
    }, 2000);
  }, [isAdmin, draftId, tournamentName, captainCount, teamSize, budget, password, captainForms, playerForms]);

  useEffect(() => { triggerAutoSave(); }, [tournamentName, captainCount, teamSize, budget, password]);

  // ── 임시저장 목록 불러오기 ──
  const loadDraftsList = async () => {
    try {
      const snap = await get(ref(db, 'drafts'));
      const data = snap.val() || {};
      const list = Object.entries(data).map(([id, d]) => ({ id, ...d }))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      setDrafts(list);
      setShowDraftModal(true);
    } catch (err) {
      setError('임시저장 불러오기 실패');
    }
  };

  const applyDraft = (draft) => {
    setTournamentName(draft.tournamentName || '');
    setCaptainCount(draft.captainCount || 2);
    setTeamSize(draft.teamSize || 5);
    setBudget(draft.budget || 1000);
    setPassword(draft.password || '');
    if (draft.captainForms) setCaptainForms(draft.captainForms.map(c => ({ ...c, photoFile: null, photoPreview: c.photo || '' })));
    if (draft.playerForms) setPlayerForms(draft.playerForms.map(p => ({ ...p, photoFile: null, photoPreview: p.photo || '', heroIds: p.heroIds || ['', '', ''] })));
    setDraftId(draft.id);
    localStorage.setItem('ow_draft_id', draft.id);
    setShowDraftModal(false);
  };

  const deleteDraft = async (id) => {
    await remove(ref(db, `drafts/${id}`));
    setDrafts(prev => prev.filter(d => d.id !== id));
  };

  // ── 폼 업데이트 헬퍼 ──
  const updateCaptain = (i, field, value) => {
    setCaptainForms(prev => { const next = [...prev]; next[i] = { ...next[i], [field]: value }; return next; });
    triggerAutoSave();
  };
  const updatePlayer = (i, field, value) => {
    setPlayerForms(prev => { const next = [...prev]; next[i] = { ...next[i], [field]: value }; return next; });
    triggerAutoSave();
  };
  const handleCaptainPhoto = (i, e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => updateCaptain(i, 'photoPreview', ev.target.result);
    reader.readAsDataURL(file);
    updateCaptain(i, 'photoFile', file);
  };
  const handlePlayerPhoto = (i, e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => updatePlayer(i, 'photoPreview', ev.target.result);
    reader.readAsDataURL(file);
    updatePlayer(i, 'photoFile', file);
  };

  // ── 관리자 인증 ──
  const handleAdminAuth = () => {
    if (permPassword === 'abc123') {
      setPermMode('admin');
      localStorage.setItem('ow_role', 'admin');
      setPermError('');
    } else {
      setPermError('비밀번호가 틀렸습니다.');
    }
  };

  // ── 방 생성 ──
  const handleSubmit = async () => {
    if (!isAdmin) return;
    setError('');
    if (!tournamentName.trim()) { setError('대회명을 입력해주세요.'); return; }
    for (let i = 0; i < captainForms.length; i++) {
      if (!captainForms[i].name.trim()) { setError(`팀장 ${i + 1}의 닉네임을 입력해주세요.`); return; }
      if (!captainForms[i].position) { setError(`팀장 ${i + 1}의 포지션을 선택해주세요.`); return; }
    }
    for (let i = 0; i < playerForms.length; i++) {
      if (!playerForms[i].name.trim()) { setError(`선수 ${i + 1}의 닉네임을 입력해주세요.`); return; }
      if (!playerForms[i].heroIds[0]) { setError(`선수 ${i + 1}의 주 영웅을 선택해주세요.`); return; }
      if (!playerForms[i].tierCurrent) { setError(`선수 ${i + 1}의 이번 시즌 티어를 선택해주세요.`); return; }
      if (!playerForms[i].tierType) { setError(`선수 ${i + 1}의 티어 구분을 선택해주세요.`); return; }
      if (!playerForms[i].position) { setError(`선수 ${i + 1}의 포지션을 선택해주세요.`); return; }
    }

    setLoading(true);
    try {
      const code = generateCode();
      const captainData = {};
      for (let i = 0; i < captainForms.length; i++) {
        const c = captainForms[i];
        let photoUrl = '';
        if (c.photoFile) { setUploadStatus(`팀장 사진 업로드 (${i + 1}/${captainForms.length})`); photoUrl = await uploadImage(c.photoFile); }
        const cid = `captain_${i}`;
        captainData[cid] = { id: cid, name: c.name, photo: photoUrl, budget, position: c.position || '' };
      }

      const playerData = {};
      for (let i = 0; i < playerForms.length; i++) {
        const p = playerForms[i];
        let photoUrl = '';
        if (p.photoFile) { setUploadStatus(`선수 사진 업로드 (${i + 1}/${playerForms.length})`); photoUrl = await uploadImage(p.photoFile); }
        const pid = `player_${i}`;
        const primaryHero = ALL_HEROES.find(h => h.id === p.heroIds[0]);
        playerData[pid] = {
          id: pid, name: p.name, photo: photoUrl,
          heroIds: p.heroIds,
          hero: primaryHero?.name || '',
          heroId: p.heroIds[0] || '',
          heroRole: primaryHero?.role || '',
          tierCurrent: p.tierCurrent, tierPrevious: p.tierPrevious, tierBest: p.tierBest,
          tier: p.tierCurrent,
          tierType: p.tierType || '', position: p.position || '',
          style: p.style || '', comment: p.comment || '',
          soldTo: null, soldPrice: null,
        };
      }

      setUploadStatus('Firebase 저장 중...');
      await set(ref(db, `rooms/${code}`), {
        info: { name: tournamentName.trim(), code, password: password.trim(), captainCount, memberCount: teamSize - 1, teamSize, budget, status: 'lobby', createdAt: Date.now() },
        captains: captainData,
        players: playerData,
        auction: { status: 'idle', currentPlayerId: null, currentBid: 0, currentBidCaptainId: null, timerEnd: null, playerOrder: null, currentIndex: 0, history: null },
        lobby: { captainOrder: null },
      });

      // 임시저장 삭제
      if (draftId) { await remove(ref(db, `drafts/${draftId}`)); localStorage.removeItem('ow_draft_id'); }

      localStorage.setItem('ow_room', code);
      localStorage.setItem('ow_role', 'admin');
      localStorage.removeItem('ow_captain_id');
      router.push(`/room/${code}/lobby`);
    } catch (e) {
      setError(e.message || '오류가 발생했습니다.');
    }
    setLoading(false);
    setUploadStatus('');
  };

  // ── 권한 모달 ──
  if (permMode === null) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a3e 50%, #0f0f1a 100%)' }}>
        <div className="w-full max-w-sm bg-gray-900/90 border border-gray-700 rounded-2xl p-8 space-y-5 animate-slide-up">
          <div className="text-center">
            <div className="text-5xl mb-3">🏟️</div>
            <h2 className="text-4xl font-black text-white">방 만들기</h2>
            <p className="text-gray-400 mt-1 text-lg">계속하려면 역할을 선택하세요</p>
          </div>

          {!permAdminInput ? (
            <div className="space-y-3">
              <button
                onClick={() => { setPermAdminInput(true); setPermError(''); }}
                className="w-full py-5 text-2xl font-bold bg-orange-500 hover:bg-orange-400 rounded-xl transition-all"
                style={{ boxShadow: '0 6px 24px rgba(249,115,22,0.3)' }}
              >
                관리자로 계속
              </button>
              <button
                onClick={() => setPermMode('guest')}
                className="w-full py-5 text-2xl font-bold bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl transition-all"
              >
                비회원으로 계속
              </button>
              <p className="text-center text-gray-600 text-base">비회원은 입력은 가능하지만 저장이 불가합니다</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-gray-300 text-lg font-semibold">관리자 비밀번호</p>
              <input
                type="password"
                className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:border-orange-400 focus:outline-none"
                placeholder="비밀번호 입력"
                value={permPassword}
                onChange={e => setPermPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdminAuth()}
                autoFocus
              />
              {permError && <p className="text-red-400 text-base text-center">{permError}</p>}
              <div className="flex gap-3">
                <button onClick={handleAdminAuth} className="flex-1 py-4 text-xl font-bold bg-orange-500 hover:bg-orange-400 rounded-xl transition-all">확인</button>
                <button onClick={() => { setPermAdminInput(false); setPermPassword(''); setPermError(''); }} className="py-4 px-5 text-xl bg-gray-700 hover:bg-gray-600 rounded-xl transition-all">취소</button>
              </div>
            </div>
          )}

          <button onClick={() => router.push('/')} className="w-full py-2 text-gray-600 hover:text-gray-400 text-lg transition-all">← 홈으로</button>
        </div>
      </div>
    );
  }

  // ── 메인 폼 ──
  return (
    <div className="min-h-screen py-10 px-4" style={{ background: '#0f0f1a' }}>
      {showDraftModal && <DraftModal drafts={drafts} onApply={applyDraft} onDelete={deleteDraft} onClose={() => setShowDraftModal(false)} />}

      <div className="max-w-3xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/')} className="text-gray-500 hover:text-gray-300 text-xl transition-all">← 홈</button>
          <h1 className="text-4xl font-black text-white">방 만들기</h1>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <>
                {autoSaveStatus === 'saving' && <span className="text-yellow-400 text-sm">저장 중...</span>}
                {autoSaveStatus === 'saved' && <span className="text-green-400 text-sm">✓ 임시저장됨</span>}
                <button onClick={loadDraftsList} className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-all">
                  📂 불러오기
                </button>
              </>
            )}
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${isAdmin ? 'bg-orange-900 text-orange-300' : 'bg-gray-800 text-gray-400'}`}>
              {isAdmin ? '관리자' : '비회원'}
            </span>
          </div>
        </div>

        {/* 기본 설정 */}
        <section className="bg-gray-900/70 border border-gray-700 rounded-2xl p-6 space-y-4">
          <h2 className="text-3xl font-bold text-orange-400">기본 설정</h2>
          <div>
            <label className="block text-xl font-semibold mb-1 text-gray-300">대회명</label>
            <input
              className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:border-orange-400 focus:outline-none"
              placeholder="예: 오버워치 내전 시즌 1"
              value={tournamentName}
              onChange={e => { setTournamentName(e.target.value); triggerAutoSave(); }}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xl font-semibold mb-1 text-gray-300">팀 수</label>
              <select value={captainCount} onChange={e => setCaptainCount(Number(e.target.value))}
                className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:outline-none">
                {[2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n}팀</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xl font-semibold mb-1 text-gray-300">한 팀당 인원 (팀장 포함)</label>
              <select value={teamSize} onChange={e => setTeamSize(Number(e.target.value))}
                className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:outline-none">
                {[2,3,4,5,6,7].map(n => <option key={n} value={n}>{n}명</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xl font-semibold mb-1 text-gray-300">팀당 예산 (포인트)</label>
              <input type="number" min={10} max={9999} value={budget}
                onChange={e => { setBudget(Number(e.target.value)); triggerAutoSave(); }}
                className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:border-orange-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xl font-semibold mb-1 text-gray-300">방 비밀번호 <span className="text-gray-500 text-base font-normal">(선택)</span></label>
              <input type="text" value={password}
                onChange={e => { setPassword(e.target.value); triggerAutoSave(); }}
                className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:border-orange-400 focus:outline-none"
                placeholder="없으면 누구나 입장 가능" />
            </div>
          </div>
          <div className="bg-blue-900/30 border border-blue-800 rounded-xl px-4 py-3">
            <span className="text-blue-300 font-bold">총 뽑아야 할 팀원 수: </span>
            <span className="text-white font-black text-xl">{totalPlayers}명</span>
            <span className="text-gray-400 text-sm ml-2">= ({teamSize} - 1) × {captainCount}팀</span>
          </div>
        </section>

        {/* 팀장 정보 */}
        <section className="bg-gray-900/70 border border-gray-700 rounded-2xl p-6 space-y-3">
          <h2 className="text-3xl font-bold text-orange-400">팀장 정보</h2>
          {captainForms.map((cap, i) => (
            <div key={i} className="flex items-start gap-4 bg-gray-800/50 rounded-xl p-4">
              <PhotoInput value={cap.photoPreview} onChange={e => handleCaptainPhoto(i, e)} />
              <div className="flex-1 space-y-3">
                <p className="text-gray-400 text-base font-bold">팀장 {i + 1}</p>
                <input
                  className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:border-orange-400 focus:outline-none"
                  placeholder="닉네임"
                  value={cap.name}
                  onChange={e => updateCaptain(i, 'name', e.target.value)}
                />
                <div>
                  <label className="text-base text-gray-400 mb-2 block font-semibold">포지션 <span className="text-red-400">*</span></label>
                  <div className="flex gap-2">
                    {[
                      { val: '탱커', active: 'bg-yellow-600 border-yellow-500 text-white' },
                      { val: '딜러', active: 'bg-red-600 border-red-500 text-white' },
                      { val: '힐러', active: 'bg-green-600 border-green-500 text-white' },
                    ].map(({ val, active }) => (
                      <button key={val} type="button"
                        onClick={() => updateCaptain(i, 'position', val)}
                        className={`flex-1 py-2 text-sm font-bold rounded-lg border transition-all ${
                          cap.position === val ? active : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                        }`}>
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* 선수 정보 */}
        <section className="bg-gray-900/70 border border-gray-700 rounded-2xl p-6 space-y-4">
          <h2 className="text-3xl font-bold text-orange-400">선수 정보 <span className="text-orange-300 text-2xl">({totalPlayers}명)</span></h2>
          {totalPlayers === 0 && <p className="text-gray-600 text-center py-4">팀 수 × (팀당 인원 - 1)이 0입니다.</p>}
          {playerForms.map((p, i) => (
            <div key={i} className="bg-gray-800/50 rounded-xl p-4 space-y-4">
              <p className="text-gray-400 text-base font-bold">선수 {i + 1}</p>
              <div className="flex items-start gap-4">
                <PhotoInput value={p.photoPreview} onChange={e => handlePlayerPhoto(i, e)} />
                <div className="flex-1 space-y-3">
                  <input
                    className="w-full px-4 py-3 text-xl bg-gray-800 border border-gray-600 rounded-xl focus:border-blue-400 focus:outline-none"
                    placeholder="닉네임"
                    value={p.name}
                    onChange={e => updatePlayer(i, 'name', e.target.value)}
                  />

                  {/* 영웅 선택 (3개) */}
                  <div>
                    <label className="text-base text-gray-400 mb-2 block font-semibold">주요 영웅 (최대 3개)</label>
                    <HeroPicker
                      heroIds={p.heroIds}
                      onChange={heroIds => updatePlayer(i, 'heroIds', heroIds)}
                    />
                  </div>

                  {/* 티어 (3종) */}
                  <div>
                    <label className="text-base text-gray-400 mb-2 block font-semibold">티어</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { field: 'tierCurrent', label: '이번 시즌' },
                        { field: 'tierPrevious', label: '저번 시즌' },
                        { field: 'tierBest', label: '최고 티어' },
                      ].map(({ field, label }) => (
                        <div key={field}>
                          <p className="text-sm text-gray-500 mb-1">{label}</p>
                          <select
                            value={p[field]}
                            onChange={e => updatePlayer(i, field, e.target.value)}
                            className="w-full px-2 py-2 text-sm bg-gray-800 border border-gray-600 rounded-lg focus:outline-none"
                          >
                            <option value="">선택</option>
                            {TIERS_DETAILED.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 티어 구분 + 포지션 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-base text-gray-400 mb-2 block font-semibold">티어 구분 <span className="text-red-400">*</span></label>
                      <div className="flex gap-2">
                        {[
                          { val: '고티어', active: 'bg-rose-600 border-rose-500 text-white' },
                          { val: '저티어', active: 'bg-sky-600 border-sky-500 text-white' },
                        ].map(({ val, active }) => (
                          <button key={val} type="button"
                            onClick={() => updatePlayer(i, 'tierType', val)}
                            className={`flex-1 py-2 text-sm font-bold rounded-lg border transition-all ${
                              p.tierType === val ? active : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                            }`}>
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-base text-gray-400 mb-2 block font-semibold">포지션 <span className="text-red-400">*</span></label>
                      <div className="flex gap-2">
                        {[
                          { val: '탱커', active: 'bg-yellow-600 border-yellow-500 text-white' },
                          { val: '딜러', active: 'bg-red-600 border-red-500 text-white' },
                          { val: '힐러', active: 'bg-green-600 border-green-500 text-white' },
                        ].map(({ val, active }) => (
                          <button key={val} type="button"
                            onClick={() => updatePlayer(i, 'position', val)}
                            className={`flex-1 py-2 text-sm font-bold rounded-lg border transition-all ${
                              p.position === val ? active : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500'
                            }`}>
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 성향 + 포부 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-base text-gray-400 mb-1 block">플레이 성향</label>
                      <input
                        className="w-full px-3 py-2 text-lg bg-gray-800 border border-gray-600 rounded-xl focus:border-blue-400 focus:outline-none"
                        placeholder="예: 공격적 플레이"
                        value={p.style}
                        onChange={e => updatePlayer(i, 'style', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-base text-gray-400 mb-1 block">대회 포부 한마디</label>
                      <input
                        className="w-full px-3 py-2 text-lg bg-gray-800 border border-gray-600 rounded-xl focus:border-blue-400 focus:outline-none"
                        placeholder="이번 대회에서 꼭 우승하겠습니다!"
                        value={p.comment}
                        onChange={e => updatePlayer(i, 'comment', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* 에러 / 업로드 상태 */}
        {error && <div className="px-5 py-3 bg-red-900/50 border border-red-500 rounded-2xl text-red-300 text-lg text-center">{error}</div>}
        {uploadStatus && <div className="px-5 py-3 bg-blue-900/40 border border-blue-600 rounded-2xl text-blue-300 text-lg text-center">{uploadStatus}</div>}

        {/* 제출 */}
        <button
          onClick={isAdmin ? handleSubmit : undefined}
          disabled={loading || !isAdmin}
          className={`w-full py-5 text-2xl font-bold rounded-2xl transition-all mb-10 ${isAdmin ? 'bg-orange-500 hover:bg-orange-400 hover:scale-105' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}
          style={isAdmin ? { boxShadow: '0 8px 32px rgba(249,115,22,0.3)' } : {}}
        >
          {loading ? '생성 중...' : isAdmin ? '방 생성하기' : '관리자만 저장 가능합니다'}
        </button>
      </div>
    </div>
  );
}
