import React, { useState } from 'react';
import { CheckCircle, ArrowRight, User, Tag } from 'lucide-react';
import type { Performer, ServiceArea } from '../types';
import InputField from './InputField';

interface PerformerOnboardingProps {
  onSubmit: (data: Omit<Performer, 'id'>) => Promise<void>;
  onCancel: () => void;
}

const PerformerOnboarding: React.FC<PerformerOnboardingProps> = ({ onSubmit, onCancel }) => {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    tagline: '',
    bio: '',
    photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
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
      await onSubmit({
        ...formData,
        status: 'pending_verification' as any,
        rating: 5.0,
        review_count: 0,
        created_at: new Date().toISOString()
      });
      setStep(3); // Success step
    } catch (err: any) {
      setError(err.message || 'Failed to submit application');
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

          <div className="flex justify-end gap-4 pt-4">
            <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
            <button 
              type="button" 
              onClick={handleNext}
              disabled={!formData.name || !formData.tagline || !formData.bio}
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
