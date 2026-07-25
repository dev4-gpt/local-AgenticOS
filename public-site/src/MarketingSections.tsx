import type { FormEvent, MouseEvent } from "react";
import { jumpTo } from "./jumpTo";

const jump = (id: string) => (event: MouseEvent) => { event.preventDefault(); jumpTo(id); };

interface EngagementSectionProps {
  notice: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function MethodSection() {
  return <section id="method" className="method"><p className="eyebrow">90 days, deliberately staged</p><h2>We do not drop a dashboard into your team and call it transformation.</h2><div className="method-grid"><article><span>01</span><h3>Foundation</h3><p>Audit the process, capture the context, define the narrative, and agree the approval rhythm.</p></article><article><span>02</span><h3>Delivery system</h3><p>Build the intake, research, web/content handoffs, reusable prompts, and review gates around real work.</p></article><article><span>03</span><h3>Market readiness</h3><p>Turn the system into content, reporting, enablement, and a documented post-pilot operating plan.</p></article></div></section>;
}

export function ProofSection() {
  return <section className="proof"><div><p className="eyebrow">The boundary is part of the product</p><h2>Private execution. Visible outcomes.</h2><p>Veloce AgenticOS keeps agent controls, vaults, files, credentials, and execution APIs private. Clients receive approved deliverables, decisions, reporting, and training.</p></div><ul><li><b>Local / free</b><span>Drafting, restructuring, internal preparation</span></li><li><b>Value cloud</b><span>Approved research, strategy, normal production</span></li><li><b>Premium cloud</b><span>Final synthesis, difficult reasoning, quality review</span></li></ul></section>;
}

export function PricingSection() {
  return <section id="investment" className="pricing"><p className="eyebrow">Starting points, not a promise of unlimited AI</p><h2>Choose the operating depth the work deserves.</h2><div className="founding-offer"><p className="founding-offer-eyebrow">Founding client offer — 5 seats</p><div className="founding-offer-row"><div><h3>$600<small> / month</small></h3><p>Full engagement, not a reduced tier — the same real work as the plans below. Price locked for your first 3 months.</p></div><a className="primary" href="#engage" onClick={jump("engage")}>Claim a founding seat <b>→</b></a></div><p className="founding-offer-note">Open to the first 5 clients while we build out case studies. After 3 months, or once the 5 seats are filled, pricing moves to the standard plans below — already-founding clients keep their rate.</p></div><div className="price-grid"><article><p>Workflow foundation</p><h3>$2,500 <small>setup</small></h3><b>+ $1,250 / month</b><span>One high-value workflow, private knowledge foundation, monthly optimization.</span></article><article className="featured"><p>Agency delivery OS</p><h3>$5,000 <small>setup</small></h3><b>+ $2,500 / month</b><span>End-to-end delivery system, website/content workflow, weekly operating rhythm.</span></article><article><p>Growth operations OS</p><h3>From $10,000</h3><b>+ $4,000 / month</b><span>Multiple workflows, teams, integrations, reporting, and leadership cadence.</span></article></div><p className="price-note">Third-party usage is isolated, capped, visible, and approved before overage. We do not sell “unlimited AI.”</p></section>;
}

export function EngagementSection({ notice, onSubmit }: EngagementSectionProps) {
  return <section id="engage" className="engage"><div><p className="eyebrow">Start with the real work</p><h2>Where does valuable context disappear between strategy, design, build, and growth?</h2><p>Tell us the handoff that currently costs your team the most. We will determine whether a Veloce engagement is the right answer.</p></div><form onSubmit={onSubmit}><label>Full name<input name="name" required autoComplete="name" /></label><label>Work email<input name="email" required type="email" autoComplete="email" /></label><label>Company<input name="company" required autoComplete="organization" /></label><label className="wide">The handoff you want to make repeatable<textarea name="challenge" required rows={4} placeholder="For example: turning a strong strategy process into a faster website and content delivery system." /></label><button className="primary" type="submit">Copy brief and contact Veloce <b>→</b></button><p aria-live="polite">{notice || "No form data is stored on this public site. Do not include confidential information."}</p></form></section>;
}

export function LegalSection() {
  return <section className="legal" aria-label="Privacy, terms, and security"><div><p className="eyebrow">Public boundary</p><h2>Clear before the first conversation.</h2></div><div className="legal-grid"><article id="privacy"><h3>Privacy</h3><p>This site uses no analytics cookies and stores no form submissions. A discovery brief stays in your browser until you choose an external contact route. Do not submit confidential, regulated, or client-identifying information.</p></article><article id="terms"><h3>Terms</h3><p>Site content is informational. Prices are starting points, not binding quotes. Scope, deliverables, model allowance, confidentiality, payment, and case-study permission are agreed in a signed proposal before work begins.</p></article><article id="security"><h3>Security</h3><p>This public experience contains no local dashboard, agent execution, provider credentials, vault data, or client workspace. The private Veloce runtime is not exposed through this site.</p></article></div></section>;
}

export function SiteFooter() {
  return <footer><a className="mark" href="#top" onClick={jump("top")}>Veloce <em>AgenticOS</em></a><p>Managed systems for work that should compound.</p><nav aria-label="Legal links"><a href="#privacy" onClick={jump("privacy")}>Privacy</a><a href="#terms" onClick={jump("terms")}>Terms</a><a href="#security" onClick={jump("security")}>Security</a></nav><a href="#engage" onClick={jump("engage")}>Start a conversation ↗</a></footer>;
}
