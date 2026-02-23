import React from 'react';
import { X, AlertTriangle, CheckCircle, LoaderCircle, Clock } from 'lucide-react';
import type { Performer } from '../types';
import { DEPOSIT_PERCENTAGE } from '../constants';

interface BookingConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  bookingDetails: {
    performers: Performer[];
    eventDate: string;
    eventTime: string;

    eventAddress: string;
    selectedServices: string[];
    eventDuration: string;
    totalCost: number;
    depositAmount: number;
  };
}

const BookingConfirmationDialog: React.FC<BookingConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  bookingDetails,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="card-base !p-0 !bg-zinc-900 max-w-2xl w-full flex flex-col max-h-[90vh] shadow-2xl shadow-black/50">
        <div className="flex-shrink-0 p-6 flex justify-between items-center border-b border-zinc-800">
          <h2 className="text-2xl font-bold text-white">Please Confirm Your Booking</h2>
          <button onClick={onClose} disabled={isLoading} className="text-zinc-500 hover:text-white transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-grow p-6 sm:p-8 overflow-y-auto space-y-6">
            <p className="text-zinc-300">Please review the details below before submitting your request. This is your final chance to make changes.</p>

            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-orange-400 border-b border-zinc-700 pb-2">Booking Summary</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div><strong className="text-zinc-400 block">Performer(s):</strong> <span className="text-white">{bookingDetails.performers.map(p => p.name).join(', ')}</span></div>
                    <div><strong className="text-zinc-400 block">Date & Time:</strong> <span className="text-white">{new Date(bookingDetails.eventDate).toLocaleDateString()} at {bookingDetails.eventTime}</span></div>
                    <div className="col-span-full"><strong className="text-zinc-400 block">Address:</strong> <span className="text-white">{bookingDetails.eventAddress}</span></div>
                    <div className="col-span-full"><strong className="text-zinc-400 block">Services:</strong> <span className="text-white">{bookingDetails.selectedServices.join(', ')}</span></div>
                     <div><strong className="text-zinc-400 block">Est. Total Duration:</strong> <span className="text-white">{bookingDetails.eventDuration}</span></div>
                </div>
            </div>

            <div className="space-y-4">
                 <h3 className="text-lg font-semibold text-orange-400 border-b border-zinc-700 pb-2">Cost Summary</h3>
                 <div className="space-y-2 text-zinc-300">
                    <div className="flex justify-between items-center">
                        <span>Total Booking Cost:</span>
                        <span className="font-bold text-2xl text-white">${bookingDetails.totalCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span>Deposit Due ({DEPOSIT_PERCENTAGE * 100}%):</span>
                        <span className="font-semibold text-xl text-orange-400">${bookingDetails.depositAmount.toFixed(2)}</span>
                    </div>
                 </div>
            </div>

            <div className="p-4 bg-yellow-900/30 border border-yellow-500/50 rounded-lg flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 mt-0.5 text-yellow-400 flex-shrink-0" />
                <div>
                    <h4 className="font-bold text-yellow-300">Important</h4>
                    <p className="text-sm text-yellow-200/80">By confirming, you agree that if your application is approved, the deposit is required to secure your booking and is **non-refundable**.</p>
                </div>
            </div>
        </div>

        <div className="flex-shrink-0 p-4 bg-zinc-950/50 border-t border-zinc-800 flex flex-col sm:flex-row justify-end items-center gap-4">
            <button onClick={onClose} disabled={isLoading} className="bg-zinc-700 hover:bg-zinc-600 text-white font-semibold px-6 py-2 rounded-lg transition-colors w-full sm:w-auto">
                Cancel
            </button>
            <button
                onClick={onConfirm}
                disabled={isLoading}
                className="btn-primary w-full sm:w-auto py-2 px-6 text-base flex items-center justify-center gap-3"
            >
                {isLoading ? <LoaderCircle className="h-5 w-5 animate-spin"/> : <CheckCircle className="h-5 w-5" />}
                {isLoading ? 'Submitting...' : 'Confirm & Submit Request'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default BookingConfirmationDialog;