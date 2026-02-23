import React from 'react';
import { X } from 'lucide-react';

interface PrivacyPolicyProps {
  onClose: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="card-base !p-0 !bg-zinc-900 max-w-3xl w-full flex flex-col max-h-[90vh] shadow-2xl shadow-black/50">
        <div className="flex-shrink-0 p-6 flex justify-between items-center border-b border-zinc-800">
          <h2 className="text-2xl font-bold text-white">Privacy Policy</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="flex-grow p-6 sm:p-8 overflow-y-auto prose prose-invert prose-zinc max-w-none">
          <p className="lead">Last Updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          
          <h3>1. Introduction</h3>
          <p>Welcome to Flavor Entertainers ("we", "our", "us"). We are committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our booking platform. By using our services, you agree to the collection and use of information in accordance with this policy.</p>

          <h3>2. Information We Collect</h3>
          <p>We may collect personal information from you in a variety of ways, including, but not limited to, when you create a booking, communicate with us, or use our platform. The types of personal information we may collect include:</p>
          <ul>
            <li><strong>Personal Identification Information:</strong> Full name, email address, phone number.</li>
            <li><strong>Booking Details:</strong> Event type, date, time, address, and specific services requested.</li>
            <li><strong>Verification Documents:</strong> For security and compliance, we require a government-issued photo ID. These documents are used solely for vetting purposes and are stored securely.</li>
            <li><strong>Payment Information:</strong> We collect proof of deposit payment (e.g., a receipt screenshot) to confirm bookings. We do not store your bank account or credit card details directly.</li>
          </ul>

          <h3>3. How We Use Your Information</h3>
          <p>We use the information we collect for various purposes, including:</p>
          <ul>
            <li>To process and manage your bookings.</li>
            <li>To perform necessary client vetting for the safety of our performers.</li>
            <li>To communicate with you about your booking, including confirmations and updates.</li>
            <li>To provide customer support.</li>
            <li>To comply with legal and regulatory obligations in Western Australia.</li>
            <li>To maintain our 'Do Not Serve' list to protect our performers from harm.</li>
          </ul>

          <h3>4. Data Security</h3>
          <p>The security of your data is our top priority. We implement a variety of security measures to maintain the safety of your personal information. Our platform is built on a secure infrastructure (Supabase) which employs industry-standard security practices, including data encryption at rest and in transit. Access to sensitive information like ID documents is strictly limited to authorized administrative personnel for vetting purposes.</p>

          <h3>5. Data Retention</h3>
          <p>We will retain your personal information only for as long as is necessary for the purposes set out in this Privacy Policy. We will retain and use your information to the extent necessary to comply with our legal obligations, resolve disputes, and enforce our policies.</p>

          <h3>6. Your Rights</h3>
          <p>You have the right to request access to the personal data we hold about you. You may also request that we correct or delete any information. Please contact us to make such a request.</p>
          
          <h3>7. Third-Party Disclosure</h3>
          <p>We do not sell, trade, or otherwise transfer your personally identifiable information to outside parties. This does not include trusted third parties who assist us in operating our website or servicing you, so long as those parties agree to keep this information confidential. Your contact details and event address will be shared with the booked performer(s) only after a booking is fully confirmed and the deposit is paid.</p>

          <h3>8. Changes to This Privacy Policy</h3>
          <p>We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page. You are advised to review this Privacy Policy periodically for any changes.</p>

          <h3>9. Contact Us</h3>
          <p>If you have any questions about this Privacy Policy, please contact us through our official communication channels.</p>
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

export default PrivacyPolicy;