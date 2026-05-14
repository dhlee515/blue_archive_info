import { isTauri as isTauriCore } from '@tauri-apps/api/core';

export const isTauri = (): boolean => isTauriCore();
