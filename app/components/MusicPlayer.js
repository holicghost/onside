'use client';
import { useState, useRef, useEffect } from 'react';

export default function MusicPlayer() {
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(50);
  const [muted, setMuted] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [waitingUnmute, setWaitingUnmute] = useState(true);
  const audioRef = useRef(null);
  const hideTimer = useRef(null);
  const unmutedRef = useRef(false);

  // Init: restore volume, autoplay muted
  useEffect(() => {
    const saved = localStorage.getItem('bgm_volume');
    const savedMute = localStorage.getItem('bgm_muted');
    const vol = saved !== null ? Number(saved) : 50;
    setVolume(vol);
    setMuted(savedMute === 'true');

    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = savedMute === 'true' ? 0 : vol / 100;

    // Autoplay muted to get playback started
    audio.muted = true;
    audio.play().then(() => setPlaying(true)).catch(() => {});
  }, []);

  // On ANY user interaction, unmute the audio
  useEffect(() => {
    const unmute = () => {
      if (unmutedRef.current) return;
      unmutedRef.current = true;
      setWaitingUnmute(false);
      const audio = audioRef.current;
      if (!audio) return;
      audio.muted = false;
      const savedMute = localStorage.getItem('bgm_muted');
      const saved = localStorage.getItem('bgm_volume');
      const vol = saved !== null ? Number(saved) : 50;
      audio.volume = savedMute === 'true' ? 0 : vol / 100;
      audio.play().then(() => setPlaying(true)).catch(() => {});
    };
    window.addEventListener('click', unmute, { once: true });
    window.addEventListener('touchstart', unmute, { once: true });
    window.addEventListener('keydown', unmute, { once: true });
    return () => {
      window.removeEventListener('click', unmute);
      window.removeEventListener('touchstart', unmute);
      window.removeEventListener('keydown', unmute);
    };
  }, []);

  // Listen for startBGM / stopBGM custom events
  useEffect(() => {
    const handleStart = () => {
      const audio = audioRef.current;
      if (!audio) return;
      unmutedRef.current = true;
      setWaitingUnmute(false);
      audio.muted = false;
      const saved = localStorage.getItem('bgm_volume');
      const vol = saved !== null ? Number(saved) : 50;
      audio.volume = localStorage.getItem('bgm_muted') === 'true' ? 0 : vol / 100;
      audio.play().then(() => setPlaying(true)).catch(() => {});
    };
    const handleStop = () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      setPlaying(false);
    };
    window.addEventListener('startBGM', handleStart);
    window.addEventListener('stopBGM', handleStop);
    return () => {
      window.removeEventListener('startBGM', handleStart);
      window.removeEventListener('stopBGM', handleStop);
    };
  }, []);

  const applyVolume = (vol, isMuted) => {
    const audio = audioRef.current;
    if (audio) audio.volume = isMuted ? 0 : vol / 100;
  };

  const handleVolumeChange = (e) => {
    const vol = Number(e.target.value);
    setVolume(vol);
    setMuted(false);
    applyVolume(vol, false);
    localStorage.setItem('bgm_volume', String(vol));
    localStorage.setItem('bgm_muted', 'false');
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    applyVolume(volume, next);
    localStorage.setItem('bgm_muted', String(next));
  };

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.muted = false;
      unmutedRef.current = true;
      setWaitingUnmute(false);
      audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  const handleMouseEnter = () => {
    clearTimeout(hideTimer.current);
    setShowVolume(true);
  };
  const handleMouseLeave = () => {
    hideTimer.current = setTimeout(() => setShowVolume(false), 600);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-1"
      onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>

      {/* Unmute hint */}
      {waitingUnmute && (
        <button
          onClick={() => {
            const audio = audioRef.current;
            if (!audio) return;
            unmutedRef.current = true;
            setWaitingUnmute(false);
            audio.muted = false;
            audio.volume = volume / 100;
            audio.play().then(() => setPlaying(true)).catch(() => {});
          }}
          className="px-3 py-1.5 rounded-full text-[11px] font-bold text-gray-400 hover:text-orange-400 transition-all animate-pulse"
          style={{ background: 'rgba(15,15,26,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          🔇 클릭하여 소리 켜기
        </button>
      )}

      {/* Main player pill */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition-all"
        style={{ background: 'rgba(15,15,26,0.9)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}
      >
        <button onClick={toggle} className="flex items-center gap-1.5 hover:scale-105 active:scale-95 transition-transform">
          <span className={`text-sm ${playing ? 'animate-spin-slow text-orange-400' : 'text-gray-500'}`}>🎵</span>
          <span className="hidden sm:inline text-[11px] font-bold text-gray-400 max-w-[100px] truncate">OWCS War Gamer</span>
          <span className={`w-4.5 h-4.5 flex items-center justify-center rounded-full text-[10px] font-black flex-shrink-0 ${
            playing ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-400'
          }`}>
            {playing ? '⏸' : '▶'}
          </span>
        </button>

        <div className="w-px h-3.5 bg-gray-700 mx-0.5" />

        <button onClick={toggleMute} className="text-sm hover:scale-110 active:scale-95 transition-transform flex-shrink-0"
          title={muted ? '음소거 해제' : '음소거'}>
          {muted || volume === 0 ? '🔇' : volume < 40 ? '🔈' : '🔊'}
        </button>

        <span className="text-[10px] font-bold text-gray-500 w-6 text-right tabular-nums flex-shrink-0">
          {muted ? 0 : volume}
        </span>
      </div>

      {/* Volume slider (hover) */}
      {showVolume && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full animate-modal-in"
          style={{ background: 'rgba(15,15,26,0.9)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
          <span className="text-[10px] text-gray-600">0</span>
          <input
            type="range" min="0" max="100" value={muted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-24 h-1 appearance-none bg-gray-700 rounded-full cursor-pointer accent-orange-500"
          />
          <span className="text-[10px] text-gray-600">100</span>
        </div>
      )}

      <audio ref={audioRef} src="/bgm.mp3" autoPlay muted loop playsInline preload="auto" />
    </div>
  );
}
