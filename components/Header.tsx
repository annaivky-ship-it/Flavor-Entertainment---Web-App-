
import React, { useState } from 'react';
import { Search, Menu, X, Users, Calendar, HelpCircle } from 'lucide-react';

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
    <header className="bg-black/30 backdrop-blur-lg sticky top-0 z-50 border-b border-zinc-800">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          <a href="/" onClick={(e) => { e.preventDefault(); handleNavigate('available_now'); }} className="flex items-center gap-2 cursor-pointer no-underline group flex-shrink-0">
            <div className="flex flex-col items-start">
              <div className="flex items-center">
                  <span className="font-logo-main text-xl sm:text-3xl tracking-wider text-white group-hover:text-orange-400 transition-colors duration-300">FLAV</span>
                  <span className="text-xl sm:text-3xl mx-[-0.15em] relative transform group-hover:scale-110 transition-transform duration-300" style={{top: "-0.05em"}}>🍑</span>
                  <span className="font-logo-main text-xl sm:text-3xl tracking-wider text-white group-hover:text-orange-400 transition-colors duration-300">R</span>
              </div>
              <span className="font-logo-sub text-[10px] sm:text-base text-zinc-500 -mt-0.5 sm:-mt-1 ml-0.5 sm:ml-1 tracking-wide group-hover:text-zinc-300 transition-colors duration-300">entertainers</span>
            </div>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8 mx-8">
            <button onClick={() => handleNavigate('available_now')} className="text-sm font-medium text-zinc-400 hover:text-white transition-colors flex items-center gap-2">
              <Users className="w-4 h-4" />
              Browse
            </button>
            <button onClick={() => handleNavigate('bookings')} className="text-sm font-medium text-zinc-400 hover:text-white transition-colors flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Bookings
            </button>
            <button onClick={() => handleNavigate('faq')} className="text-sm font-medium text-zinc-400 hover:text-white transition-colors flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              FAQs
            </button>
          </nav>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="input-base !w-32 lg:!w-48 !pl-9 !py-1.5 !text-sm !bg-zinc-800/50 focus:!bg-zinc-800 transition-all duration-300 focus:!w-48 lg:focus:!w-64"
              />
            </div>
            
            <div className="flex items-center gap-2">
              {children}
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="lg:hidden p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="lg:hidden bg-zinc-900 border-b border-zinc-800 animate-slide-in-down">
          <div className="container mx-auto px-4 py-6 space-y-4">
            <div className="relative md:hidden mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search performers..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="input-base !pl-9 !py-2 !bg-zinc-800"
              />
            </div>
            <button 
              onClick={() => handleNavigate('available_now')}
              className="w-full flex items-center gap-3 p-3 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-xl transition-all"
            >
              <Users className="w-5 h-5 text-orange-500" />
              <span className="font-medium">Browse Entertainers</span>
            </button>
            <button 
              onClick={() => handleNavigate('bookings')}
              className="w-full flex items-center gap-3 p-3 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-xl transition-all"
            >
              <Calendar className="w-5 h-5 text-orange-500" />
              <span className="font-medium">Manage Bookings</span>
            </button>
            <button 
              onClick={() => handleNavigate('faq')}
              className="w-full flex items-center gap-3 p-3 text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-xl transition-all"
            >
              <HelpCircle className="w-5 h-5 text-orange-500" />
              <span className="font-medium">View FAQs</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
