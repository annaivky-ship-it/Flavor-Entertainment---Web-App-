import React, { useMemo } from 'react';
import type { Performer } from '../types';
import { calculateBookingCost, getBookingDurationInfo } from '../utils/bookingUtils';
import { DEPOSIT_PERCENTAGE } from '../constants';
import { DollarSign, Clock } from 'lucide-react';

interface BookingCostCalculatorProps {
  selectedServices: string[];
  durationHours: number | string;
  performers: Performer[];
  className?: string;
}

const BookingCostCalculator: React.FC<BookingCostCalculatorProps> = ({
  selectedServices,
  durationHours,
  performers,
  className = '',
}) => {
  const { totalCost, depositAmount } = useMemo(() => {
    return calculateBookingCost(Number(durationHours), selectedServices, performers.length);
  }, [selectedServices, durationHours, performers]);

    const { formattedTotalDuration } = useMemo(() => {
    return getBookingDurationInfo(durationHours, selectedServices);
  }, [durationHours, selectedServices]);

  return (
    <div className={`card-base !p-6 !bg-zinc-950/50 ${className}`}>
      <h3 className="text-xl font-semibold text-orange-400 flex items-center gap-2">
        <DollarSign /> Cost Estimate
      </h3>
      <div className="mt-4 space-y-2 text-zinc-300">
        <div className="flex justify-between items-center">
          <span>Total Booking Cost:</span>
          <span className="font-bold text-2xl text-white">${totalCost.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span>Deposit Due ({DEPOSIT_PERCENTAGE * 100}%):</span>
          <span className="font-semibold text-xl text-orange-400">${depositAmount.toFixed(2)}</span>
        </div>
      </div>
       {formattedTotalDuration !== 'N/A' && (
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2 mb-2">
            <Clock /> Duration Estimate
          </h3>
          <div className="flex justify-between items-center text-zinc-300">
            <span>Total Event Duration:</span>
            <span className="font-semibold text-lg text-white">{formattedTotalDuration}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingCostCalculator;