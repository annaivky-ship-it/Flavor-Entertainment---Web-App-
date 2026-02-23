
import React, { useState, useMemo } from 'react';
import type { Role, Performer, DoNotServeEntry, Communication } from '../types';
import InputField from './InputField';
import { ArrowLeft, User, Mail, Phone, FileText, Send, Search, LoaderCircle } from 'lucide-react';

interface DoNotServeProps {
  role: Role;
  currentPerformer: Performer | undefined;
  doNotServeList: DoNotServeEntry[];
  onBack: () => void;
  onCreateEntry: (entry: Omit<DoNotServeEntry, 'id' | 'created_at' | 'status' | 'performer'>, submitterName: Performer['name']) => Promise<void>;
  addCommunication: (commData: Omit<Communication, 'id' | 'created_at' | 'read'>) => Promise<void>;
}

const DoNotServe: React.FC<DoNotServeProps> = ({ role, currentPerformer, doNotServeList, onBack, onCreateEntry }) => {
    const [form, setForm] = useState({
        client_name: '',
        client_email: '',
        client_phone: '',
        reason: '',
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!form.client_name || !form.reason || (!form.client_email && !form.client_phone)) {
            setError('Please provide a name, a reason, and at least an email or phone number.');
            return;
        }
        
        if (!currentPerformer) {
            setError('Could not identify the submitting performer.');
            return;
        }
        
        setIsSubmitting(true);
        try {
            const newEntry: Omit<DoNotServeEntry, 'id' | 'created_at' | 'status' | 'performer'> = {
                ...form,
                submitted_by_performer_id: currentPerformer.id,
            };
            await onCreateEntry(newEntry, currentPerformer.name);
            setForm({ client_name: '', client_email: '', client_phone: '', reason: '' });
        } catch (err) {
            setError('Failed to submit entry. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredList = useMemo(() => {
        const listToDisplay = role === 'admin' ? doNotServeList : doNotServeList.filter(e => e.status === 'approved');
        
        if (!searchTerm) return listToDisplay;

        return listToDisplay.filter(entry =>
            entry.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.client_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            entry.client_phone.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [doNotServeList, searchTerm, role]);
    
    const statusClasses: Record<DoNotServeEntry['status'], string> = {
      pending: 'bg-yellow-500/20 text-yellow-300',
      approved: 'bg-red-500/20 text-red-300',
      rejected: 'bg-zinc-500/20 text-zinc-400'
    };


    return (
        <div className="animate-fade-in space-y-8">
            <button onClick={onBack} className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors duration-300 flex items-center gap-2">
                <ArrowLeft className="h-5 w-5" />
                Back to Dashboard
            </button>
            
            <div className="text-center">
                 <h1 className="text-3xl sm:text-4xl font-bold text-white">'Do Not Serve' List</h1>
                 <p className="text-zinc-400 mt-2 max-w-2xl mx-auto">A shared resource for performer safety. Submissions are reviewed by an admin before being made public to performers.</p>
            </div>
            
            {role !== 'user' && (
                <div className="card-base !p-6 max-w-3xl mx-auto">
                    <h2 className="text-2xl font-semibold text-white mb-4">Submit a New Entry</h2>
                    {error && <p className="mb-4 text-sm text-red-300 bg-red-900/50 p-3 rounded-md">{error}</p>}
                    <form onSubmit={handleSubmit} className="space-y-4">
                         <InputField icon={<User />} name="client_name" placeholder="Client Full Name" value={form.client_name} onChange={handleChange} required />
                         <InputField icon={<Mail />} name="client_email" type="email" placeholder="Client Email" value={form.client_email} onChange={handleChange} />
                         <InputField icon={<Phone />} name="client_phone" type="tel" placeholder="Client Phone" value={form.client_phone} onChange={handleChange} />
                         <div className="relative">
                            <FileText className="absolute left-4 top-4 h-5 w-5 text-zinc-500" />
                            <textarea
                                name="reason"
                                placeholder="Reason for submission (required)"
                                value={form.reason}
                                onChange={handleChange}
                                required
                                className="input-base input-with-icon h-24 resize-y"
                            />
                        </div>
                        <button type="submit" disabled={isSubmitting} className="btn-primary w-full flex items-center justify-center gap-2">
                            {isSubmitting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5"/>}
                            {isSubmitting ? 'Submitting...' : 'Submit for Review'}
                        </button>
                    </form>
                </div>
            )}
            
            <div className="card-base !p-6">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
                     <h2 className="text-2xl font-semibold text-white">List of Entries</h2>
                     <InputField icon={<Search />} name="search" placeholder="Search by name, email, or phone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                 <div className="space-y-4">
                     {filteredList.length > 0 ? (
                        filteredList.map(entry => (
                           <div key={entry.id} className="bg-zinc-900/70 p-4 rounded-lg border border-zinc-700/50">
                                <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-2">
                                    <div>
                                        <p className="font-bold text-lg text-white">{entry.client_name}</p>
                                        <p className="text-sm text-zinc-400">Email: {entry.client_email || 'N/A'}</p>
                                        <p className="text-sm text-zinc-400">Phone: {entry.client_phone || 'N/A'}</p>
                                    </div>
                                    <div className="flex-shrink-0 flex items-center gap-4">
                                        {role === 'admin' && (
                                            <span className={`capitalize text-xs font-semibold px-3 py-1 rounded-full ${statusClasses[entry.status]}`}>{entry.status}</span>
                                        )}
                                        <div className="text-sm text-zinc-500 text-right">
                                            <p>Submitted by: {entry.performer?.name || 'Admin'}</p>
                                            <p>{new Date(entry.created_at).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                </div>
                                <p className="mt-3 pt-3 border-t border-zinc-800 text-zinc-300 italic">"{entry.reason}"</p>
                           </div>
                        ))
                     ) : (
                        <p className="text-center text-zinc-500 py-8">No entries found.</p>
                     )}
                 </div>
            </div>
        </div>
    );
};

export default DoNotServe;
