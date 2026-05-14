import { isTauri } from './runtime';

export interface KVStore {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

class WebKVStore implements KVStore {
  async get<T>(key: string): Promise<T | null> {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  }
}

class TauriKVStore implements KVStore {
  private storePromise: Promise<{
    get<T>(key: string): Promise<T | undefined>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<boolean>;
    save(): Promise<void>;
  }> | null = null;

  private getStore() {
    if (!this.storePromise) {
      this.storePromise = (async () => {
        const { Store } = await import('@tauri-apps/plugin-store');
        return await Store.load('app.json');
      })();
    }
    return this.storePromise;
  }

  async get<T>(key: string): Promise<T | null> {
    const store = await this.getStore();
    const v = await store.get<T>(key);
    return v ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const store = await this.getStore();
    await store.set(key, value);
    await store.save();
  }

  async remove(key: string): Promise<void> {
    const store = await this.getStore();
    await store.delete(key);
    await store.save();
  }
}

export const kvstore: KVStore = isTauri() ? new TauriKVStore() : new WebKVStore();
