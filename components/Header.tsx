
import React, { useState } from 'react';
import { Search, Menu, X, Users, HelpCircle, LayoutDashboard } from 'lucide-react';
import { isDemoMode } from '../lib/demoMode';

interface HeaderProps {
  children?: React.ReactNode;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onNavigate?: (view: string) => void;
}

const Header: React.FC<HeaderProps> = ({ children, searchQuery, onSearchChange, onNavigate }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleNavigate = (view: string) => {
    onNavigate?.(view);
    setIsMenuOpen(false);
  };

  return (
    <>
      {isDemoMode && (
        <div className="demo-banner py-1.5 text-center">
          <span className="text-xs font-medium text-[#e6398a]">
            Demo Mode — No real transactions or data
          </span>
        </div>
      )}

      <header className="glass sticky top-0 z-50 border-b border-white/5">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-18">
            <a href="/" onClick={(e) => { e.preventDefault(); handleNavigate('home'); }} className="flex items-center gap-2 cursor-pointer no-underline group flex-shrink-0">
              <div className="flex flex-col items-start">
                <div className="flex items-center">
                    <span className="font-logo-main text-xl sm:text-3xl tracking-wider text-white group-hover:text-[#e6398a] transition-colors duration-300">FLAV</span>
                    <span className="text-xl sm:text-3xl mx-[-0.15em] relative transform group-hover:scale-110 transition-transform duration-300" style={{top: "-0.05em"}}>🍑</span>
                    <span className="font-logo-main text-xl sm:text-3xl tracking-wider text-white group-hover:text-[#e6398a] transition-colors duration-300">R</span>
                </div>
                <span className="font-logo-sub text-[10px] sm:text-base text-[#8888a0] -mt-0.5 sm:-mt-1 ml-0.5 sm:ml-1 tracking-wide group-hover:text-[#b8b8c2] transition-colors duration-300">entertainers</span>
              </div>
            </a>

            <nav className="hidden lg:flex items-center gap-8 mx-8">
              <button onClick={() => handleNavigate('home')} className="text-sm font-medium text-[#b8b8c2] hover:text-white transition-colors">Home</button>
              <button onClick={() => handleNavigate('available_now')} className="text-sm font-medium text-[#b8b8c2] hover:text-white transition-colors flex items-center gap-2">
                <Users className="w-4 h-4" /> Browse
              </button>
              <button onClick={() => handleNavigate('admin_dashboard')} className="text-sm font-medium text-[#b8b8c2] hover:text-white transition-colors flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" /> Dashboard
              </button>
              <button onClick={() => handleNavigate('faq')} className="text-sm font-medium text-[#b8b8c2] hover:text-white transition-colors flex items-center gap-2">
                <HelpCircle className="w-4 h-4" /> FAQs
              </button>
            </nav>

            <div className="flex items-center gap-2 sm:gap-4">
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8888a0] pointer-events-none" />
                <input type="text" placeholder="Search performers..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)}
                  className="input-base !w-32 lg:!w-48 !pl-9 !py-1.5 !text-sm !bg-[#13131a] focus:!bg-[#1a1a22] transition-all duration-300 focus:!w-48 lg:focus:!w-64" />
              </div>
              <div className="flex items-center gap-2">
                {children}
                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="lg:hidden p-2 text-[#b8b8c2] hover:text-white hover:bg-[#1a1a22] rounded-lg transition-colors">
                  {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {isMenuOpen && (
          <div className="lg:hidden bg-[#13131a] border-b border-[#2a2a35] animate-slide-in-down">
            <div className="container mx-auto px-4 py-6 space-y-4">
              <div className="relative md:hidden mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8888a0] pointer-events-none" />
                <input type="text" placeholder="Search performers..." value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} className="input-base !pl-9 !py-2" />
              </div>
              <button onClick={() => handleNavigate('home')} className="w-full flex items-center gap-3 p-3 text-[#b8b8c2] hover:text-white hover:bg-[#1a1a22] rounded-xl transition-all">
                <span className="font-medium">Home</span>
              </button>
              <button onClick={() => handleNavigate('available_now')} className="w-full flex items-center gap-3 p-3 text-[#b8b8c2] hover:text-white hover:bg-[#1a1a22] rounded-xl transition-all">
                <Users className="w-5 h-5 text-[#e6398a]" /><span className="font-medium">Browse Performers</span>
              </button>
              <button onClick={() => handleNavigate('admin_dashboard')} className="w-full flex items-center gap-3 p-3 text-[#b8b8c2] hover:text-white hover:bg-[#1a1a22] rounded-xl transition-all">
                <LayoutDashboard className="w-5 h-5 text-[#e6398a]" /><span className="font-medium">Agency Control Center</span>
              </button>
              <button onClick={() => handleNavigate('faq')} className="w-full flex items-center gap-3 p-3 text-[#b8b8c2] hover:text-white hover:bg-[#1a1a22] rounded-xl transition-all">
                <HelpCircle className="w-5 h-5 text-[#e6398a]" /><span className="font-medium">FAQs</span>
              </button>
            </div>
          </div>
        )}
      </header>
    </>
  );
};

export default Header;
