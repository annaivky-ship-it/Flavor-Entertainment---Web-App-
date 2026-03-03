import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Search,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Star,
  SlidersHorizontal,
} from 'lucide-react';
import type { SearchFilters as SearchFiltersType } from '../hooks/useSearch';
import { DEFAULT_SEARCH_FILTERS } from '../hooks/useSearch';
import { allServices } from '../data/mockData';

interface SearchFiltersProps {
  filters: SearchFiltersType;
  onFiltersChange: (updates: Partial<SearchFiltersType>) => void;
  onReset: () => void;
  activeFilterCount: number;
  totalCount: number;
  filteredCount: number;
}

// Unique service categories
const SERVICE_CATEGORIES = Array.from(
  new Map(allServices.map((s) => [s.category, s.category])).keys()
);

const PRICE_MIN = 0;
const PRICE_MAX = 1200;

// Debounce helper
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Dual-handle range slider with mouse + touch support
interface RangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
}

const RangeSlider: React.FC<RangeSliderProps> = ({ min, max, value, onChange }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<'low' | 'high' | null>(null);
  // Hold references to active listeners so they can be removed if the component unmounts mid-drag
  const activeListeners = useRef<{
    mousemove: ((e: MouseEvent) => void) | null;
    mouseup: (() => void) | null;
    touchmove: ((e: TouchEvent) => void) | null;
    touchend: (() => void) | null;
  }>({ mousemove: null, mouseup: null, touchmove: null, touchend: null });

  useEffect(() => {
    return () => {
      const { mousemove, mouseup, touchmove, touchend } = activeListeners.current;
      if (mousemove) window.removeEventListener('mousemove', mousemove);
      if (mouseup) window.removeEventListener('mouseup', mouseup);
      if (touchmove) window.removeEventListener('touchmove', touchmove);
      if (touchend) window.removeEventListener('touchend', touchend);
    };
  }, []);

  const toPercent = (v: number) => ((v - min) / (max - min)) * 100;

  const fromPercent = (pct: number) =>
    Math.round(((pct / 100) * (max - min) + min) / 10) * 10;

  const getValueFromClientX = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return null;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
      return fromPercent(pct);
    },
    [min, max]
  );

  const applyMove = useCallback(
    (clientX: number) => {
      const v = getValueFromClientX(clientX);
      if (v === null) return;
      if (dragging.current === 'low') {
        onChange([Math.min(v, value[1] - 10), value[1]]);
      } else {
        onChange([value[0], Math.max(v, value[0] + 10)]);
      }
    },
    [getValueFromClientX, onChange, value]
  );

  const startDrag = (handle: 'low' | 'high') => (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    dragging.current = handle;

    const onMouseMove = (ev: MouseEvent) => applyMove(ev.clientX);
    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches[0]) applyMove(ev.touches[0].clientX);
    };
    const onEnd = () => {
      dragging.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onEnd);
      activeListeners.current = { mousemove: null, mouseup: null, touchmove: null, touchend: null };
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    activeListeners.current = { mousemove: onMouseMove, mouseup: onEnd, touchmove: onTouchMove, touchend: onEnd };
  };

  const lowPct = toPercent(value[0]);
  const highPct = toPercent(value[1]);

  return (
    <div className="pt-3 pb-1">
      <div
        ref={trackRef}
        className="relative h-1.5 bg-zinc-700 rounded-full cursor-pointer"
      >
        {/* Active track */}
        <div
          className="absolute h-full bg-orange-500 rounded-full"
          style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
        />
        {/* Low thumb */}
        <button
          onMouseDown={startDrag('low')}
          onTouchStart={startDrag('low')}
          aria-label={`Minimum price $${value[0]}`}
          aria-valuenow={value[0]}
          aria-valuemin={min}
          aria-valuemax={value[1]}
          role="slider"
          style={{ left: `${lowPct}%` }}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-orange-500 border-2 border-orange-300 shadow cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
        />
        {/* High thumb */}
        <button
          onMouseDown={startDrag('high')}
          onTouchStart={startDrag('high')}
          aria-label={`Maximum price $${value[1]}`}
          aria-valuenow={value[1]}
          aria-valuemin={value[0]}
          aria-valuemax={max}
          role="slider"
          style={{ left: `${highPct}%` }}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-orange-500 border-2 border-orange-300 shadow cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
        />
      </div>
      <div className="flex justify-between mt-3 text-xs text-zinc-400">
        <span>${value[0]}</span>
        <span>${value[1]}{value[1] >= PRICE_MAX ? '+' : ''}</span>
      </div>
    </div>
  );
};

const SearchFilters: React.FC<SearchFiltersProps> = ({
  filters,
  onFiltersChange,
  onReset,
  activeFilterCount,
  totalCount,
  filteredCount,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localQuery, setLocalQuery] = useState(filters.query);
  const debouncedQuery = useDebounce(localQuery, 300);
  // Track whether the last query change came from external reset or local typing
  const isExternalReset = useRef(false);

  useEffect(() => {
    // Don't propagate if the change was triggered by an external reset sync
    if (isExternalReset.current) {
      isExternalReset.current = false;
      return;
    }
    onFiltersChange({ query: debouncedQuery });
  }, [debouncedQuery]);

  // Sync external query changes (e.g. reset) back to local state
  useEffect(() => {
    if (filters.query !== localQuery) {
      isExternalReset.current = true;
      setLocalQuery(filters.query);
    }
  }, [filters.query]);

  const toggleService = (serviceId: string) => {
    const current = filters.services;
    const updated = current.includes(serviceId)
      ? current.filter((s) => s !== serviceId)
      : [...current, serviceId];
    onFiltersChange({ services: updated });
  };

  return (
    <div className="mb-8 space-y-4">
      {/* Top row: search + filter toggle + sort + result count */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, bio, or service..."
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            aria-label="Search performers"
            className="input-base !pl-10 w-full"
          />
          {localQuery && (
            <button
              onClick={() => { setLocalQuery(''); onFiltersChange({ query: '' }); }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Sort */}
          <div className="relative">
            <SlidersHorizontal className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
            <select
              value={filters.sortBy}
              onChange={(e) => onFiltersChange({ sortBy: e.target.value as SearchFiltersType['sortBy'] })}
              aria-label="Sort by"
              className="input-base !pl-9 !pr-8 !py-2 appearance-none min-w-[160px]"
            >
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
              <option value="popular">Most Popular</option>
              <option value="rating">Top Rated</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          </div>

          {/* Filter toggle button */}
          <button
            onClick={() => setIsExpanded((p) => !p)}
            aria-expanded={isExpanded}
            aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}`}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
              activeFilterCount > 0
                ? 'bg-orange-500/10 border-orange-500/50 text-orange-400 hover:bg-orange-500/20'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-orange-500 text-white">
                {activeFilterCount}
              </span>
            )}
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Clear all */}
          {activeFilterCount > 0 && (
            <button
              onClick={onReset}
              aria-label="Clear all filters"
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Result count */}
      <p className="text-sm text-zinc-400">
        Showing{' '}
        <span className="text-white font-semibold">{filteredCount}</span> of{' '}
        <span className="text-zinc-300">{totalCount}</span> entertainers
      </p>

      {/* Expanded filter panel */}
      {isExpanded && (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-fade-in">
          {/* Availability */}
          <div>
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
              Availability
            </h4>
            <div className="flex flex-col gap-2">
              {(
                [
                  { value: 'both', label: 'All' },
                  { value: 'now', label: 'Available Now' },
                  { value: 'future', label: 'Future Bookings' },
                ] as const
              ).map(({ value, label }) => (
                <label
                  key={value}
                  className={`flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 border transition-colors text-sm ${
                    filters.availability === value
                      ? 'bg-orange-500/10 border-orange-500/40 text-orange-400'
                      : 'border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="availability"
                    value={value}
                    checked={filters.availability === value}
                    onChange={() => onFiltersChange({ availability: value })}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Price range */}
          <div>
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
              Price Range (from)
            </h4>
            <RangeSlider
              min={PRICE_MIN}
              max={PRICE_MAX}
              value={filters.priceRange}
              onChange={(v) => onFiltersChange({ priceRange: v })}
            />
          </div>

          {/* Rating */}
          <div>
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
              Minimum Rating
            </h4>
            <div className="flex flex-col gap-2">
              {[
                { value: 0, label: 'All ratings' },
                { value: 3, label: '3+ stars' },
                { value: 4, label: '4+ stars' },
                { value: 4.5, label: '4.5+ stars' },
              ].map(({ value, label }) => (
                <label
                  key={value}
                  className={`flex items-center gap-2 cursor-pointer rounded-lg px-3 py-2 border transition-colors text-sm ${
                    filters.minRating === value
                      ? 'bg-orange-500/10 border-orange-500/40 text-orange-400'
                      : 'border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="minRating"
                    value={value}
                    checked={filters.minRating === value}
                    onChange={() => onFiltersChange({ minRating: value })}
                    className="sr-only"
                  />
                  {value > 0 && <Star className="w-3.5 h-3.5 fill-orange-400 text-orange-400" />}
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">
              Services
            </h4>
            <div className="space-y-3">
              {SERVICE_CATEGORIES.map((cat) => (
                <div key={cat}>
                  <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-1.5">
                    {cat}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {allServices
                      .filter((s) => s.category === cat)
                      .map((s) => (
                        <button
                          key={s.id}
                          onClick={() => toggleService(s.id)}
                          aria-pressed={filters.services.includes(s.id)}
                          className={`text-[11px] px-2.5 py-1 rounded-full border font-medium transition-colors ${
                            filters.services.includes(s.id)
                              ? 'bg-orange-500/20 border-orange-500/50 text-orange-400'
                              : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                          }`}
                        >
                          {s.name}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {filteredCount === 0 && (
        <div className="text-center py-16 card-base animate-fade-in">
          <Search className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No entertainers match your filters</h3>
          <p className="text-zinc-400 mb-6">Try adjusting your search criteria.</p>
          <button onClick={onReset} className="btn-primary !px-6">
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
};

export default SearchFilters;
