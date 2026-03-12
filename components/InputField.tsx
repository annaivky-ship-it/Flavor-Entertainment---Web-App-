
import React, { useId } from 'react';

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon: React.ReactNode;
  label?: string;
  error?: string;
}

const InputField: React.FC<InputFieldProps> = ({ icon, label, error, className = '', id, ...props }) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
        <div className="w-full">
            {label && <label htmlFor={inputId} className="block text-sm font-medium text-zinc-400 mb-1">{label}</label>}
            <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-500" aria-hidden="true">{icon}</div>
                <input
                    id={inputId}
                    aria-label={!label ? (props.placeholder || props.name) : undefined}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={errorId}
                    {...props}
                    className={`input-base input-with-icon ${error ? '!border-red-500 focus:!border-red-500 focus:!ring-1 focus:!ring-red-500' : ''} ${className}`}
                />
            </div>
            {error && <p id={errorId} role="alert" className="mt-1.5 text-xs text-red-400 font-medium pl-1 flex items-center gap-1 animate-fade-in">{error}</p>}
        </div>
    );
};

export default InputField;
