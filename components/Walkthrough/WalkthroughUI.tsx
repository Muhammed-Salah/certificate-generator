'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useWalkthrough } from './WalkthroughProvider';
import { X, ChevronRight, ChevronLeft, Award } from 'lucide-react';

export function WalkthroughUI({ showWelcome, setShowWelcome }: { showWelcome: boolean, setShowWelcome: (val: boolean) => void }) {
  const { 
    isActive, 
    currentStepIndex, 
    steps, 
    stopTour, 
    nextStep, 
    prevStep, 
    startTour,
    hasSeenOnboarding,
    setHasSeenOnboarding,
    openWelcome
  } = useWalkthrough();

  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Track target element position
  useEffect(() => {
    if (!isActive) {
      setTargetRect(null);
      return;
    }

    const step = steps[currentStepIndex];
    const updatePosition = () => {
      const el = document.getElementById(step.targetId);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
        // Scroll into view if not visible
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
           el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        setTargetRect(null);
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);
    const interval = setInterval(updatePosition, 1000); 

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
      clearInterval(interval);
    };
  }, [isActive, currentStepIndex, steps]);

  if (!isActive && !showWelcome) return null;

  // --- 1. Welcome Modal (unchanged but stylized) ---
  if (showWelcome) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-ink-950/40 backdrop-blur-md">
        <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden max-w-md w-full border border-ink-100 animate-scale-up p-10 text-center">
            <div className="w-20 h-20 bg-accent-gold/10 rounded-[32px] flex items-center justify-center mx-auto mb-6">
              <Award size={40} className="text-accent-gold" />
            </div>
            <h2 className="text-3xl font-display font-medium text-ink-900 mb-3">Welcome to Certify</h2>
            <p className="text-ink-500 text-sm leading-relaxed mb-8">
              Take a 60-second interactive tour to master your boutique certificate design tools.
            </p>
            <div className="space-y-3">
              <button 
                onClick={() => { setShowWelcome(false); startTour(); }}
                className="btn-gold w-full py-4 text-sm font-bold rounded-2xl shadow-lg"
              >
                Start Interactive Tour
              </button>
              <button 
                onClick={() => { setShowWelcome(false); setHasSeenOnboarding(true); }}
                className="w-full text-ink-400 hover:text-ink-600 py-2 text-xs font-bold uppercase tracking-widest transition-colors"
              >
                Skip Onboarding
              </button>
            </div>
        </div>
      </div>
    );
  }

  // --- 2. Walkthrough Tour ---
  const currentStep = steps[currentStepIndex];
  const isActionRequired = !!currentStep.action;
  
  let tooltipStyle: React.CSSProperties = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  let arrowStyle: React.CSSProperties = { display: 'none' };

  if (targetRect) {
    const margin = 24;
    const padding = 24;
    const tooltipWidth = 340;
    const estimatedHeight = 200; 
    const vW = window.innerWidth;
    const vH = window.innerHeight;

    let targetX = targetRect.left + targetRect.width / 2;
    let targetY = targetRect.top + targetRect.height / 2;

    let pos = currentStep.position || 'bottom';

    // 1. Position Flipping
    if (pos === 'right' && targetRect.right + margin + tooltipWidth > vW - padding) pos = 'bottom';
    if (pos === 'left' && targetRect.left - margin - tooltipWidth < padding) pos = 'bottom';
    if (pos === 'bottom' && targetRect.bottom + margin + estimatedHeight > vH - padding) pos = 'top';
    if (pos === 'top' && targetRect.top - margin - estimatedHeight < padding) pos = 'bottom';

    // 2. Base Coordinates (Top-Left of Tooltip)
    let left = 0;
    let top = 0;
    let arrowL: string | number = '50%';
    let arrowT: string | number = '50%';
    let arrowR: string | number = 'auto';
    let arrowB: string | number = 'auto';
    let arrowRot = '0deg';

    if (pos === 'bottom') {
      left = targetX - tooltipWidth / 2;
      top = targetRect.bottom + margin;
      arrowT = '-10px'; arrowRot = '180deg';
    } else if (pos === 'top') {
      left = targetX - tooltipWidth / 2;
      top = targetRect.top - margin - estimatedHeight;
      arrowB = '-10px'; arrowT = 'auto'; arrowRot = '0deg';
    } else if (pos === 'left') {
      left = targetRect.left - margin - tooltipWidth;
      top = targetY - estimatedHeight / 2;
      arrowR = '-10px'; arrowL = 'auto'; arrowRot = '90deg';
    } else if (pos === 'right') {
      left = targetRect.right + margin;
      top = targetY - estimatedHeight / 2;
      arrowL = '-10px'; arrowRot = '-90deg';
    }

    // 3. Clamping
    const originalLeft = left;
    const originalTop = top;
    left = Math.max(padding, Math.min(vW - tooltipWidth - padding, left));
    top = Math.max(padding, Math.min(vH - estimatedHeight - padding, top));

    // 4. Arrow Alignment Adjustment
    if (pos === 'top' || pos === 'bottom') {
       const shift = originalLeft - left;
       const arrowLeftPercent = 50 + (shift / tooltipWidth * 100);
       arrowL = `${Math.max(10, Math.min(90, arrowLeftPercent))}%`;
    } else {
       const shift = originalTop - top;
       const arrowTopPercent = 50 + (shift / estimatedHeight * 100);
       arrowT = `${Math.max(10, Math.min(90, arrowTopPercent))}%`;
    }

    tooltipStyle = { top: `${top}px`, left: `${left}px`, transform: 'none' };
    arrowStyle = { top: arrowT, left: arrowL, right: arrowR, bottom: arrowB, transform: `translateX(-50%) rotate(${arrowRot})`, borderBottom: '10px solid white' };
    if (pos === 'left' || pos === 'right') arrowStyle.transform = `translateY(-50%) rotate(${arrowRot})`;
  }

  const isConfigStep = currentStep.id === 'configure-fields';

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
      {/* 1. Backdrop with Rounded Rect Hole (Hidden for config step) */}
      {!isConfigStep && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-500">
          <defs>
            <mask id="spotlight-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {targetRect && (
                <rect 
                  x={targetRect.left - 8} 
                  y={targetRect.top - 8} 
                  width={targetRect.width + 16} 
                  height={targetRect.height + 16} 
                  rx="16" 
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="rgba(6, 7, 9, 0.65)" mask="url(#spotlight-mask)" className="backdrop-blur-[2px]" />
        </svg>
      )}

      {/* 2. Interaction Blocker (Disabled for config step to allow dragging) */}
      {isActive && targetRect && !isConfigStep && (
        <div className="absolute inset-0 pointer-events-none z-[99]">
          <div className="absolute top-0 left-0 right-0 pointer-events-auto" style={{ height: targetRect.top - 8 }} />
          <div className="absolute bottom-0 left-0 right-0 pointer-events-auto" style={{ top: targetRect.bottom + 8 }} />
          <div className="absolute left-0 pointer-events-auto" style={{ top: targetRect.top - 8, bottom: window.innerHeight - targetRect.bottom - 8, width: targetRect.left - 8 }} />
          <div className="absolute right-0 pointer-events-auto" style={{ top: targetRect.top - 8, bottom: window.innerHeight - targetRect.bottom - 8, left: targetRect.right + 8 }} />
        </div>
      )}

      {/* 3. Pulse Aura */}
      {targetRect && (
        <div 
          className="absolute border-2 border-accent-gold rounded-[20px] pointer-events-none animate-ping-slow"
          style={{
            top: targetRect.top - 12,
            left: targetRect.left - 12,
            width: targetRect.width + 24,
            height: targetRect.height + 24,
          }}
        />
      )}

      {/* 4. Tooltip Card */}
      <div 
        ref={tooltipRef}
        style={tooltipStyle}
        className="absolute z-[110] w-[340px] bg-white rounded-[32px] shadow-high p-8 pointer-events-auto animate-scale-up"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="px-2.5 py-1 rounded-full bg-accent-gold/10 text-[9px] font-bold text-accent-gold uppercase tracking-widest">Step {currentStepIndex + 1}</div>
            {isActionRequired && <div className="px-2.5 py-1 rounded-full bg-ink-900 text-[9px] font-bold text-white uppercase tracking-widest animate-pulse">{isConfigStep ? 'Interactive Task' : 'Required Task'}</div>}
          </div>
          <button 
            onClick={() => {
               stopTour(); 
               setHasSeenOnboarding(true); 
            }} 
            className="text-ink-300 hover:text-ink-600 transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>
        
        <div className="space-y-3 mb-8">
          <h3 className="font-display text-xl text-ink-900 leading-tight">{currentStep.title}</h3>
          <p className="text-[13px] text-ink-500 leading-relaxed font-medium">{currentStep.content}</p>
        </div>

        <div className="flex items-center justify-between pt-2">
           <div className="flex gap-1.5">
            {steps.map((_, idx) => (
              <div key={idx} className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${idx === currentStepIndex ? 'bg-accent-gold w-5' : 'bg-ink-100'}`} />
            ))}
          </div>
          
          <div className="flex items-center gap-3">
             {(!isActionRequired || isConfigStep || currentStepIndex === steps.length - 1) && (
               <button 
                onClick={nextStep}
                className="btn-gold px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 shadow-sm"
               >
                 {currentStepIndex === steps.length - 1 ? 'Finish' : (isConfigStep ? 'Skip / Done' : 'Next')}
                 {currentStepIndex < steps.length - 1 && <ChevronRight size={16} />}
               </button>
             )}
          </div>
        </div>

        {isActionRequired && (
           <div className="mt-4 pt-4 border-t border-dotted border-ink-100 italic text-[11px] text-accent-gold text-center font-bold animate-pulse">
             {isConfigStep ? 'Tip: Drag dots to move them' : `Task: ${currentStep.actionLabel}`}
           </div>
        )}
      </div>
      
      <style jsx global>{`
        @keyframes ping-slow {
          0% { transform: scale(1); opacity: 0.8; }
          70%, 100% { transform: scale(1.1); opacity: 0; }
        }
        .animate-ping-slow { animation: ping-slow 2s infinite; }
        .animate-scale-up {
          animation: scaleUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes scaleUp {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
