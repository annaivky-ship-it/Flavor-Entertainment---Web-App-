import React, { useState } from 'react';
import { Camera, CheckCircle, ArrowRight, User, Tag, X } from 'lucide-react';
import type { Performer, ServiceArea } from '../types';
import { api } from '../services/api';
import InputField from './InputField';

interface PerformerOnboardingProps {
  onSubmit: (data: Omit<Performer, 'id'>) => Promise<void>;
  onCancel: () => void;
}

const PerformerOnboarding: React.FC<PerformerOnboardingProps> = ({ onSubmit, onCancel }) => {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    tagline: '',
    bio: '',
    photo_url: '',
    service_ids: [] as string[],
    service_areas: [] as ServiceArea[],
  });

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    
    try {
      let photoUrl = formData.photo_url;
      if (photoFile) {
        photoUrl = await api.uploadPerformerPhoto(photoFile, formData.name);
      }
      await onSubmit({
        ...formData,
        photo_url: photoUrl,
        status: 'offline' as const,
        rating: 5.0,
        review_count: 0,
        created_at: new Date().toISOString()
      });
      setStep(3); // Success step
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Become a Performer</h1>
        <p className="text-zinc-400">Join our exclusive network of entertainers.</p>
      </div>

      {step === 1 && (
        <div className="card-base !p-8 space-y-6 animate-fade-in">
          <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-4">Basic Information</h2>
          
          <InputField
            label="Stage Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Crystal"
            icon={<User className="w-5 h-5 text-zinc-500" />}
            required
          />
          
          <InputField
            label="Tagline"
            value={formData.tagline}
            onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
            placeholder="A short, catchy phrase about you"
            icon={<Tag className="w-5 h-5 text-zinc-500" />}
            required
          />
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-300">Bio</label>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              className="input-base min-h-[120px] resize-y"
              placeholder="Tell clients about yourself, your style, and what makes you unique..."
              required
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-zinc-300">Profile Photo</label>
            {photoPreview ? (
              <div className="relative w-32 h-32">
                <img src={photoPreview} alt="Preview" className="w-32 h-32 rounded-xl object-cover border border-zinc-700" />
                <button
                  type="button"
                  onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-zinc-700 rounded-xl cursor-pointer hover:border-orange-500/50 transition-colors bg-zinc-900/50">
                <Camera className="w-8 h-8 text-zinc-500 mb-2" />
                <span className="text-sm text-zinc-400">Click to upload photo</span>
                <span className="text-xs text-zinc-600 mt-1">JPG, PNG up to 5MB</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        setError('Photo must be under 5MB');
                        return;
                      }
                      setPhotoFile(file);
                      const reader = new FileReader();
                      reader.onloadend = () => setPhotoPreview(reader.result as string);
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </label>
            )}
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
            <button 
              type="button" 
              onClick={handleNext}
              disabled={!formData.name || !formData.tagline || !formData.bio || !photoFile}
              className="btn-primary flex items-center gap-2"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <form onSubmit={handleSubmit} className="card-base !p-8 space-y-6 animate-fade-in">
          <h2 className="text-xl font-semibold text-white border-b border-zinc-800 pb-4">Services & Areas</h2>
          
          <div className="space-y-4">
            <label className="block text-sm font-medium text-zinc-300">Services Offered</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {['Waitressing', 'Strip Show', 'Promotional & Hosting'].map(service => (
                <label key={service} className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.service_ids.includes(service)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, service_ids: [...formData.service_ids, service] });
                      } else {
                        setFormData({ ...formData, service_ids: formData.service_ids.filter(id => id !== service) });
                      }
                    }}
                    className="w-4 h-4 rounded border-zinc-700 text-orange-500 focus:ring-orange-500/20 bg-zinc-800"
                  />
                  <span className="text-zinc-300">{service}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-medium text-zinc-300">Service Areas</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(['Perth North', 'Perth South', 'Southwest', 'Northwest'] as ServiceArea[]).map(area => (
                <label key={area} className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.service_areas.includes(area)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, service_areas: [...formData.service_areas, area] });
                      } else {
                        setFormData({ ...formData, service_areas: formData.service_areas.filter(a => a !== area) });
                      }
                    }}
                    className="w-4 h-4 rounded border-zinc-700 text-orange-500 focus:ring-orange-500/20 bg-zinc-800"
                  />
                  <span className="text-zinc-300">{area}</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-between pt-4">
            <button type="button" onClick={handleBack} className="btn-secondary">Back</button>
            <button 
              type="submit" 
              disabled={isSubmitting || formData.service_ids.length === 0 || formData.service_areas.length === 0}
              className="btn-primary flex items-center gap-2"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Application'}
            </button>
          </div>
        </form>
      )}

      {step === 3 && (
        <div className="card-base !p-12 text-center space-y-6 animate-fade-in">
          <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-white">Application Submitted!</h2>
          <p className="text-zinc-400 max-w-md mx-auto">
            Thank you for applying to join FLAVR. Our admin team will review your application and verify your details shortly. We will contact you once your profile is approved.
          </p>
          <div className="pt-8">
            <button onClick={onCancel} className="btn-primary">Return to Home</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformerOnboarding;
