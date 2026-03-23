import React from 'react';
import { LoaderCircle } from 'lucide-react';

const LoadingSpinner: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex items-center justify-center ${className}`}>
    <LoaderCircle className="w-16 h-16 animate-spin text-orange-500" />
  </div>
);

export default LoadingSpinner;
