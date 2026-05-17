# Legal & Regulatory Risk Assessment — The Private Book

**Platform:** theprivatebook.au — adult entertainment booking platform, Western Australia
**Assessment date:** 2026-05-17
**Branch:** `claude/legal-risk-assessment-rfFVI`
**Scope:** Codebase as at commit `8a3e278` (booking lifecycle hardening + PII split)

> **⚠️ This is not legal advice.** This document is an engineering-side risk register, written from a reading of the codebase, public Australian law, and the platform's own representations. It is intended as input to a conversation with a Western Australian solicitor experienced in adult-industry, privacy, and consumer law — not a substitute for one. Several findings below (in particular sections 1, 2, 7, 8) are likely to materially change the platform's operating model and **should be reviewed with counsel before launch or before the next promotional push.**

---

## 0. Executive summary

The platform's engineering posture (server-side booking lifecycle, hashed DNS, no-image liveness, force-deleted ID uploads, PII split, audit logging) is well ahead of the typical small-operator standard. The headline risks are not implementation risks — they are **product-definition risks**:

| # | Risk | Severity | Direction |
|---|------|----------|-----------|
| 1 | Several "Strip Show" SKUs describe **sex acts**, not striptease — potentially engaging WA *Prostitution Act 2000* offences (procurement / managing). | **Critical** | Product / legal |
| 2 | Online age gate is client-side `localStorage` only; sexually explicit copy is reachable before any age assurance, against *Online Safety Act 2021* (Cth) industry-code expectations. | **High** | Engineering + product |
| 3 | Privacy Policy in repo states the platform collects government photo ID; the platform does not. This is a misleading representation under both *Privacy Act 1988* (APP 1/5) and *Australian Consumer Law* s18. | **High** | Documents |
| 4 | Do-Not-Serve list has no documented basis, notice, review, or appeal process. Defamation, anti-discrimination, and APP 12/13 exposure. | **High** | Process + product |
| 5 | Performer model ("booking agency", contractor) sits inside a structure (platform sets prices, controls bookings, runs marketing, collects deposits) that has WA *Industrial Relations Act* and federal *Fair Work Act* sham-contracting / employee-classification risk; WHS Act 2020 (WA) PCBU duty likely applies regardless. | **High** | Commercial + legal |
| 6 | PayID flow where the platform receives the deposit then settles to performers is plausibly a *designated service* under the AML/CTF Act 2006 (remittance). No AUSTRAC posture in code. | **Medium-High** | Commercial + legal |
| 7 | "Non-refundable" 25% deposit language is partially unenforceable under ACL consumer guarantees / unfair-contract-terms regime. | **Medium** | Documents |
| 8 | Face embeddings and the DNS register store **sensitive information** (biometric, plus information about sexual practices via booked services) — Privacy Act notification, breach, retention, and security obligations are heightened. | **Medium** | Engineering + policy |
| 9 | Spam Act 2003 (Cth): SMS/WhatsApp templates include "Reply STOP" but no separate marketing-consent capture or sender-identification line; transactional/marketing line is blurred. | **Medium** | Engineering |
| 10 | No GST handling in pricing or invoices; if turnover exceeds $75k, the platform is required to register. | **Medium** | Commercial |

The 30-day remediation plan in §11 prioritises items that block launch and items that, while not blocking, will be expensive to retrofit once volume scales.

---

## 1. Adult-entertainment vs sex-work classification (CRITICAL)

### Finding

`data/mockData.ts:10–29` defines a "Strip Show" catalogue that, on its face, describes sex acts rather than striptease:

| SKU | Verbatim description |
|-----|------|
| `show-fisting-squirting` | "Extreme adult show including fisting and squirting." `booking_notes: 'Adults-only, explicit content'` |
| `show-works-greek` | "Deluxe show plus full \"Greek\" toy play." `booking_notes: 'Adults-only, includes anal toy'` |
| `show-deluxe-works` | "Full strip with squirting, toys, and body play." |
| `show-toy` | "Full nude strip with toy performance." |
| `show-absolute-works` | "Everything: toys, cream, pearls, squirt, Greek. Ultimate show." |

The "Greek" / fisting / penetrative-toy descriptors are well outside what is conventionally understood as exotic dancing, even at the most permissive end. They describe acts that, when performed for reward in the presence of a paying client, are likely to engage the definition of *prostitution* under the *Prostitution Act 2000* (WA) — which (broadly) covers sexual gratification provided for payment, irrespective of whether penetration occurs between performer and client.

### Why this matters

WA still criminalises a number of *facilitation* behaviours around sex work even though sex work itself is largely de-facto tolerated, including:

- **Causing or permitting** premises to be used for prostitution
- **Procuring** a person to act as a sex worker
- **Receiving payment** for prostitution (third-party benefit)
- **Advertising** prostitution services in restricted ways

A booking platform that takes deposits for SKUs describing penetrative sex acts plausibly **procures**, **advertises** and **receives money** in connection with prostitution. Risk lands on (i) the company, (ii) the directors personally (accessorial liability), and (iii) the performers.

The WA *Sex Work Decriminalisation Bill* has been on the reform agenda but as at the assessment date should not be assumed in force; counsel should confirm current law.

There is also a parallel **Criminal Code (WA)** s320–322 risk if anything in the supply chain involves minors, and a *Commonwealth Criminal Code* Division 270/271 modern-slavery/trafficking exposure if performers are non-citizens or migrated specifically to perform.

### Engineering signal

The repository's own UI copy already flags awareness: `booking_notes` for those SKUs says *"Adults-only, explicit content"*. The footer (`Footer.tsx:87`) describes services as *"Professional & Discreet"*. Terms (`TermsOfService.tsx:25`) describe the company as a *"booking agency"* — that disclaimer alone does not shift criminal liability if the underlying conduct is procurement.

### Recommendation

Before any further launch activity:

1. **Lawyer review of every SKU** in `data/mockData.ts`. Likely outcomes: remove the fisting/Greek/penetrative-toy SKUs entirely, rewrite the wet-show descriptions to be unambiguously self-performance with no client interaction, and add a hard contract term that the performer never has physical contact of a sexual nature with clients.
2. **Add a code-level constraint** that the booking notes for every Strip Show SKU contain an explicit "self-performance only, no client contact" clause that is also surfaced in the booking confirmation the customer must tick.
3. **Independent contractor agreement** with performers must repeat the prohibition and grant the performer an unconditional right to terminate the event without refund (already present at `TermsOfService.tsx:45`, but needs to be in the performer-side contract).

---

## 2. Age assurance (HIGH)

### Finding

- `components/AgeGate.tsx:41–76` — entirely client-side. DOB → age computed in the browser. State persisted as `localStorage.ageVerified='true'` (`App.tsx:77`). No server signal.
- Sexually explicit service copy (`mockData.ts:16–24`) is bundled in the production bundle and is reachable behind a `localStorage` flag that any visitor can set.
- Customer SMS OTP (`functions/src/verification/customer.ts`) verifies a phone number — it does **not** verify age. The "trusted" tier (5+ bookings in 12 months) skips OTP entirely (verification/customer.ts:382).
- Performer-side age uses a face-api.js `ageEstimate ≥ 18` (`verification/performer.ts:210`). Face-api.js age estimation has a known error band of roughly ±4–5 years; alone it is unlikely to satisfy a regulator's expectation of *reasonable steps* to confirm a performer is over 18.

### Why this matters

- **Online Safety Act 2021 (Cth)** — eSafety Commissioner's Phase 2 industry codes (Class 1C / Class 2) require *effective age assurance* for restricted online content. A `localStorage` cookie does not meet "reasonable steps".
- **Classification (Publications, Films and Computer Games) Act 1995 (Cth)** — sexually explicit text is classifiable; X18+ material requires a Restricted Access System.
- **Criminal Code (WA) s204A** (using a computer service to procure or expose a child) — strict liability around access by minors.
- For the **performer**, if a person under 18 ever performs even once, the platform is exposed to s320–321 (Criminal Code WA) and to *Commonwealth Criminal Code* child-abuse material offences if any image is captured.

### Recommendation

1. **Server-side age assertion**: gate the booking callable on a verified DOB attestation captured during SMS-OTP step, store as a hashed/encrypted attribute on the customer record, and refuse the booking server-side if `dob` indicates under 18. Do not rely on `localStorage`.
2. **Defer explicit copy** until *after* a server-side age signal. Currently the service catalogue ships in the public bundle; consider splitting the catalogue into a public "categories only" list and a callable-fetched "details" list that requires a verified age token.
3. **Performer age**: face-api.js `ageEstimate` is acceptable as a *first* signal but should not be the *only* one. Replace the manual-ID-then-delete flow with an **ID match step** (admin sights ID, records the date-of-birth into the performer record, then deletes the image). The current flow deletes the image but the audit log does not appear to record the DOB observed.
4. **18+ gate copy** should reference *Online Safety Act* and clarify the user's representation.

---

## 3. Privacy & sensitive information (HIGH)

### Findings

- **Contradiction**: `components/PrivacyPolicy.tsx:29` states *"For security and compliance, we require a government-issued photo ID"*. The CLAUDE.md and codebase say the platform collects **no** government ID from customers (CLAUDE.md:15). This is a representation made on the public site that is not true of the actual processing.
- **Sensitive information**:
  - Face embeddings (`verification/customer.ts:297–308`, performer equivalent) are **biometric information** — sensitive under APP 3.3.
  - Booking documents link an identifiable customer (UID, phone hash) to specific service SKUs that describe sexual practices. Under the Privacy Act, *information about a person's sexual orientation or practices* is sensitive information, requiring **affirmative consent** for collection and use.
  - Performer banking details are stored in the `performers.banking` sub-document; admin-read-only is asserted by comment but should be enforced by Firestore rules (rules file not located in repo at time of survey).
- **No documented retention policy.** `PrivacyPolicy.tsx:48` says *"as long as necessary"* — APP 11.2 requires destruction or de-identification once the personal information is no longer needed. Booking PII is split to `/bookingPII` (per `functions/src/booking/pii.ts`) but there is no TTL.
- **DNS register** (`functions/src/dns/index.ts`): stores HMAC-SHA256 hashes. Hashing alone does **not** remove personal information status — APP applies to information that is *reasonably identifiable*, which a hash you can re-derive on every login attempt arguably is.
- **NDB scheme**: no breach-notification process is referenced in policy or runbook.
- **Cross-border**: Firestore is `australia-southeast1` (good), Cloud Functions are `us-central1` (CLAUDE.md:5). Customer PII may transit US-region functions — APP 8 disclosure obligation applies and should be reflected in policy.

### Recommendations

1. **Rewrite Privacy Policy** to match actual collection. Explicitly enumerate: phone (+ hash), email (+ hash), DOB, event location, service SKUs (and flag this as sensitive information collection), face embedding (biometric, sensitive), payment reference, device fingerprint. State retention periods.
2. **Add APP-5 collection notice** at point of capture (booking step 1) — what is collected, why, who it goes to, where it's stored (incl. Firestore au-southeast1, Functions us-central1), how to access/correct, and the breach-notification process.
3. **Implement a retention policy in code**:
   - Booking PII purged 7 years after event date (consistent with tax law) or 90 days after a cancellation, whichever is earlier; the **non-PII** booking record can persist.
   - Face embeddings purged 12 months after last booking.
   - DNS entries reviewed annually with documented basis.
4. **Move Functions to `australia-southeast1`** where feasible (the deployment-checklist Phase 2 already plans this — accelerate).
5. **Publish a data-breach response runbook** (`docs/breach-response.md`) — internal notification chain, OAIC reporting threshold, customer notice template.
6. **Firestore security rules in the repo** — they are not in the survey output. If they only live in the Firebase console, treat as a P0 hardening item.

---

## 4. Do-Not-Serve list (HIGH)

### Findings

- `verification/performer.ts:419–497` lets any authenticated performer flag a customer; this writes two DNS entries (email + phone) with severity `'silent'` (line 446).
- `functions/src/incidents/reporting.ts:57–103` auto-adds to DNS when a report is *approved*. Approval is a status transition; the survey notes no documented criteria, no second reviewer, no notice to the customer, no appeal.
- DNS check fails silently (`dns/index.ts:135–137`) — the customer receives "We can't proceed" with no reason and no recourse.
- Flag reasons enumerated include `"intoxicated_aggressive"`, `"breached_no_touch"`, `"safety_concern"`. These are inherently defamatory if false.

### Why this matters

- **Defamation**: a written allegation that an identifiable person is "intoxicated aggressive" — even held only internally — is publishable to anyone who later reads the record (admins, other performers, in discovery). The Uniform Defamation Acts (and WA's *Defamation Act 2005*) apply. The 2021/2024 reforms add a serious-harm threshold but the platform should not rely on it.
- **Anti-discrimination**: the *Equal Opportunity Act 1984* (WA) and *Sex Discrimination Act 1984* (Cth) prohibit refusal of goods/services on protected grounds. A silent-block with no review is impossible to audit for discriminatory pattern. Particularly acute if the DNS list is dominated by reports from a small number of performers.
- **APP 12 & 13** (access and correction): a person on a DNS list is entitled, on request, to know what information is held about them and to request correction. The current architecture (HMAC hash, no plaintext stored) makes lawful access **impossible to fulfil** — which is itself a compliance issue.
- **Australian Consumer Law** s18 (misleading conduct) and s29(1)(m) (false representations re: rights/remedies) if the silent block is dressed up as a generic system error.

### Recommendations

1. **Two-tier DNS**:
   - **Auto-block** only for hard signals (chargeback, criminal report referenced, performer no-show due to safety with police involvement).
   - **Review-tier** for soft signals; must be reviewed by an admin who is not the reporter, within a defined SLA, with the customer notified ("your account has been suspended pending review; contact us within 14 days") and a documented right to respond.
2. **Retention of plaintext** (encrypted at rest, with strict access control) for the *added-by*, *added-at*, *reason*, and *customer contact* fields — otherwise APP 12/13 can't be honoured and there's no defence to defamation discovery.
3. **Quarterly bias review** of DNS additions — aggregate by added-by performer, demographic markers from booking history, refusal reason. Document in `docs/safety-briefing.md` or alongside.
4. **Notice copy**: silent rejection is bad practice. Replace with "We can't proceed with this booking. If you believe this is in error, contact [email] — quote reference [opaque ID]." This both reduces APP/ACL exposure and improves the customer experience without exposing register contents.
5. **Written DNS policy** documenting grounds for addition, evidence standard, review cadence, appeal route, deletion cadence.

---

## 5. Performer classification & workplace safety (HIGH)

### Findings

- `TermsOfService.tsx:25`: *"The Private Book acts as a booking agency"* and *"The performance itself is a contract between the Client and the Performer."*
- Platform nevertheless: sets the price (`mockData.ts`), markets the performer (`EntertainerProfile.tsx`), takes the deposit (`PayIDSimulationModal.tsx`), holds funds before paying out (banking details collected at performer onboarding), and gates which customers a performer can serve (DNS + risk score).
- No performer-side contract is in the repo (only customer-facing ToS).

### Why this matters

- **Sham contracting** — *Fair Work Act 2009* s357 prohibits representing an employment relationship as an independent-contracting one. Post-*Jamsek* (2022) and *Personnel Contracting* (2022), the High Court emphasises the **contract terms** over multifactor reality where the contract is comprehensive. So a robust performer contract is now more protective than it was — but no contract = exposure to the older multifactor test, which here would weigh heavily towards employment.
- **WHS Act 2020 (WA)** — the platform is a *PCBU* and owes safety duties to any *worker* (including contractors and sub-contractors), specifically: safe work environment, control of risks, consultation, incident reporting. A booking that sends a lone performer to a private residence with intoxicated guests is inherently a high-risk task; the PCBU duty cannot be contracted out.
- **Workers' compensation** — *Workers Compensation and Injury Management Act 2023* (WA). Whether the platform must hold a WorkCover policy depends on classification. Conservative answer is yes for at-call performers.
- **Superannuation** — even where a person is genuinely an independent contractor, SG can be payable if they work *wholly or principally for labour* under a contract — *Superannuation Guarantee (Administration) Act 1992* s12(3).
- **PAYG withholding** and *voluntary agreements* — ATO compliance.

### Recommendations

1. **Performer agreement** drafted by counsel, executed at the `awaiting_contract` step that already exists in the flow (`verification/performer.ts:4–8`). Should cover: contractor status, payment terms, cancellation, performer's right to refuse/leave, safety duties **both ways**, IP in profile/photos, DNS-related obligations, dispute process.
2. **Document the safety system** the platform provides (the existing `docs/safety-briefing.md` is a start). At minimum: check-in/check-out workflow, panic-button or SMS check-in mid-event, post-event welfare check, incident reporting flow, escalation to police. This is a WHS Act control.
3. **Get advice on SG / WorkCover**. Provisional posture: WorkCover policy for the worst-case classification, voluntary super agreement if contractors prefer.
4. **Marketing language audit** — ensure nothing on the public site implies the performer is an employee ("our performers", "we deliver").

---

## 6. Payments, AML/CTF, and consumer law (MEDIUM–HIGH)

### Findings

- PayID deposit flow: client transfers to platform's PayID; Monoova webhook reconciles. Platform then settles the balance (or the full amount?) to the performer.
- `constants.ts:3`: deposit is 25%, described as non-refundable.
- `TermsOfService.tsx:39, 45`: deposit non-refundable; performer-cancelled bookings get "every effort to find a replacement or issue a full refund" (i.e., discretionary).
- No GST is visible in pricing or invoice flow.
- `PAYMENT_MODE = 'manual'` or `'monoova'` (constants.ts:64–68).

### Why this matters

- **AML/CTF Act 2006** — if the platform receives funds from a client and remits them to a third party (the performer), that is squarely within "designated services" item 31 (remittance). Even if the platform claims the funds belong to the performer in transit, the legal characterisation may differ. AUSTRAC registration, KYC on performers, threshold reporting, and a written AML/CTF programme would apply.
  - **Alternative architecture**: client pays the performer's PayID *directly*, platform never receives funds, platform invoices the performer for a booking fee. This is the cleanest escape and is closer to what the "booking agency" framing implies.
- **Australian Consumer Law** (Sch 2 Competition and Consumer Act 2010):
  - "Non-refundable" is enforceable only to the extent of a *genuine pre-estimate of loss*. 25% on a flat-rate $1,000 SKU is $250 — defensible as marketing/onboarding cost; on a $110/hr 1-hour SKU it is $27.50 — also defensible. Acceptable provided documented.
  - Consumer guarantee — service must be performed with due care and skill. If the platform represents that performers are vetted, a failure that injures the consumer is *the platform's* failure to deliver the service with due care.
  - **Unfair contract terms** (s23 ACL, extended to small business consumer contracts in 2022): one-sided cancellation rights, the discretionary refund clause, and the silent-DNS block all qualify as potential unfair terms. Civil penalties up to $50m per breach since the 2022 amendment.
- **GST** — turnover ≥ $75k requires registration. Adult services are GST-taxable (no exemption). Prices on the site do not specify GST-inclusive or exclusive.

### Recommendations

1. **Counsel decision on AML/CTF posture**. Strongly consider re-architecting payments so the platform never receives client funds (PayID direct to performer, platform invoices performer fee). This is also cheaper than building an AUSTRAC programme.
2. **Rewrite deposit clause** to reference a genuine pre-estimate of loss, and add an explicit ACL-compliant *consumer guarantee carve-out* ("nothing in this clause limits your rights under the ACL").
3. **GST**: state on the site whether prices are GST-inclusive; if turnover is approaching $75k, register and add tax-invoice generation.
4. **Refund SLA**: replace the *"every effort … or full refund"* clause with a hard rule (e.g., performer cancellation = full refund within 5 business days), recorded in code.

---

## 7. Spam Act, electronic marketing & consent (MEDIUM)

### Findings

- `functions/src/messaging/templates.ts:16`: every transactional SMS ends with *"Reply STOP to opt out."*
- `consent/index.ts:10–48` records a single bundled consent for verification + booking + DNS check.
- No separate marketing-consent capture; no list segregation in the messaging dispatcher (`functions/src/messaging/send.ts`).
- No sender ID line ("The Private Book") visible in transactional templates surveyed.

### Why this matters

- **Spam Act 2003 (Cth)** requires, for *commercial electronic messages*: (1) recipient consent, (2) sender identification, (3) functional unsubscribe. Transactional messages (verification codes, booking confirmations) are not commercial; promotional messages are. The current architecture cannot prove which is which because they share a pipeline and a consent record.
- **Privacy Act APP 7** governs use of personal information for direct marketing.

### Recommendations

1. **Split consent**: booking/verification consent is mandatory and bundled with the booking; marketing consent is a separate, opt-in checkbox, default off, captured as a distinct record in `/consents`.
2. **Tag every outgoing message** in code as `messageClass: 'transactional' | 'marketing'` and refuse to send marketing-class without a positive marketing-consent record.
3. **Sender ID line** on every message: e.g., "The Private Book — bookings@theprivatebook.au". Required under Spam Act even for transactional.
4. **Re-confirm consent annually** for marketing recipients (good practice; not strictly required).

---

## 8. Misleading / deceptive conduct (MEDIUM)

### Findings

- Privacy Policy contradiction (§3) is a per-se misrepresentation.
- `components/FAQ.tsx:14–15` answers "Is my payment secure?" with *"Yes, we use secure payment simulations for this demo"* — production copy includes the word *"demo"*. This is both confusing and arguably misleading about what the customer's deposit is actually doing.
- Footer copy *"Professional & Discreet"* combined with the explicit Strip Show SKUs sets a representation about professionalism / safety that the platform must be able to substantiate.

### Recommendations

1. Sweep all production copy for words like "demo", "simulation", "test" before launch.
2. Substantiation file: keep a one-page document for every marketing claim (vetting, discretion, safety) listing the underlying control. ACCC expects this.

---

## 9. Audit, security, and other engineering items (MEDIUM)

### Findings

- Audit-log writes exist (`functions/src/utils/shared.ts` referenced) but no retention or access-control policy is documented; audit logs themselves contain PII (actor IDs, phone hashes, action context).
- Firestore security rules not located in repo at time of survey.
- `HASH_SECRET` / `DNS_HASH_PEPPER` (CLAUDE.md:139–140) — single shared pepper. If leaked, the DNS list and PII hashes become enumerable. No documented rotation procedure in `secrets-rotation.md` for the DNS-specific values (per file listing — recommend verifying).
- Anonymous Firebase Auth used for all visitors (`App.tsx:233–238`) — means **booking** records and **DNS** lookups are gated on a UID that anyone can mint trivially. Rate-limiting and abuse-protection should not depend on it.

### Recommendations

1. **Move security rules into the repo** under `firestore.rules` and gate deploys on CI lint.
2. **Pepper rotation runbook** — when rotated, DNS hashes must be re-keyed; document the migration.
3. **Audit log retention** — 7 years for incident-related entries, 2 years otherwise. Move to a separate collection or BigQuery export and lock down with IAM, not just Firestore rules.
4. **Rate-limit by IP and phone hash**, not just UID; anonymous UID is not a meaningful identity.

---

## 10. Jurisdictional / out-of-WA bookings (LOW–MEDIUM)

### Finding

`data/suburbs.ts:15–350` lists locations from Perth CBD out to Kalgoorlie (595 km) and includes regional WA centres. CLAUDE.md describes scope as Perth, but the suburb list and travel-fee calculation reach across WA.

### Why this matters

- Local-government laws vary; some shires have adult-entertainment-specific laws.
- The further from Perth, the harder the safety/WHS posture is to honour (no nearby support, longer police response, fewer escalation options).

### Recommendation

Either (a) restrict bookings to the Perth metro area + a defined corridor, in code; or (b) document the additional safety controls for regional bookings (mandatory pair travel, advance check-in, local emergency contact).

---

## 11. 30-day remediation roadmap

### Week 1 — engage counsel and freeze risk-bearing copy

- [ ] Brief a WA solicitor experienced in adult-industry and privacy law. Provide this document.
- [ ] Withdraw the `show-fisting-squirting`, `show-works-greek`, and any other SKU with penetrative-sex-act descriptors from the public catalogue (`data/mockData.ts`) pending review. Behind a feature flag is fine.
- [ ] Sweep production copy for "demo" / "simulation" wording (FAQ.tsx particularly).
- [ ] Take the in-repo Privacy Policy offline (replace with a holding "under review" page) given the gov-ID contradiction is a per-se misrepresentation.

### Week 2 — engineering controls

- [ ] Server-side age assertion: persist customer DOB hash on `customers/{uid}`, gate booking callable on `dob` indicating 18+.
- [ ] Move DNS check error copy from silent fail to a structured "contact us / quote reference" message.
- [ ] Split transactional vs marketing message paths; require marketing consent for the marketing class.
- [ ] Add `messageClass` tag to every template and a sender-ID line.
- [ ] Land Firestore security rules in the repo.

### Week 3 — policy & documents

- [ ] Re-publish Privacy Policy matching actual collection; add APP-5 collection notice in booking flow.
- [ ] Publish Terms of Service rewrite (deposit, refund, ACL carve-out, performer contract reference, jurisdiction).
- [ ] Publish DNS policy (grounds, evidence, review, appeal, deletion).
- [ ] Publish breach-response runbook (`docs/breach-response.md`).
- [ ] Performer-side contract executed at the `awaiting_contract` step.

### Week 4 — operational and commercial

- [ ] AML/CTF decision: re-architect payments to performer-direct, OR begin AUSTRAC registration.
- [ ] WorkCover decision and policy if required.
- [ ] GST registration if forecast turnover ≥ $75k.
- [ ] First DNS-list review meeting; record minutes.
- [ ] Schedule annual review of this document (next: 2027-05-17, or sooner on material product change).

---

## 12. Open questions for counsel

1. Status of the WA *Sex Work Decriminalisation Bill* and its effect on third-party-benefit / procurement offences as applied to a digital booking platform.
2. Whether the *Online Safety Act 2021* Phase-2 industry codes require the platform to implement age assurance at the *catalogue browsing* layer or only at the *transaction* layer.
3. Confirmation of AML/CTF designated-service classification given the deposit-then-settle flow.
4. Confirmation of performer worker classification under post-*Personnel Contracting* tests, given the specific operational facts.
5. Whether HMAC-hashed contact data on the DNS register is "personal information" within the APP definition (and, if so, the APP-12 access protocol).
6. Defamation exposure of free-text reasons on DNS entries; whether a controlled-vocabulary reason set would mitigate.
7. Whether the platform is exposed under the *Modern Slavery Act 2018* (Cth) reporting threshold and, irrespective of threshold, its supply-chain due-diligence obligations to performers.

---

*End of assessment.*
