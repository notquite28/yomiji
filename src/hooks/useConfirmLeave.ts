import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { NavigationProp } from '@react-navigation/native';

/**
 * Shared back-navigation confirmation logic for session screens (reviews, lessons).
 *
 * Handles:
 * - Custom "Back" button press → shows ConfirmLeaveBanner when session is active
 * - System back gesture / hardware back button → intercepts via beforeRemove, shows banner
 * - Confirm → sets allowLeaving flag and navigates back
 * - Cancel → dismisses banner, cancels pending system back action
 *
 * On Android, when a system back gesture is intercepted, the stored navigation action
 * is re-dispatched on confirm to preserve the predictive back gesture animation.
 * On iOS, navigation.goBack() is always used since there is no stored gesture action.
 */
export function useConfirmLeave(
  navigation: NavigationProp<Record<string, object | undefined>>,
  shouldConfirm: boolean,
) {
  const allowLeavingRef = useRef(false);
  const navigatingRef = useRef(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const pendingBackAction = useRef<Readonly<{
    type: string;
    payload?: object;
    source?: string;
    target?: string;
  }> | null>(null);

  // When shouldConfirm changes to false while the banner is visible,
  // auto-dismiss the banner — the session is no longer active.
  useEffect(() => {
    if (!shouldConfirm && confirmLeave) {
      navigatingRef.current = false;
      setConfirmLeave(false);
      pendingBackAction.current = null;
    }
  }, [shouldConfirm, confirmLeave]);

  const handleBack = useCallback(() => {
    if (!shouldConfirm) {
      navigation.goBack();
      return;
    }
    setConfirmLeave(true);
  }, [navigation, shouldConfirm]);

  const handleCancelLeave = useCallback(() => {
    navigatingRef.current = false;
    setConfirmLeave(false);
    pendingBackAction.current = null;
  }, []);

  const handleConfirmLeave = useCallback(() => {
    // Guard against rapid double-tap
    if (navigatingRef.current) return;
    navigatingRef.current = true;

    allowLeavingRef.current = true;
    setConfirmLeave(false);

    if (Platform.OS === 'android' && pendingBackAction.current !== null) {
      navigation.dispatch(pendingBackAction.current);
    } else {
      navigation.goBack();
    }
  }, [navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (!shouldConfirm || allowLeavingRef.current) {
        return;
      }

      event.preventDefault();
      pendingBackAction.current = event.data.action;
      setConfirmLeave(true);
    });

    return unsubscribe;
  }, [navigation, shouldConfirm]);

  return {
    confirmLeave,
    allowLeavingRef,
    handleBack,
    handleCancelLeave,
    handleConfirmLeave,
  } as const;
}
