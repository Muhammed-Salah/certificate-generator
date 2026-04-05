'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { WalkthroughStep, WalkthroughContextType } from './types';
import { WalkthroughUI } from './WalkthroughUI';

const WalkthroughContext = createContext<WalkthroughContextType | undefined>(undefined);

import { useRouter, usePathname } from 'next/navigation';

const STEPS: WalkthroughStep[] = [
  {
    id: 'welcome',
    targetId: 'logo-section',
    title: 'Ready for a tour?',
    content: "We'll show you how to generate bulk certificates in just 3 easy steps. Let's start with your templates.",
    position: 'right'
  },
  {
    id: 'templates-nav',
    targetId: 'templates-nav',
    title: '1. Access Templates',
    content: "Your design journey starts here. Click to see your collection.",
    position: 'right',
    action: 'click',
    actionLabel: 'Click Templates'
  },
  {
    id: 'upload-first',
    path: '/dashboard/templates',
    targetId: 'btn-upload-template',
    title: '2. Upload your Design',
    content: "Upload a high-fidelity PNG or PDF template. Your branding, your style.",
    position: 'bottom',
    action: 'upload',
    actionLabel: 'Upload Template'
  },
  {
    id: 'configure-fields',
    targetId: 'canvas-section',
    title: '3. Strategic Placement',
    content: "Drag the dot for Name and Date to their perfect positions on your certificate.",
    position: 'bottom',
    action: 'click',
    actionLabel: 'Position Fields'
  },
  {
    id: 'save-config',
    targetId: 'btn-save-config',
    title: '4. Save your Design',
    content: "Once you are satisfied with the placement, click Save & Return to lock in your configuration.",
    position: 'right',
    action: 'click',
    actionLabel: 'Save & Return'
  },
  {
    id: 'generate-nav',
    targetId: 'generate-nav',
    title: '5. Final Generation',
    content: "Once you're satisfied, click here to choose your recipients and generate in bulk.",
    position: 'right',
    action: 'click',
    actionLabel: 'Go to Generate'
  }
];

const ENABLE_WALKTHROUGH = false;

export function WalkthroughProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(true); // Loading state
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();

  const [suppressNavigation, setSuppressNavigation] = useState(false);

  useEffect(() => {
    if (!ENABLE_WALKTHROUGH) return;
    async function loadOnboardingStatus() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const localStatus = localStorage.getItem(`onboarding_seen_${user.id}`);
      if (localStatus === 'true') {
        setHasSeenOnboarding(true);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('has_seen_onboarding')
        .eq('id', user.id)
        .single();

      if (profile) setHasSeenOnboarding(profile.has_seen_onboarding);
      else setHasSeenOnboarding(false);
    }
    loadOnboardingStatus();
  }, [supabase]);

  // Handle automatic trigger for new users
  useEffect(() => {
    if (!hasSeenOnboarding && !isActive && !showWelcome) {
      const timer = setTimeout(() => setShowWelcome(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [hasSeenOnboarding, isActive, showWelcome]);

  const currentStep = STEPS[currentStepIndex];

  /* ─── Auto-Navigation ─── */
  useEffect(() => {
     if (isActive && !suppressNavigation && currentStep.path && pathname !== currentStep.path) {
        router.push(currentStep.path);
     }
  }, [isActive, currentStepIndex, pathname, currentStep, router, suppressNavigation]);

  const startTour = () => {
    setCurrentStepIndex(0);
    setShowWelcome(false);
    setIsActive(true);
  };

  const stopTour = () => setIsActive(false);

  const openWelcome = () => {
    setIsActive(false);
    setShowWelcome(true);
  };

  const nextStep = () => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStepIndex(p => p + 1);
    } else {
      finishTour();
    }
  };

  const completeAction = (actionId: string) => {
    if (!isActive) return;
    if (currentStep.id === actionId) {
      // Temporarily pause auto-navigation to let app redirects finish
      setSuppressNavigation(true);
      setTimeout(() => setSuppressNavigation(false), 500);
      nextStep();
    }
  };

  const prevStep = () => {
    if (currentStepIndex > 0) setCurrentStepIndex(p => p - 1);
  };

  const finishTour = async () => {
    setIsActive(false);
    setShowWelcome(false);
    setHasSeenOnboarding(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      localStorage.setItem(`onboarding_seen_${user.id}`, 'true');
      await supabase.from('profiles').upsert({ id: user.id, has_seen_onboarding: true });
    }
  };

  return (
    <WalkthroughContext.Provider value={{
      isActive,
      currentStepIndex,
      steps: STEPS,
      startTour,
      stopTour,
      nextStep,
      prevStep,
      hasSeenOnboarding,
      completeAction,
      setHasSeenOnboarding: finishTour,
      openWelcome
    }}>
      {children}
      <WalkthroughUI showWelcome={showWelcome} setShowWelcome={setShowWelcome} />
    </WalkthroughContext.Provider>
  );
}

export const useWalkthrough = () => {
  const context = useContext(WalkthroughContext);
  if (!context) throw new Error('useWalkthrough must be used within a WalkthroughProvider');
  return context;
};
