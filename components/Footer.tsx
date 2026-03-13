import React from 'react';
import { MapPin, Mail, Phone, Instagram, Clock } from 'lucide-react';

interface FooterProps {
  onShowPrivacyPolicy: () => void;
  onShowTermsOfService: () => void;
  onShowPresentation: () => void;
}

const Footer: React.FC<FooterProps> = ({ onShowPrivacyPolicy, onShowTermsOfService, onShowPresentation }) => {
  return (
    <footer className="mt-16 border-t border-zinc-800/50 bg-gradient-to-b from-zinc-950 to-black">
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16 mb-14">

          {/* Brand & Map */}
          <div className="flex flex-col items-center md:items-start space-y-5">
            <div className="flex flex-col items-center md:items-start">
              <div className="flex items-center">
                <span className="font-logo-main text-3xl tracking-wider text-white">FLAV</span>
                <span className="text-3xl mx-[-0.1em] relative" style={{top: "-0.05em"}}>🍑</span>
                <span className="font-logo-main text-3xl tracking-wider text-white">R</span>
              </div>
              <span className="font-logo-sub text-sm text-zinc-500 -mt-1 tracking-widest">entertainers</span>
            </div>
            <p className="text-zinc-500 text-sm leading-relaxed max-w-xs text-center md:text-left">
              Premium entertainment services across Western Australia. Professional, discreet, and unforgettable experiences.
            </p>
            <div className="flex items-center gap-2 text-orange-400/80 text-xs font-semibold uppercase tracking-widest">
              <MapPin size={14} />
              Perth &amp; Western Australia
            </div>
            <div className="relative group w-fit">
              <div className="absolute -inset-4 bg-orange-500/10 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <svg
                viewBox="0 0 100 100"
                className="w-36 h-36 text-orange-500/25 drop-shadow-[0_0_15px_rgba(249,115,22,0.2)] animate-float"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path
                  d="M10,8 L25,18 L55,12 L88,22 L92,88 L65,85 L35,95 L18,82 L10,8 Z"
                  fill="rgba(249, 115, 22, 0.05)"
                  className="transition-colors group-hover:fill-orange-500/10"
                />
                <circle cx="25" cy="35" r="1.5" fill="currentColor" />
                <circle cx="45" cy="25" r="1" fill="currentColor" />
                <circle cx="35" cy="65" r="1.2" fill="currentColor" />
                <circle cx="75" cy="45" r="1" fill="currentColor" />
                <text x="30" y="55" className="text-[5px] fill-zinc-600 font-bold uppercase tracking-tighter pointer-events-none">Western Australia</text>
              </svg>
            </div>
          </div>

          {/* Quick Links */}
          <div className="flex flex-col items-center md:items-start space-y-5">
            <h4 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Quick Links</h4>
            <nav className="flex flex-col items-center md:items-start gap-3">
              <a href="#" onClick={(e) => { e.preventDefault(); onShowPrivacyPolicy(); }} className="text-sm text-zinc-500 hover:text-orange-400 transition-colors duration-200">Privacy Policy</a>
              <a href="#" onClick={(e) => { e.preventDefault(); onShowTermsOfService(); }} className="text-sm text-zinc-500 hover:text-orange-400 transition-colors duration-200">Terms of Service</a>
              <a href="#" onClick={(e) => { e.preventDefault(); onShowPresentation(); }} className="text-sm text-zinc-500 hover:text-orange-400 transition-colors duration-200">Platform Demo</a>
            </nav>
          </div>

          {/* Contact & Hours */}
          <div className="flex flex-col items-center md:items-start space-y-5">
            <h4 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Get In Touch</h4>
            <div className="flex flex-col items-center md:items-start gap-4">
              <a href="mailto:hello@flavorentertainers.com" className="flex items-center gap-3 text-sm text-zinc-500 hover:text-orange-400 transition-colors duration-200 group">
                <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 group-hover:border-orange-500/30 transition-colors">
                  <Mail size={14} className="text-orange-500" />
                </div>
                hello@flavorentertainers.com
              </a>
              <a href="tel:+61400000000" className="flex items-center gap-3 text-sm text-zinc-500 hover:text-orange-400 transition-colors duration-200 group">
                <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 group-hover:border-orange-500/30 transition-colors">
                  <Phone size={14} className="text-orange-500" />
                </div>
                0400 000 000
              </a>
              <div className="flex items-center gap-3 text-sm text-zinc-500">
                <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
                  <Clock size={14} className="text-orange-500" />
                </div>
                Mon - Sun, 10am - Late
              </div>
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-zinc-500 hover:text-orange-400 transition-colors duration-200 group">
                <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 group-hover:border-orange-500/30 transition-colors">
                  <Instagram size={14} className="text-orange-500" />
                </div>
                @flavorentertainers
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-zinc-800/50 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-zinc-600">&copy; {new Date().getFullYear()} Flavor Entertainers. All Rights Reserved.</p>
          <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-700 font-bold">Professional &amp; Discreet Services</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;