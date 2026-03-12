import React from 'react';
import { Wine, Sparkles, Megaphone } from 'lucide-react';

interface ServiceCategoriesProps {
  onSelectCategory: (category: string) => void;
}

const categories = [
  {
    icon: Wine,
    title: 'Waitressing',
    description: 'Lingerie, topless, and nude waitressing for private events. Professional and discreet.',
    startingRate: '$110/hr',
    tag: 'Most Popular',
  },
  {
    icon: Sparkles,
    title: 'Strip Shows',
    description: 'Solo and group performances ranging from classic to premium deluxe show packages.',
    startingRate: 'From $380',
    tag: 'Premium',
  },
  {
    icon: Megaphone,
    title: 'Promotional & Hosting',
    description: 'Brand models, atmospheric entertainment, and game hosting for corporate and social events.',
    startingRate: '$90/hr',
    tag: 'Corporate',
  },
];

const ServiceCategories: React.FC<ServiceCategoriesProps> = ({ onSelectCategory }) => {
  return (
    <section className="section-spacing bg-gradient-to-b from-[#0f0f12] to-[#13131a]">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">
            Service categories
          </h2>
          <p className="text-[#b8b8c2] max-w-xl mx-auto">
            Browse performers by the type of service you need for your event.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {categories.map((cat, i) => (
            <button
              key={cat.title}
              onClick={() => onSelectCategory(cat.title)}
              className="card-base text-left group hover:border-[#e6398a]/40 cursor-pointer animate-fade-in"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-[#e6398a]/10 flex items-center justify-center group-hover:bg-[#e6398a]/20 transition-colors">
                  <cat.icon className="h-6 w-6 text-[#e6398a]" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#8888a0] bg-[#13131a] px-2.5 py-1 rounded-full border border-[#2a2a35]">
                  {cat.tag}
                </span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-[#e6398a] transition-colors">
                {cat.title}
              </h3>
              <p className="text-sm text-[#b8b8c2] leading-relaxed mb-4">{cat.description}</p>
              <div className="text-sm font-bold text-[#e6398a]">{cat.startingRate}</div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ServiceCategories;
