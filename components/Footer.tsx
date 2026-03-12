import React from 'react';
import { MapPin } from 'lucide-react';

interface FooterProps {
  onShowPrivacyPolicy: () => void;
  onShowTermsOfService: () => void;
  onShowPresentation: () => void;
}

const Footer: React.FC<FooterProps> = ({ onShowPrivacyPolicy, onShowTermsOfService, onShowPresentation }) => {
  return (
    <footer className="mt-16 py-12 border-t border-[#2a2a35] bg-[#0f0f12]">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-12">
          <div className="flex flex-col items-center md:items-start space-y-4">
            <div className="flex items-center gap-2 text-[#e6398a] font-bold uppercase tracking-widest text-xs">
              <MapPin size={16} />
              Service Area Coverage
            </div>
            <div className="relative group">
              <div className="absolute -inset-4 bg-[#e6398a]/10 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <svg 
                viewBox="0 0 100 100" 
                className="w-48 h-48 md:w-64 md:h-64 text-[#e6398a]/30 drop-shadow-[0_0_15px_rgba(230,57,138,0.3)] animate-float"
                fill="none" 
                stroke="currentColor" 
                strokeWidth="1.5"
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path 
                  d="M10,8 L25,18 L55,12 L88,22 L92,88 L65,85 L35,95 L18,82 L10,8 Z" 
                  fill="rgba(230, 57, 138, 0.05)"
                  className="transition-colors group-hover:fill-[#e6398a]/10"
                />
                <circle cx="25" cy="35" r="1.5" fill="currentColor" />
                <circle cx="45" cy="25" r="1" fill="currentColor" />
                <circle cx="35" cy="65" r="1.2" fill="currentColor" />
                <circle cx="75" cy="45" r="1" fill="currentColor" />
                <text x="30" y="55" className="text-[6px] fill-[#8888a0] font-bold uppercase tracking-tighter pointer-events-none">Western Australia</text>
              </svg>
            </div>
            <p className="text-[#8888a0] text-sm max-w-xs text-center md:text-left">
              Serving the greater Perth metropolitan area and surrounding Western Australian regions.
            </p>
          </div>

          <div className="flex flex-col items-center md:items-end space-y-6">
            <div className="flex flex-col items-center md:items-end">
              <div className="flex items-center">
                  <span className="font-logo-main text-2xl tracking-wider text-white">FLAV</span>
                  <span className="text-2xl mx-[-0.1em] relative" style={{top: "-0.05em"}}>🍑</span>
                  <span className="font-logo-main text-2xl tracking-wider text-white">R</span>
              </div>
              <span className="font-logo-sub text-xs text-[#8888a0] -mt-1 tracking-widest">entertainers</span>
            </div>

            <div className="flex flex-wrap justify-center md:justify-end gap-6">
                <a href="#" onClick={(e) => { e.preventDefault(); onShowPrivacyPolicy(); }} className="text-sm text-[#b8b8c2] hover:text-white transition-colors border-b border-transparent hover:border-[#e6398a]/50">Privacy Policy</a>
                <a href="#" onClick={(e) => { e.preventDefault(); onShowTermsOfService(); }} className="text-sm text-[#b8b8c2] hover:text-white transition-colors border-b border-transparent hover:border-[#e6398a]/50">Terms of Service</a>
                <a href="#" onClick={(e) => { e.preventDefault(); onShowPresentation(); }} className="text-sm text-[#b8b8c2] hover:text-white transition-colors border-b border-transparent hover:border-[#e6398a]/50">Platform Demo</a>
            </div>

            <div className="flex flex-wrap justify-center md:justify-end gap-6 text-xs text-[#8888a0]">
              <span>Age Restriction: 18+</span>
              <span>ABN: Placeholder</span>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-[#2a2a35] text-center text-[#8888a0]">
          <p className="text-sm">&copy; {new Date().getFullYear()} Flavor Entertainers. All Rights Reserved.</p>
          <p className="text-[10px] uppercase tracking-[0.2em] mt-2 font-bold opacity-50">Professional & Discreet Services</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
