import { useState } from 'react';

export interface CoachMarkStep {
    targetId?:   string;
    title:       string;
    description: string;
    position?:   'top' | 'bottom' | 'left' | 'right' | 'center';
}

interface UseCoachMarkProps {
    steps:      CoachMarkStep[];
    storageKey: string;
}

export function useCoachMark({ steps, storageKey }: UseCoachMarkProps) {
    const [step, setStep] = useState(0);
    const [isActive, setIsActive] = useState(() => {
        return !localStorage.getItem(storageKey);
    });

    const totalSteps = steps.length;
    const currentStep = isActive ? steps[step] : null;

    const next = () => {
        if (step >= totalSteps - 1) {
            skip();
        } else {
            setStep(s => s + 1);
        }
    };

    const prev = () => {
        if (step > 0) setStep(s => s - 1);
    };

    const skip = () => {
        setIsActive(false);
        localStorage.setItem(storageKey, 'done');
    };

    const restart = () => {
        localStorage.removeItem(storageKey);
        setStep(0);
        setIsActive(true);
    };

    return { step, isActive, currentStep, next, prev, skip, restart, totalSteps };
}