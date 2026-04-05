export type WalkthroughStep = {
  id: string;
  targetId: string;
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  path?: string; 
  action?: 'click' | 'upload' | 'input' | 'move';
  actionLabel?: string;
  isOptional?: boolean;
};

export interface WalkthroughContextType {
  isActive: boolean;
  currentStepIndex: number;
  steps: WalkthroughStep[];
  startTour: () => void;
  stopTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  hasSeenOnboarding: boolean;
  completeAction: (action: string) => void;
  setHasSeenOnboarding: (val: boolean) => void;
  openWelcome: () => void;
}
