import React from 'react';
import { ArrowLeft, Bell } from 'lucide-react';

// Define the shape of the settings object
interface NotificationSettings {
  bookingUpdates: boolean;
  confirmations: boolean;
}

interface UserSettingsProps {
  settings: NotificationSettings;
  onSettingsChange: (newSettings: NotificationSettings) => void;
  onBack: () => void;
}

const Toggle = ({ label, description, enabled, onChange }: { label: string, description: string, enabled: boolean, onChange: (e: boolean) => void}) => (
    <div 
        onClick={() => onChange(!enabled)}
        className="flex justify-between items-center p-4 bg-zinc-800/50 rounded-lg cursor-pointer border border-zinc-700 hover:bg-zinc-700/70 transition-colors"
    >
        <div>
            <p className="font-semibold text-white">{label}</p>
            <p className="text-sm text-zinc-400">{description}</p>
        </div>
        <div className={`w-14 h-8 flex items-center rounded-full p-1 transition-colors ${enabled ? 'bg-orange-500' : 'bg-zinc-600'}`}>
            <div className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`}></div>
        </div>
    </div>
);

const UserSettings: React.FC<UserSettingsProps> = ({ settings, onSettingsChange, onBack }) => {

    const handleToggle = (key: keyof NotificationSettings) => {
        onSettingsChange({
            ...settings,
            [key]: !settings[key]
        });
    };

    return (
        <div className="animate-fade-in max-w-2xl mx-auto">
            <button onClick={onBack} className="mb-8 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors duration-300 flex items-center gap-2">
                <ArrowLeft className="h-5 w-5" />
                Back to Gallery
            </button>
            <div className="card-base !p-8">
                <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3"><Bell /> Notification Settings</h1>
                <p className="text-zinc-400 mb-8">Choose which communications you'd like to receive from us.</p>
                <div className="space-y-4">
                    <Toggle 
                        label="Booking Updates"
                        description="Receive alerts when a performer accepts, or an admin vets your request."
                        enabled={settings.bookingUpdates}
                        onChange={() => handleToggle('bookingUpdates')}
                    />
                    <Toggle
                        label="Booking Confirmations"
                        description="Get the final confirmation once your deposit is verified."
                        enabled={settings.confirmations}
                        onChange={() => handleToggle('confirmations')}
                    />
                </div>
            </div>
        </div>
    );
};

export default UserSettings;
