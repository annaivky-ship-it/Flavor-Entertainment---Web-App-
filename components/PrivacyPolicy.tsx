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
          <p className="lead">Last Updated: {new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

          <p className="text-sm italic text-zinc-400">
            This Privacy Policy is currently undergoing legal review. The text below describes our actual data handling
            practices as implemented in our systems. If anything here is unclear, please contact us before submitting
            a booking.
          </p>

          <h3>1. Who we are</h3>
          <p>
            The Private Book ("we", "our", "us") operates a booking platform for adult entertainment services in
            Western Australia. We are the entity responsible for the personal information described below under the
            Australian <em>Privacy Act 1988</em> (Cth) and the Australian Privacy Principles ("APPs"). By using this
            site you confirm you are at least 18 years of age.
          </p>

          <h3>2. What we collect</h3>
          <p>When you make or attempt to make a booking, we collect:</p>
          <ul>
            <li><strong>Contact details:</strong> your full name, email address, and mobile number. Email and phone are stored both in clear form (so we can contact you) and as one-way HMAC-SHA256 hashes (so we can match them against safety registers without storing the plaintext in those registers).</li>
            <li><strong>Date of birth:</strong> we use this only to confirm you are 18 or older; we do not display it back to performers.</li>
            <li><strong>Booking details:</strong> the event date and time, the address you give us, the suburb, the event type, the duration, the number of guests, the services you select, and any note you choose to add. The combination of you and a specific service category is, under the <em>Privacy Act</em>, "sensitive information" about your sexual practices. We treat it accordingly.</li>
            <li><strong>SMS one-time-password verification:</strong> we send a 6-digit code to your mobile when you book. We store a hash of the code (never the code itself) for up to 10 minutes, and a record that the verification succeeded.</li>
            <li><strong>On-device liveness check (premium bookings only):</strong> when required, we collect a 128-dimensional mathematical representation of your face ("embedding") plus a numeric liveness score and an estimated age. <strong>We never receive, transmit, or store an image of your face.</strong> The embedding is held to detect repeat use across different contact details.</li>
            <li><strong>Payment reference:</strong> when you pay your deposit via PayID, the payment processor reports back the sender name and the booking reference you used. We do not see or store your bank account details.</li>
            <li><strong>Technical signals:</strong> IP address, device user-agent, and an anonymous device fingerprint at the point you give consent.</li>
          </ul>
          <p>
            <strong>We do not collect government-issued photo ID from customers.</strong> If you have seen a previous
            version of this policy that said we did, that statement was incorrect and has been retracted.
          </p>

          <h3>3. Why we collect it</h3>
          <ul>
            <li>To create and operate your booking, including notifying the performer and the booking team.</li>
            <li>To verify you are 18 or older, the phone number you supplied is real and reachable, and the deposit came from an account in a matching name.</li>
            <li>To run your details against our safety register (see §5).</li>
            <li>To contact you about your booking, including reminders, changes, and cancellations.</li>
            <li>To comply with our legal obligations in Western Australia and under Commonwealth law.</li>
          </ul>

          <h3>4. Where it goes</h3>
          <p>
            Bookings and customer records are stored in Google Cloud Firestore in the <code>australia-southeast1</code>
            (Sydney) region. Some of the supporting cloud functions currently run in the <code>us-central1</code>
            (Iowa) region; for those functions, your data transits the United States while it is being processed.
            By submitting a booking you consent to this overseas transit for processing purposes (APP 8).
          </p>
          <p>
            We share data with two classes of third parties: (a) <strong>your booked performer</strong>, who receives
            your first name, mobile, event address, and event details only after the booking is confirmed and the
            deposit is paid; and (b) <strong>service providers</strong> we use to deliver the service — Google
            (Firebase), Twilio and ClickSend (SMS), and Monoova (PayID reconciliation). Each of these is bound by
            their own privacy obligations.
          </p>
          <p>We do not sell your information, and we do not use it for any kind of advertising.</p>

          <h3>5. The safety register ("Do Not Serve")</h3>
          <p>
            We maintain an internal safety register of people we will not accept bookings from, on the basis of past
            incident reports made by performers and administrative review. Your hashed contact details are checked
            against this register at the start of every booking attempt. If you are matched, we will tell you that
            we cannot proceed and give you a reference you can quote to contact us for review (see §8). The register
            does not store your name or contact details in clear form; it stores HMAC hashes plus a description of
            the incident and the date.
          </p>

          <h3>6. How long we keep it</h3>
          <ul>
            <li>Booking records (with PII separated into a controlled sub-collection): kept while the booking is active and for up to <strong>7 years</strong> after the event date, consistent with Australian tax-record obligations. Cancelled bookings: <strong>90 days</strong>.</li>
            <li>SMS-OTP records: <strong>10 minutes</strong> from issue, then the code-hash is purged.</li>
            <li>Liveness face embeddings: up to <strong>12 months</strong> from your last booking, then purged.</li>
            <li>Performer identity documents: deleted immediately on admin decision; in any event no longer than 1 hour from upload.</li>
            <li>Audit logs (who did what, when): up to 7 years for incident-related entries; 2 years otherwise.</li>
            <li>Safety register entries: held while the basis for the entry is current; reviewed at least annually.</li>
          </ul>

          <h3>7. Security</h3>
          <p>
            Data is encrypted at rest and in transit. Phone numbers and emails on the safety register and against PII
            indexes are stored as one-way HMAC-SHA256 values with a server-only secret. Face embeddings are stored
            with row-level access denied to all clients. Administrative access to identifiable data is logged in an
            append-only audit collection. If we become aware of a data breach that is likely to result in serious
            harm to you, we will notify you and the Office of the Australian Information Commissioner in line with
            the Notifiable Data Breaches scheme.
          </p>

          <h3>8. Your rights</h3>
          <p>You can ask us to:</p>
          <ul>
            <li>tell you what information we hold about you (APP 12);</li>
            <li>correct information that is inaccurate, out of date, incomplete, or misleading (APP 13);</li>
            <li>delete information we are not required to keep;</li>
            <li>explain why we have declined a booking and, where appropriate, review that decision.</li>
          </ul>
          <p>
            To make any of these requests, contact us at <strong>privacy@theprivatebook.au</strong> and include the
            booking reference (or the support reference) you were given. We aim to respond within 30 days. If you are
            not satisfied with our response, you can complain to the Office of the Australian Information
            Commissioner at <a href="https://www.oaic.gov.au" target="_blank" rel="noopener">oaic.gov.au</a>.
          </p>

          <h3>9. Cookies and similar</h3>
          <p>
            We use only the cookies and local storage necessary to operate the site (session, age-confirmation,
            consent record). We do not use third-party advertising trackers.
          </p>

          <h3>10. Changes to this policy</h3>
          <p>
            We will update this policy from time to time, including after our pending legal review concludes. When we
            do, we will update the "Last Updated" date at the top. For material changes affecting how we use your
            information, we will let you know by email or SMS before the change takes effect.
          </p>

          <h3>11. Contact</h3>
          <p>
            For any privacy-related question, write to <strong>privacy@theprivatebook.au</strong>.
          </p>
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
