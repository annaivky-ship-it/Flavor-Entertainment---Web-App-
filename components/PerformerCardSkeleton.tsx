import React from 'react';

const PerformerCardSkeleton: React.FC = () => (
  <div className="card-base !p-0 overflow-hidden animate-pulse">
    <div className="aspect-[3/4] bg-zinc-800"></div>
    <div className="p-4 space-y-3">
      <div className="h-5 bg-zinc-800 rounded w-3/4"></div>
      <div className="h-3 bg-zinc-800/60 rounded w-full"></div>
      <div className="h-3 bg-zinc-800/60 rounded w-2/3"></div>
      <div className="flex gap-2 mt-4">
        <div className="h-9 bg-zinc-800 rounded-lg flex-1"></div>
        <div className="h-9 bg-zinc-800 rounded-lg flex-1"></div>
      </div>
    </div>
  </div>
);

const PerformerGridSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
    {Array.from({ length: count }).map((_, i) => (
      <PerformerCardSkeleton key={i} />
    ))}
  </div>
);

export default PerformerGridSkeleton;
