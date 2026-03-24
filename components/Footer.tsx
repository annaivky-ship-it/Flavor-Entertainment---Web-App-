import React from 'react';
import { MapPin, Mail, Phone, Instagram, Clock, Shield } from 'lucide-react';

interface FooterProps {
  onShowPrivacyPolicy: () => void;
  onShowTermsOfService: () => void;
  onShowPresentation: () => void;
}

const Footer: React.FC<FooterProps> = ({ onShowPrivacyPolicy, onShowTermsOfService, onShowPresentation }) => {
  return (
    <footer className="mt-16 border-t border-zinc-800 bg-zinc-950/50">
      {/* Main Footer */}
      <div className="container mx-auto px-4 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">

          {/* Brand Column */}
          <div className="sm:col-span-2 lg:col-span-1 space-y-4">
            <div className="flex flex-col items-start">
              <div className="flex items-center">
                <span className="font-logo-main text-2xl tracking-wider text-white">FLAV</span>
                <span className="text-2xl mx-[-0.1em] relative" style={{top: "-0.05em"}}>🍑</span>
                <span className="font-logo-main text-2xl tracking-wider text-white">R</span>
              </div>
              <span className="font-logo-sub text-xs text-zinc-500 -mt-1 tracking-widest">entertainers</span>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-xs">
              Western Australia's premium entertainment booking platform. Professional, secure, and discreet.
            </p>
            <div className="flex gap-3 pt-1">
              <a href="https://www.instagram.com/flavorentertainers" target="_blank" rel="noopener noreferrer" className="bg-zinc-800 hover:bg-orange-500/20 border border-zinc-700 hover:border-orange-500/40 rounded-lg p-2.5 transition-all group">
                <Instagram size={18} className="text-zinc-400 group-hover:text-orange-400 transition-colors" />
              </a>
              <a href="mailto:bookings@flavorentertainers.com.au" className="bg-zinc-800 hover:bg-orange-500/20 border border-zinc-700 hover:border-orange-500/40 rounded-lg p-2.5 transition-all group">
                <Mail size={18} className="text-zinc-400 group-hover:text-orange-400 transition-colors" />
              </a>
              <a href="tel:+61400000000" className="bg-zinc-800 hover:bg-orange-500/20 border border-zinc-700 hover:border-orange-500/40 rounded-lg p-2.5 transition-all group">
                <Phone size={18} className="text-zinc-400 group-hover:text-orange-400 transition-colors" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Quick Links</h4>
            <nav className="flex flex-col gap-2.5">
              <a href="#" onClick={(e) => { e.preventDefault(); onShowPresentation(); }} className="text-sm text-zinc-400 hover:text-orange-400 transition-colors w-fit">How It Works</a>
              <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-sm text-zinc-400 hover:text-orange-400 transition-colors w-fit">Browse Entertainers</a>
              <a href="#faq" className="text-sm text-zinc-400 hover:text-orange-400 transition-colors w-fit">FAQ</a>
            </nav>
          </div>

          {/* Legal */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Legal</h4>
            <nav className="flex flex-col gap-2.5">
              <a href="#" onClick={(e) => { e.preventDefault(); onShowPrivacyPolicy(); }} className="text-sm text-zinc-400 hover:text-orange-400 transition-colors w-fit">Privacy Policy</a>
              <a href="#" onClick={(e) => { e.preventDefault(); onShowTermsOfService(); }} className="text-sm text-zinc-400 hover:text-orange-400 transition-colors w-fit">Terms of Service</a>
            </nav>
            <div className="flex items-center gap-2 pt-2">
              <Shield size={14} className="text-green-500" />
              <span className="text-xs text-zinc-500">Secure & encrypted bookings</span>
            </div>
          </div>

          {/* Service Area */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Service Areas</h4>
            <div className="space-y-2.5">
              {['Perth North', 'Perth South', 'Southwest', 'Northwest'].map(area => (
                <div key={area} className="flex items-center gap-2">
                  <MapPin size={13} className="text-orange-500/70 flex-shrink-0" />
                  <span className="text-sm text-zinc-400">{area}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Clock size={14} className="text-orange-500/70" />
              <span className="text-xs text-zinc-500">Available 7 days, evenings & weekends</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-zinc-800/50">
        <div className="container mx-auto px-4 py-5 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-xs text-zinc-600">&copy; {new Date().getFullYear()} Flavor Entertainers. All Rights Reserved.</p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-700 font-bold">Professional & Discreet Services &mdash; Western Australia</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
