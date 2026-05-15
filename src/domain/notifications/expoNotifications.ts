/**
 * Lazy wrapper around `expo-notifications` that avoids loading the module in
 * Expo Go, where push-notification auto-initialization crashes on Android
 * (SDK 53+ removed push support from Expo Go).
 *
 * In a development build or production, the module is loaded normally.
 * All notification code should import from this wrapper instead of directly
 * from `expo-notifications`.
 */
import Constants from "expo-constants";
import type * as Notifications from "expo-notifications";

const isExpoGo = Constants.executionEnvironment === "storeClient";

let _module: typeof Notifications | null = null;
let _loadAttempted = false;

function loadModule(): typeof Notifications | null {
	if (isExpoGo) return null;
	if (_loadAttempted) return _module;
	_loadAttempted = true;
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		_module = require("expo-notifications");
	} catch {
		_module = null;
	}
	return _module;
}

// Re-export enums/constants (resolved at load time — null in Expo Go).
export const SchedulableTriggerInputTypes =
	loadModule()?.SchedulableTriggerInputTypes;
export const AndroidImportance = loadModule()?.AndroidImportance;
export const IosAuthorizationStatus = loadModule()?.IosAuthorizationStatus;
export const DEFAULT_ACTION_IDENTIFIER =
	loadModule()?.DEFAULT_ACTION_IDENTIFIER;

// ---------------------------------------------------------------------------
// Proxy functions — safe to call in any environment (no-op in Expo Go)
// ---------------------------------------------------------------------------

export function setNotificationHandler(
	handler: Notifications.NotificationHandler,
): void {
	loadModule()?.setNotificationHandler?.(handler);
}

export async function getPermissionsAsync(): Promise<Notifications.NotificationPermissionsStatus> {
	const mod = loadModule();
	if (!mod) {
		return {
			granted: false,
			canAskAgain: true,
			expires: "never",
		} as Notifications.NotificationPermissionsStatus;
	}
	return mod.getPermissionsAsync();
}

export async function requestPermissionsAsync(
	options?: Notifications.NotificationPermissionsRequest,
): Promise<Notifications.NotificationPermissionsStatus> {
	const mod = loadModule();
	if (!mod) {
		return {
			granted: false,
			canAskAgain: false,
			expires: "never",
		} as Notifications.NotificationPermissionsStatus;
	}
	return mod.requestPermissionsAsync(options);
}

export async function scheduleNotificationAsync(
	request: Notifications.NotificationRequestInput,
): Promise<string> {
	const mod = loadModule();
	if (!mod) return "";
	return mod.scheduleNotificationAsync(request);
}

export async function cancelScheduledNotificationAsync(
	identifier: string,
): Promise<void> {
	const mod = loadModule();
	if (!mod) return;
	return mod.cancelScheduledNotificationAsync(identifier);
}

export async function cancelAllScheduledNotificationsAsync(): Promise<void> {
	const mod = loadModule();
	if (!mod) return;
	return mod.cancelAllScheduledNotificationsAsync();
}

export async function getAllScheduledNotificationsAsync(): Promise<
	Notifications.NotificationRequest[]
> {
	const mod = loadModule();
	if (!mod) return [];
	return mod.getAllScheduledNotificationsAsync();
}

export async function setBadgeCountAsync(count: number): Promise<boolean> {
	const mod = loadModule();
	if (!mod) return false;
	return mod.setBadgeCountAsync(count);
}

export async function getBadgeCountAsync(): Promise<number> {
	const mod = loadModule();
	if (!mod) return 0;
	return mod.getBadgeCountAsync();
}

export async function setNotificationChannelAsync(
	channelId: string,
	channel: Notifications.NotificationChannelInput,
): Promise<Notifications.NotificationChannel | null> {
	const mod = loadModule();
	if (!mod) return null;
	return mod.setNotificationChannelAsync(channelId, channel);
}

export function addNotificationResponseReceivedListener(
	listener: (event: Notifications.NotificationResponse) => void,
): { remove: () => void } {
	const mod = loadModule();
	if (!mod) return { remove() {} };
	return mod.addNotificationResponseReceivedListener(listener);
}

export function getLastNotificationResponse(): Notifications.NotificationResponse | null {
	const mod = loadModule();
	if (!mod) return null;
	return mod.getLastNotificationResponse();
}

export function clearLastNotificationResponse(): void {
	loadModule()?.clearLastNotificationResponse?.();
}
