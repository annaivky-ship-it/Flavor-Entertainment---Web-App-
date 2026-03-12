import React from 'react';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

const faqs = [
  {
    question: "How do I book an entertainer?",
    answer: "Browse our gallery of entertainers, select the one you like, and click 'Book Now'. You can also select multiple entertainers to request a group booking. Follow the prompts to provide event details and submit your request."
  },
  {
    question: "What happens after I submit a booking request?",
    answer: "The entertainer will be notified and will either accept or decline your request. Once accepted, our admin team will vet the booking. After vetting, you'll be asked to pay a deposit to secure the booking."
  },
  {
    question: "Is my payment secure?",
    answer: "Yes, we use secure payment simulations for this demo. In a production environment, we would use a PCI-compliant payment processor like Stripe."
  },
  {
    question: "Can I cancel a booking?",
    answer: "Cancellations are subject to our terms of service. Please contact our support team or the entertainer directly through the dashboard if you need to cancel."
  },
  {
    question: "How do I become an entertainer on this platform?",
    answer: "We are always looking for professional talent. Please contact our administration team via the contact form to start the vetting process."
  }
];

const FAQItem: React.FC<{ question: string; answer: string }> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="border-b border-zinc-800 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-6 flex items-center justify-between text-left hover:text-[#e6398a] transition-colors"
      >
        <span className="text-lg font-semibold text-white">{question}</span>
        {isOpen ? <ChevronUp className="text-zinc-500" /> : <ChevronDown className="text-zinc-500" />}
      </button>
      {isOpen && (
        <div className="pb-6 text-zinc-400 leading-relaxed animate-fade-in">
          {answer}
        </div>
      )}
    </div>
  );
};

const FAQ: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="flex items-center gap-4 mb-8">
        <div className="p-3 bg-[#e6398a]/10 rounded-2xl">
          <HelpCircle className="w-8 h-8 text-[#e6398a]" />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-white">Frequently Asked Questions</h1>
          <p className="text-zinc-400 mt-1">Everything you need to know about Flavor Entertainers.</p>
        </div>
      </div>

      <div className="card-base !p-0 overflow-hidden">
        <div className="px-8">
          {faqs.map((faq, index) => (
            <FAQItem key={index} question={faq.question} answer={faq.answer} />
          ))}
        </div>
      </div>

      <div className="mt-12 text-center">
        <p className="text-zinc-500 mb-6">Still have questions?</p>
        <button
          onClick={onBack}
          className="btn-primary"
        >
          Return to Browsing
        </button>
      </div>
    </div>
  );
};

export default FAQ;
