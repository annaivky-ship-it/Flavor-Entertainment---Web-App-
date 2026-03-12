import React from 'react';
import { ArrowRight, Play } from 'lucide-react';

interface HeroProps {
  onViewDemo: () => void;
  onBrowsePerformers: () => void;
}

const Hero: React.FC<HeroProps> = ({ onViewDemo, onBrowsePerformers }) => {
  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
      {/* Background gradient effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0f0f12] via-[#0f0f12] to-[#0f0f12]" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#e6398a]/10 rounded-full blur-[128px] animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-[#e6398a]/5 rounded-full blur-[100px]" style={{ animationDelay: '3s' }} />

      <div className="relative z-10 container mx-auto px-4 text-center max-w-4xl">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#e6398a]/10 border border-[#e6398a]/20 text-[#e6398a] text-sm font-medium mb-8 animate-fade-in">
          <span className="h-2 w-2 rounded-full bg-[#e6398a] animate-pulse" />
          Premium Entertainment Management
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-white leading-tight mb-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          Run your entire entertainment agency{' '}
          <span className="gradient-text">from one platform.</span>
        </h1>

        {/* Subheadline */}
        <p className="text-lg sm:text-xl text-[#b8b8c2] max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in" style={{ animationDelay: '0.2s' }}>
          Book performers, verify clients, collect deposits, and manage events automatically.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in" style={{ animationDelay: '0.3s' }}>
          <button
            onClick={onViewDemo}
            className="btn-primary flex items-center gap-3 text-lg px-8 py-4 animate-pulse-glow"
          >
            <Play className="h-5 w-5" />
            View Demo
          </button>
          <button
            onClick={onBrowsePerformers}
            className="btn-secondary flex items-center gap-3 text-lg px-8 py-4"
          >
            Browse Performers
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>

        {/* Social proof */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-8 sm:gap-12 text-sm text-[#8888a0] animate-fade-in" style={{ animationDelay: '0.5s' }}>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-white">200+</span>
            <span>Bookings<br/>Processed</span>
          </div>
          <div className="w-px h-8 bg-[#2a2a35] hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-white">50+</span>
            <span>Active<br/>Performers</span>
          </div>
          <div className="w-px h-8 bg-[#2a2a35] hidden sm:block" />
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-white">100%</span>
            <span>Client<br/>Verification</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
