import React from 'react';
import { ArrowRight, Play } from 'lucide-react';

interface CTASectionProps {
  onViewDemo: () => void;
  onBrowsePerformers: () => void;
}

const CTASection: React.FC<CTASectionProps> = ({ onViewDemo, onBrowsePerformers }) => {
  return (
    <section className="section-spacing">
      <div className="container mx-auto px-4">
        <div className="relative rounded-3xl overflow-hidden">
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#e6398a]/20 via-[#e6398a]/10 to-[#e6398a]/20" />
          <div className="absolute inset-0 bg-[#1a1a22]/90" />

          <div className="relative px-8 py-16 sm:px-16 sm:py-20 text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-6">
              Ready to modernize your agency?
            </h2>
            <p className="text-lg text-[#b8b8c2] max-w-2xl mx-auto mb-10">
              Join the platform built specifically for entertainment agencies. More bookings, less admin, safer performers.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onViewDemo}
                className="btn-primary flex items-center gap-3 text-lg px-8 py-4"
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
          </div>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
