'use client';

import React from 'react';

// Common sub-utility card layout element
function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={`bg-white border border-slate-100 rounded-2xl p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// 1. Primary Export: Handles unverifiable local matching checks
export function UnavailableChecksPanel({ checks }: { checks?: any[] }) {
  const safeChecks = checks && Array.isArray(checks) ? checks : [];

  if (!safeChecks.length) {
    return (
      <Card className="border border-dashed border-slate-200 bg-slate-50/50">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Additional Profile Diagnostics</h3>
        <div className="text-sm font-semibold text-slate-700 mt-2">All foundational verification checkpoints resolved cleanly.</div>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">No automated local routing anomalies were flagged across the target index maps for this crawling pass cycle.</p>
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <h3 className="text-sm font-bold text-slate-800">Unverifiable Local Signals</h3>
      <ul className="mt-3 divide-y divide-slate-100 text-xs text-slate-600">
        {safeChecks.map((check, index) => (
          <li key={index} className="py-2.5 flex justify-between">
            <span>{check.title || 'Diagnostic Pass'}</span>
            <span className="text-amber-600 font-bold">{check.status || 'Pending Verification'}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// 2. RESTORED EXPORT: Satisfies the GlossaryPanel import on line 17
export function GlossaryPanel() {
  return (
    <Card className="mt-6">
      <h3 className="text-sm font-bold text-slate-800 border-b border-slate-50 pb-2">Local SEO Glossary Reference</h3>
      <div className="mt-3 space-y-3 text-xs">
        <div>
          <span className="font-bold text-slate-700 block">NAP Consistency:</span>
          <span className="text-slate-500 text-xs">The uniformity of your Business Name, Address, and Phone number across every search index map profile.</span>
        </div>
        <div>
          <span className="font-bold text-slate-700 block">Organic Citation Signal:</span>
          <span className="text-slate-500 text-xs">A local footnote reference string on directories that tells search engine crawls your location footprint is valid.</span>
        </div>
      </div>
    </Card>
  );
}

// 3. RESTORED EXPORT: Satisfies the WarningsPanel import on line 17
export function WarningsPanel({ warnings }: { warnings?: any[] }) {
  const safeWarnings = warnings && Array.isArray(warnings) ? warnings : [];

  return (
    <Card className="mt-6 border-amber-100 bg-amber-50/20">
      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
        <span>⚠️</span> Profiles Alerts Tracker
      </h3>
      <div className="text-xs text-slate-500 mt-2 leading-relaxed">
        {safeWarnings.length === 0 ? (
          "No critical category flags or verification suspensions detected across your primary map nodes."
        ) : (
          <ul className="list-disc pl-4 space-y-1">
            {safeWarnings.map((w, i) => <li key={i}>{w.message || w}</li>)}
          </ul>
        )}
      </div>
    </Card>
  );
}

// Catch-all structural duplicate configuration wrapper mapping
export function HonestyPanels({ result }: { result: any }) {
  return (
    <div className="space-y-6">
      <UnavailableChecksPanel checks={result?.unavailableChecks} />
      <WarningsPanel warnings={result?.warnings} />
      <GlossaryPanel />
    </div>
  );
}

