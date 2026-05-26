"use client";

import { createContext, useContext, useState, useCallback } from "react";

type SaveState = {
  saving: boolean;
  saved: boolean;
};

type ProfileSaveContextType = {
  registerSave: (fn: () => void) => void;
  unregisterSave: () => void;
  triggerSave: () => void;
  saveState: SaveState;
  setSaveState: (s: SaveState) => void;
  hasSaveHandler: boolean;
};

const ProfileSaveContext = createContext<ProfileSaveContextType | null>(null);

export function ProfileSaveProvider({ children }: { children: React.ReactNode }) {
  const [saveHandler, setSaveHandler] = useState<(() => void) | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ saving: false, saved: false });

  const registerSave = useCallback((fn: () => void) => {
    setSaveHandler(() => fn);
  }, []);

  const unregisterSave = useCallback(() => {
    setSaveHandler(null);
    setSaveState({ saving: false, saved: false });
  }, []);

  const triggerSave = useCallback(() => {
    saveHandler?.();
  }, [saveHandler]);

  return (
    <ProfileSaveContext.Provider value={{
      registerSave,
      unregisterSave,
      triggerSave,
      saveState,
      setSaveState,
      hasSaveHandler: saveHandler !== null,
    }}>
      {children}
    </ProfileSaveContext.Provider>
  );
}

export function useProfileSave() {
  const ctx = useContext(ProfileSaveContext);
  if (!ctx) throw new Error("useProfileSave must be used within ProfileSaveProvider");
  return ctx;
}
