import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Performer } from '../types';
import { allServices } from '../data/mockData';

export interface SearchFilters {
  query: string;
  services: string[];
  availability: 'now' | 'future' | 'both';
  priceRange: [number, number];
  minRating: number;
  sortBy: 'newest' | 'price_asc' | 'price_desc' | 'popular' | 'rating';
}

export const DEFAULT_SEARCH_FILTERS: SearchFilters = {
  query: '',
  services: [],
  availability: 'both',
  priceRange: [0, 1200],
  minRating: 0,
  sortBy: 'newest',
};

const SESSION_KEY = 'flavor_search_filters';

function loadFromSession(): Partial<SearchFilters> {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    return stored ? (JSON.parse(stored) as Partial<SearchFilters>) : {};
  } catch {
    return {};
  }
}

export function getPerformerMinRate(performer: Performer): number {
  const services = allServices.filter((s) => performer.service_ids.includes(s.id));
  if (services.length === 0) return 0;
  return Math.min(...services.map((s) => s.rate));
}

export function useSearch(
  performers: Performer[],
  initialFilters?: Partial<SearchFilters>
) {
  const [filters, setFiltersState] = useState<SearchFilters>(() => ({
    ...DEFAULT_SEARCH_FILTERS,
    ...loadFromSession(),
    ...initialFilters,
  }));

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(filters));
    } catch {
      // sessionStorage may be unavailable
    }
  }, [filters]);

  const setFilters = useCallback((updates: Partial<SearchFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_SEARCH_FILTERS);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }, []);

  const filteredPerformers = useMemo(() => {
    let result = performers.filter((p) => {
      // Text search across name, bio, and service names
      if (filters.query) {
        const q = filters.query.toLowerCase();
        const nameMatch = p.name.toLowerCase().includes(q);
        const bioMatch = p.bio?.toLowerCase().includes(q) ?? false;
        const serviceMatch = p.service_ids.some((id) => {
          const svc = allServices.find((s) => s.id === id);
          return (
            svc &&
            (svc.name.toLowerCase().includes(q) ||
              (svc.description?.toLowerCase().includes(q) ?? false))
          );
        });
        if (!nameMatch && !bioMatch && !serviceMatch) return false;
      }

      // Services multi-select
      if (filters.services.length > 0) {
        const hasService = filters.services.some((svcId) =>
          p.service_ids.includes(svcId)
        );
        if (!hasService) return false;
      }

      // Availability
      if (filters.availability === 'now' && p.status !== 'available') return false;
      if (
        filters.availability === 'future' &&
        (p.status === 'pending_verification' || p.status === 'rejected')
      )
        return false;

      // Price range (based on minimum service rate)
      const minRate = getPerformerMinRate(p);
      if (minRate < filters.priceRange[0] || minRate > filters.priceRange[1]) return false;

      // Rating
      if (p.rating < filters.minRating) return false;

      return true;
    });

    // Sorting
    const sorted = [...result];
    switch (filters.sortBy) {
      case 'price_asc':
        sorted.sort((a, b) => getPerformerMinRate(a) - getPerformerMinRate(b));
        break;
      case 'price_desc':
        sorted.sort((a, b) => getPerformerMinRate(b) - getPerformerMinRate(a));
        break;
      case 'rating':
        sorted.sort((a, b) => b.rating - a.rating);
        break;
      case 'popular':
        sorted.sort((a, b) => b.review_count - a.review_count);
        break;
      case 'newest':
      default:
        sorted.sort((a, b) => {
          const ta = new Date(a.created_at).getTime();
          const tb = new Date(b.created_at).getTime();
          return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
        });
        break;
    }

    return sorted;
  }, [performers, filters]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.query) count++;
    if (filters.services.length > 0) count++;
    if (filters.availability !== 'both') count++;
    if (
      filters.priceRange[0] !== DEFAULT_SEARCH_FILTERS.priceRange[0] ||
      filters.priceRange[1] !== DEFAULT_SEARCH_FILTERS.priceRange[1]
    )
      count++;
    if (filters.minRating > 0) count++;
    if (filters.sortBy !== 'newest') count++;
    return count;
  }, [filters]);

  const isFiltered = activeFilterCount > 0;

  return {
    filteredPerformers,
    filters,
    setFilters,
    resetFilters,
    activeFilterCount,
    isFiltered,
  };
}
