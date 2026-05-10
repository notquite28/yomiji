import * as SecureStore from 'expo-secure-store';

const API_TOKEN_KEY = 'wanikaniApiToken';

export async function getApiToken() {
  return SecureStore.getItemAsync(API_TOKEN_KEY);
}

export async function saveApiToken(token: string) {
  await SecureStore.setItemAsync(API_TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function deleteApiToken() {
  await SecureStore.deleteItemAsync(API_TOKEN_KEY);
}
