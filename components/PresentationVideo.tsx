
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Play, Pause, RefreshCcw, BookDashed, PhoneOff, Sheet, UserX, BarChartHorizontal, ShieldCheck, SearchCheck, FastForward, Database, Triangle, DollarSign, Target } from 'lucide-react';

const scenes = [
  {
    duration: 5,
    title: 'The Problem',
    vo: "Running an entertainment agency is chaos. Manual bookings, constant calls, and performer safety risks drain your time and profits.",
    visuals: () => (
      <div className="flex gap-8 text-red-400 animate-pulse">
        <BookDashed size={64} />
        <PhoneOff size={64} />
        <Sheet size={64} />
        <UserX size={64} />
      </div>
    ),
  },
  {
    duration: 10,
    title: 'The Old Way vs. The New Way',
    vo: "You're stuck managing logistics instead of growing your business. What if you could automate the chaos and focus on what matters?",
    visuals: () => (
      <div className="flex items-center gap-8">
        <div className="text-zinc-500 text-center"><p>Old Way</p><BarChartHorizontal size={80} /></div>
        <FastForward size={40} className="text-orange-500" />
        <div className="text-green-400 text-center"><p>New Way</p><BarChartHorizontal size={80} className="transform -scale-y-100"/></div>
      </div>
    ),
  },
  {
    duration: 15,
    title: 'The Solution: Competitive Advantage',
    vo: "This isn't just a booking site; it's a complete business management system with an unmatched safety system, a robust vetting process, and a VIP workflow that fast-tracks your best customers.",
    visuals: () => (
      <div className="flex gap-8 text-orange-400">
        <div className="flex flex-col items-center gap-2"><ShieldCheck size={64} /><p className="text-sm font-semibold">Automated Safety</p></div>
        <div className="flex flex-col items-center gap-2"><SearchCheck size={64} /><p className="text-sm font-semibold">Robust Vetting</p></div>
        <div className="flex flex-col items-center gap-2"><FastForward size={64} /><p className="text-sm font-semibold">VIP Workflow</p></div>
      </div>
    ),
  },
  {
    duration: 15,
    title: 'The Technology & Cost',
    vo: "Built on a modern, scalable tech stack, our platform is engineered for growth. With a serverless backend, your core technology costs can start at less than a hundred dollars a month.",
    visuals: () => (
      <div className="flex items-center gap-8">
        <div className="flex flex-col items-center gap-2 text-cyan-400"><Database size={64} /><p className="text-sm font-semibold">Supabase</p></div>
        <div className="flex flex-col items-center gap-2 text-white"><Triangle size={64} /><p className="text-sm font-semibold">Vercel</p></div>
        <div className="flex flex-col items-center gap-2 text-green-400"><DollarSign size={64} /><p className="text-sm font-semibold">Low Cost</p></div>
      </div>
    ),
  },
  {
    duration: 10,
    title: 'The Vision',
    vo: "Stop managing, start scaling. Reduce overhead, increase performer safety, and deliver a premium experience that builds client loyalty. This is the turnkey solution your agency has been waiting for.",
    visuals: () => (
      <div className="flex items-center gap-8 text-purple-400">
          <Target size={120} />
      </div>
    ),
  },
  {
    duration: 5,
    title: 'Call to Action',
    vo: 'Ready to transform your agency? Visit our site to schedule a full demo and discuss licensing opportunities.',
    visuals: () => (
      <div className="flex flex-col items-center text-white">
        <div className="flex items-center">
            <span className="font-logo-main text-6xl tracking-wider">FLAV</span>
            <span className="text-6xl mx-[-0.15em] relative" style={{top: "-0.05em"}}>🍑</span>
            <span className="font-logo-main text-6xl tracking-wider">R</span>
        </div>
        <span className="font-logo-sub text-3xl text-zinc-400 -mt-2 ml-1 tracking-wide">entertainers</span>
      </div>
    ),
  },
];

const TOTAL_DURATION = scenes.reduce((sum, s) => sum + s.duration, 0);

const PresentationVideo: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const intervalRef = useRef<number | null>(null);

  const sceneData = useMemo(() => {
    let cumulativeTime = 0;
    const sceneBoundaries = scenes.map(scene => {
      const startTime = cumulativeTime;
      cumulativeTime += scene.duration;
      return { ...scene, startTime, endTime: cumulativeTime };
    });

    const currentElapsedTime = (progress / 100) * TOTAL_DURATION;
    const currentIndex = sceneBoundaries.findIndex(s => currentElapsedTime >= s.startTime && currentElapsedTime < s.endTime);
    
    return {
      currentScene: sceneBoundaries[currentIndex] || sceneBoundaries[0],
      sceneIndex: currentIndex >= 0 ? currentIndex : 0,
    };
  }, [progress]);

  const { currentScene, sceneIndex } = sceneData;

  const startTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + (100 / TOTAL_DURATION) * 0.1;
        if (newProgress >= 100) {
          setIsPlaying(false);
          return 100;
        }
        return newProgress;
      });
    }, 100);
  };

  const stopTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  useEffect(() => {
    if (isPlaying) {
      startTimer();
    } else {
      stopTimer();
    }
    return () => stopTimer();
  }, [isPlaying]);

  const handleRestart = () => {
    setProgress(0);
    setIsPlaying(true);
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-lg z-50 flex flex-col p-4 sm:p-8 animate-fade-in">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-2 rounded-full bg-black/30">
          <X size={24} />
        </button>
      </div>

      <div className="flex-grow flex flex-col items-center justify-center text-center text-white relative overflow-hidden">
        {scenes.map((scene, index) => (
           <div key={index} className={`absolute inset-0 flex flex-col items-center justify-center gap-8 p-4 transition-opacity duration-700 ${index === sceneIndex ? 'opacity-100' : 'opacity-0'}`}>
              <h2 className="text-2xl sm:text-3xl font-bold text-orange-400">{scene.title}</h2>
              <div className="min-h-[128px] flex items-center justify-center">{scene.visuals()}</div>
              <p className="max-w-3xl text-lg sm:text-xl text-zinc-200 leading-relaxed">{scene.vo}</p>
           </div>
        ))}
      </div>

      <div className="flex-shrink-0 mt-8">
        <div className="w-full bg-zinc-700 rounded-full h-2.5">
          <div className="bg-orange-500 h-2.5 rounded-full" style={{ width: `${progress}%`, transition: 'width 0.1s linear' }}></div>
        </div>
        <div className="flex items-center justify-center gap-6 mt-4">
          <button onClick={handleRestart} className="text-zinc-300 hover:text-white transition-colors">
            <RefreshCcw size={28} />
          </button>
          <button onClick={() => setIsPlaying(!isPlaying)} className="text-white p-3 bg-orange-500 hover:bg-orange-600 rounded-full">
            {isPlaying ? <Pause size={32} className="ml-0.5" /> : <Play size={32} className="ml-1" />}
          </button>
          <div className="text-zinc-300 font-mono w-16 text-left">
             {Math.floor((progress / 100) * TOTAL_DURATION).toFixed(0).padStart(2, '0')}:{TOTAL_DURATION}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresentationVideo;
