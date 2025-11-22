'use client';

import { memo, useEffect, useRef } from 'react';

export const HypeVideoBanner = memo(function HypeVideoBanner() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Ensure video plays even if React re-renders cause issues
    if (videoRef.current) {
      videoRef.current.play().catch(err => {
        console.warn('Video autoplay failed:', err);
      });
    }
  }, []);

  return (
    <div className="w-full h-[250px] md:h-[400px] lg:h-[500px] relative overflow-hidden mb-8 bg-black border-b border-neon-green/20 group">
      <video
        ref={videoRef}
        src="/hype.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="w-full h-full object-cover opacity-100 select-none pointer-events-none"
      />
    </div>
  );
});

