import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useMemo,
  useRef,
} from 'react';
import { call } from '@decky/api';
import debounce from 'just-debounce';

import log from '../utils/log';

export const SettingsContext = createContext({});

type SettingsContextType = {
  set: (key: any, value: any, immediate?: boolean) => void;
  get: (key: any, fallback: any) => Promise<any>;
  settings: any;
};

export const SettingsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  // Per-key debounced savers so 'squares' and 'filters_grid_p'
  // never cancel each other's timers.
  const debouncedSavers = useRef<Record<string, ReturnType<typeof debounce>>>({});

  const save = async (key: any, value: any) => {
    log('writing setting', key, value);
    await call('set_setting', key, value);
  };

  // Lazily create one debounced saver per key and cache it.
  const getDebouncedSaver = (key: string) => {
    if (!debouncedSavers.current[key]) {
      debouncedSavers.current[key] = debounce(save, 1500);
    }
    return debouncedSavers.current[key];
  };

  const set = useMemo(
    () =>
      (key: any, value: any, immediate = false) => {
        if (immediate) {
          // Call directly — no state, no useEffect, no overwrite race.
          return save(key, value);
        }
        // Each key gets its own timer; they can't clobber each other.
        return getDebouncedSaver(key)(key, value);
      },
    []
  ) as SettingsContextType['set'];

  const get: SettingsContextType['get'] = useMemo(
    () => async (key, fallback) => {
      return await call('get_setting', key, fallback);
    },
    []
  );

  return (
    <SettingsContext.Provider value={{ set, get }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => useContext(SettingsContext) as SettingsContextType;

export default useSettings;