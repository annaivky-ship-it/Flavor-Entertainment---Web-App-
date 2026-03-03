import React from 'react';
import { X } from 'lucide-react';

interface TermsOfServiceProps {
  onClose: () => void;
}

const TermsOfService: React.FC<TermsOfServiceProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="card-base !p-0 !bg-zinc-900 max-w-3xl w-full flex flex-col max-h-[90vh] shadow-2xl shadow-black/50">
        <div className="flex-shrink-0 p-6 flex justify-between items-center border-b border-zinc-800">
          <h2 className="text-2xl font-bold text-white">Terms of Service</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="flex-grow p-6 sm:p-8 overflow-y-auto prose prose-invert prose-zinc max-w-none">
          <p className="lead">Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          
          <h3>1. Acceptance of Terms</h3>
          <p>By accessing or using the Flavor Entertainers platform ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of the terms, you may not access the Service. You affirm that you are at least 18 years of age.</p>

          <h3>2. Description of Service</h3>
          <p>Flavor Entertainers acts as a booking agency. We provide a platform for clients ("Clients") to book professional entertainers ("Performers") for events. We are responsible for facilitating the booking, vetting clients, and processing deposits. The performance itself is a contract between the Client and the Performer.</p>
          
          <h3>3. User Obligations</h3>
          <p>As a Client, you agree to:</p>
          <ul>
            <li>Provide accurate, current, and complete information during the booking process, including a valid form of government-issued ID for vetting purposes.</li>
            <li>Treat all Performers with respect and professionalism. Any form of harassment, abuse, or illegal activity is strictly prohibited and will result in an immediate ban and potential legal action.</li>
            <li>Ensure a safe and secure environment for the Performer during the event.</li>
            <li>Adhere to the agreed-upon services and duration. Any negotiation for services outside the original booking agreement is forbidden.</li>
          </ul>

          <h3>4. Booking and Payment</h3>
          <ul>
            <li><strong>Application:</strong> All bookings are considered an application until they pass our internal vetting process.</li>
            <li><strong>Deposit:</strong> A non-refundable deposit is required to confirm a booking. The deposit amount is calculated as a percentage of the total booking cost.</li>
            <li><strong>Final Payment:</strong> The remaining balance is due in cash directly to the Performer upon their arrival at the event, unless otherwise specified.</li>
            <li><strong>Cancellations:</strong> If a Client cancels after the deposit is paid, the deposit is forfeited. If a Performer cancels, we will make every effort to find a suitable replacement or issue a full refund of the deposit.</li>
          </ul>

          <h3>5. Code of Conduct</h3>
          <p>Our platform is built on mutual respect. The Performer has the right to leave the event at any time, without a refund, if they feel unsafe, harassed, or if the Client attempts to solicit illegal or non-agreed-upon services. Such incidents will result in the Client being permanently added to our 'Do Not Serve' list.</p>

          <h3>6. Limitation of Liability</h3>
          <p>Flavor Entertainers is not liable for any incidents, damages, or disputes that may occur during an event between the Client and the Performer. Our liability is limited strictly to the booking process and the deposit amount paid through our platform.</p>

          <h3>7. Governing Law</h3>
          <p>These Terms shall be governed and construed in accordance with the laws of Western Australia, without regard to its conflict of law provisions.</p>
          
          <h3>8. Changes to Terms</h3>
          <p>We reserve the right, at our sole discretion, to modify or replace these Terms at any time. We will provide notice of any significant changes.</p>

          <h3>9. Contact Us</h3>
          <p>If you have any questions about these Terms, please contact us through our official communication channels.</p>
        </div>
        <div className="flex-shrink-0 p-4 bg-zinc-950/50 border-t border-zinc-800 text-right">
            <button onClick={onClose} className="btn-primary px-6 py-2">
                Close
            </button>
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
