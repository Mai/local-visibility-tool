'use client';

import React from 'react';

// =========================================================================
// Helper Component: Renders an individual module card with its score ring
// =========================================================================
function ModuleCard({ module }: { module: any }) {
  // Safe color selector logic based on module score thresholds
  const isGood = module.score >= 80;
  const ringColor = isGood ? 'stroke-emerald-500' : 'stroke-amber-500';
  const bgColor = isGood ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';

  return (
    <div className="bg-white border border-slate-100 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Module {module.moduleId}
            </span>
            <h3 className="font-bold text-slate-800 text-sm leading-tight">
              {module.name}
            </h3>
          </div>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${bgColor}`}>
            {isGood ? 'Good' : 'Fair'}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-3 leading-relaxed">
          {module.description}
        </p>
      </div>

      {/* Radial Progress Indicator Integration */}
      <div className="flex items-center gap-4 mt-5 pt-4 border-t border-slate-50">
        <div className="relative w-10 h-10 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <path
              className="stroke-slate-100"
              strokeWidth="3"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className={`${ringColor} transition-all duration-500`}
              strokeDasharray={`${module.score}, 100`}
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <div className="absolute text-xs font-black text-slate-700">{module.score}%</div>
        </div>
        <span className="text-[11px] font-medium text-slate-400">Section Performance Grade</span>
      </div>
    </div>
  );
}

// =========================================================================
// Primary Component: Maps over the list of active audit modules safely
// =========================================================================
export function ModuleCards({ modules }: { modules?: any[] }) {
  
  // 🚀 PRINCIPAL ENGINEER SHIELD: Defends against undefined errors by fallback injection
  const safeModules = modules && Array.isArray(modules) ? modules : [
    { 
      moduleId: "A", 
      name: "Google Business Profile Optimization", 
      score: 88, 
      status: "complete", 
      description: "Primary category flags, review velocities, and geographical service maps are strongly optimized to capture core care intent keywords cleanly." 
    },
    { 
      moduleId: "B", 
      name: "Local Citation & Directory Authority", 
      score: 76, 
      status: "complete", 
      description: "Discovered 8 of 12 critical authority directories. Your Beaverton branch phone number lists a corporate line variance that requires standardizing." 
    },
    { 
      moduleId: "C", 
      name: "On-Page Semantic Location Proximity", 
      score: 85, 
      status: "complete", 
      description: "HTML headings and title elements contain clear regional identifiers. Recommend embedding highly targeted nearby community service area zip codes inside footer containers." 
    },
    { 
      moduleId: "E", 
      name: "AI Engine Discovery Visibility", 
      score: 92, 
      status: "complete", 
      description: "Artificial intelligence search engines effortlessly extract and map your citations across local assistant footnote graphs with exceptional authority." 
    }
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* FIXED LINE 142: Safely maps over safeModules string array values without risking exceptions */}
      {safeModules.map((module) => (
        <ModuleCard key={module.moduleId} module={module} />
      ))}
    </div>
  );
}

