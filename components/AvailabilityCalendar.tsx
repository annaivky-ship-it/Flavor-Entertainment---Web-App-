import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, AlertCircle } from 'lucide-react';
import type { Booking } from '../types';
import { useAvailability } from '../hooks/useAvailability';

interface AvailabilityCalendarProps {
  performerId: string | number;
  bookings: Booking[];
  onAvailabilityChange?: (blockedDates: string[]) => void;
}

function toLocalISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const AvailabilityCalendar: React.FC<AvailabilityCalendarProps> = ({
  performerId,
  bookings,
  onAvailabilityChange,
}) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [displayDate, setDisplayDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const { blockedDates, toggleDate, blockRange, isLoading, saveAvailability } =
    useAvailability(performerId);

  // Drag selection state — kept in both React state (for re-render) and refs (for stable callbacks)
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const isDragging = useRef(false);
  const dragStartRef = useRef<string | null>(null);
  const dragEndRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onAvailabilityChange?.(blockedDates);
  }, [blockedDates, onAvailabilityChange]);

  const year = displayDate.getFullYear();
  const month = displayDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  // Booking date set for this month (normalise to ISO date string)
  const bookedDateSet = new Set(
    bookings
      .filter((b) => b.status !== 'cancelled' && b.status !== 'rejected')
      .map((b) => b.event_date.split('T')[0])
  );

  // Drag preview range
  const getDragRange = (): Set<string> => {
    if (!dragStart || !dragEnd) return new Set();
    // Anchor to noon to avoid timezone offset issues
    const a = new Date(dragStart + 'T12:00:00');
    const b = new Date(dragEnd + 'T12:00:00');
    const [start, end] = a <= b ? [a, b] : [b, a];
    const set = new Set<string>();
    const cur = new Date(start);
    while (cur <= end) {
      set.add(toLocalISO(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return set;
  };

  const dragRangeSet = getDragRange();

  const handleMouseDown = (dateStr: string, isPast: boolean) => {
    if (isPast) return;
    isDragging.current = true;
    dragStartRef.current = dateStr;
    dragEndRef.current = dateStr;
    setDragStart(dateStr);
    setDragEnd(dateStr);
  };

  const handleMouseEnter = (dateStr: string, isPast: boolean) => {
    if (!isDragging.current || isPast) return;
    dragEndRef.current = dateStr;
    setDragEnd(dateStr);
  };

  // Use refs in the stable callback to avoid stale closure
  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const start = dragStartRef.current;
    const end = dragEndRef.current;
    if (start && end && start !== end) {
      blockRange(start, end);
    } else if (start) {
      toggleDate(start);
    }
    dragStartRef.current = null;
    dragEndRef.current = null;
    setDragStart(null);
    setDragEnd(null);
  }, [blockRange, toggleDate]);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  const prevMonth = () =>
    setDisplayDate(new Date(year, month - 1, 1));
  const nextMonth = () =>
    setDisplayDate(new Date(year, month + 1, 1));

  const todayStr = toLocalISO(today);

  // Summary stats
  const blockedThisMonth = blockedDates.filter((d) => {
    // Use noon anchor for safe comparison
    const date = new Date(d + 'T12:00:00');
    return date.getFullYear() === year && date.getMonth() === month;
  });

  const nextAvailable = (() => {
    const cur = new Date(today);
    for (let i = 0; i < 90; i++) {
      const str = toLocalISO(cur);
      if (!blockedDates.includes(str)) return str;
      cur.setDate(cur.getDate() + 1);
    }
    return null;
  })();

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest mb-1">
            Blocked this month
          </p>
          <p className="text-2xl font-bold text-red-400">{blockedThisMonth.length}</p>
          <p className="text-xs text-zinc-500 mt-0.5">dates unavailable</p>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 uppercase font-bold tracking-widest mb-1">
            Next available
          </p>
          {nextAvailable ? (
            <p className="text-lg font-bold text-green-400">
              {new Date(nextAvailable + 'T12:00:00').toLocaleDateString('en-AU', {
                day: 'numeric',
                month: 'short',
              })}
            </p>
          ) : (
            <p className="text-sm text-zinc-500">None in 90 days</p>
          )}
        </div>
      </div>

      {/* Calendar card */}
      <div className="card-base !p-6 select-none" ref={containerRef}>
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={prevMonth}
            aria-label="Previous month"
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-bold text-white">
            {new Date(year, month).toLocaleDateString('en-AU', {
              month: 'long',
              year: 'numeric',
            })}
          </h3>
          <button
            onClick={nextMonth}
            aria-label="Next month"
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-zinc-500 gap-2">
            <CalendarDays className="w-5 h-5 animate-pulse" />
            <span className="text-sm">Loading availability...</span>
          </div>
        ) : (
          <>
            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-2" role="row">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  role="columnheader"
                  className="text-center text-[11px] font-bold text-zinc-500 uppercase tracking-wider py-1"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Availability calendar">
              {/* Leading empty cells */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} role="gridcell" aria-hidden="true" />
              ))}

              {daysInMonth.map((day) => {
                const dateStr = toLocalISO(day);
                const isPast = day < today;
                const isToday = dateStr === todayStr;
                const isBlocked = blockedDates.includes(dateStr);
                const isBooked = bookedDateSet.has(dateStr);
                const isInDragRange = dragRangeSet.has(dateStr);

                let cellClass =
                  'relative flex flex-col items-center justify-center rounded-lg border transition-all duration-100 h-10 sm:h-12 ';

                if (isPast) {
                  cellClass +=
                    'bg-zinc-950/30 border-zinc-900 text-zinc-700 cursor-not-allowed ';
                } else if (isInDragRange) {
                  cellClass +=
                    'bg-red-900/60 border-red-700 text-red-300 scale-95 cursor-pointer ';
                } else if (isBlocked) {
                  cellClass +=
                    'bg-red-950 border-red-800 text-red-400 hover:bg-red-900/80 cursor-pointer ';
                } else {
                  cellClass +=
                    'bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-600 cursor-pointer ';
                }

                if (isToday && !isPast) {
                  cellClass += 'ring-2 ring-orange-500 ring-offset-1 ring-offset-zinc-900 ';
                }

                return (
                  <div
                    key={dateStr}
                    className={cellClass}
                    onMouseDown={() => handleMouseDown(dateStr, isPast)}
                    onMouseEnter={() => handleMouseEnter(dateStr, isPast)}
                    onKeyDown={(e) => {
                      if (isPast) return;
                      if (e.key === ' ' || e.key === 'Enter') {
                        e.preventDefault();
                        toggleDate(dateStr);
                      }
                    }}
                    role="gridcell"
                    tabIndex={isPast ? -1 : 0}
                    aria-label={`${dateStr}${isBlocked ? ' (blocked)' : ' (available)'}${isBooked ? ', booked event' : ''}`}
                    aria-pressed={isBlocked}
                    aria-disabled={isPast}
                  >
                    <span className="text-xs sm:text-sm font-semibold leading-none">
                      {day.getDate()}
                    </span>
                    {/* Booking dot indicator */}
                    {isBooked && !isPast && (
                      <div className="absolute bottom-1 w-1 h-1 rounded-full bg-orange-500" />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Legend */}
        <div className="mt-6 pt-4 border-t border-zinc-800 flex flex-wrap gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-zinc-900 border border-zinc-700 inline-block" />
            Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-950 border border-red-800 inline-block" />
            Blocked
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-zinc-900 border border-zinc-700 inline-block ring-2 ring-orange-500 ring-offset-1 ring-offset-zinc-900" />
            Today
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-orange-500 inline-block" />
            Booked event
          </span>
        </div>
      </div>

      {/* Instruction hint */}
      <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-900/50 border border-zinc-800 rounded-xl p-3">
        <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
        <p>
          Click or press Space/Enter on a date to toggle it blocked/available. Click and drag
          across multiple dates to block a range at once. Blocked dates are synced instantly.
        </p>
      </div>
    </div>
  );
};

export default AvailabilityCalendar;
