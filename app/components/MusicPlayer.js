'use client';
import { useState, useRef, useEffect } from 'react';

export default function MusicPlayer() {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.5;
    audio.loop = true;
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
    }
    setPlaying(!playing);
  };

  return (
    <div className="fixed top-3 right-3 z-50">
      <button
        onClick={toggle}
        className="flex items-center gap-2 px-3 py-2 rounded-full transition-all hover:scale-105 active:scale-95"
        style={{ background: 'rgba(15,15,26,0.85)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}
      >
        <span className={`text-base ${playing ? 'animate-spin-slow text-orange-400' : 'text-gray-500'}`}>
          🎵
        </span>
        <span className="hidden sm:inline text-xs font-bold text-gray-400 max-w-[140px] truncate">
          OWCS War Gamer
        </span>
        <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-black flex-shrink-0 ${
          playing ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-400'
        }`}>
          {playing ? '⏸' : '▶'}
        </span>
      </button>
      <audio ref={audioRef} src="/bgm.mp3" preload="none" />
    </div>
  );
}
