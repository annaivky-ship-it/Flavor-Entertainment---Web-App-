
import React from 'react';

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon: React.ReactNode;
  label?: string; // Add: Optional label prop
  error?: string;
}

const InputField: React.FC<InputFieldProps> = ({ icon, label, error, className = '', ...props }) => (
    <div className="w-full">
        {/* Add: Render label if provided */}
        {label && <label htmlFor={props.id ?? props.name} className="block text-sm font-medium text-zinc-400 mb-1">{label}</label>}
        <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500">{icon}</div>
            <input 
                {...props} 
                className={`input-base input-with-icon ${error ? '!border-red-500 focus:!border-red-500 focus:!ring-1 focus:!ring-red-500' : ''} ${className}`} 
            />
        </div>
        {error && <p className="mt-1.5 text-xs text-red-400 font-medium pl-1 flex items-center gap-1 animate-fade-in">{error}</p>}
    </div>
);

export default InputField;
